#!/usr/bin/env python3
"""
Scraper für die Dokemtene auf der Website der DHBW Ravensburg
https://www.ravensburg.dhbw.de/service-einrichtungen/dokumente-downloads

Sie finden wie bei der sraper_kurse.py nirgends im Projekt einen Aufruf dieses Skripts,
weil es zyklisch vom System auf dem es läuft ausgeführt wird,
da es unnötig ist jedes mal die Dokumente neu zu laden wenn die Seite aufgerufen wird,
da sich die Dokumente nur selten ändern, 
und der Vorgang sowieso (abhänig von der Internetgeschwindigkeit) etwas länger dauert.
Das Programm lässt sich natürlich manuell noch ganz normal ausführen, falls sie es selbst testen möchten.
Im unwahrscheinlichen Fall dass die DHBW Ravensburg die Struktur ihrer Dokumentenseite verändert,
könnte dieses Skript fehlschlagen da es stark auf die aktuelle HTML-Struktur abgestimmt ist.
"""

from __future__ import annotations

import hashlib
import json
import os
import re
import subprocess
import sys
import time
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, Iterable, List, Optional, Set, Tuple
from urllib.parse import urljoin, urlparse

import requests
from bs4 import BeautifulSoup, Tag


BASE_URL = "https://www.ravensburg.dhbw.de/service-einrichtungen/dokumente-downloads"
SCRIPT_DIR = Path(__file__).resolve().parent
DATA_DIR = (SCRIPT_DIR / ".." / "data").resolve()
DOCUMENTS_DIR = DATA_DIR / "documents"
METADATA_FILE = DATA_DIR / "dokumente_metadata.json"

REQUEST_TIMEOUT = 45
HEAD_TIMEOUT = 20
REQUEST_DELAY_SECONDS = 0.12

USER_AGENT = (
	"Mozilla/5.0 (X11; Linux x86_64) "
	"AppleWebKit/537.36 (KHTML, like Gecko) "
	"Chrome/133.0.0.0 Safari/537.36"
)

DOCUMENT_EXTENSIONS = {
	".pdf",
	".doc",
	".docx",
	".dot",
	".dotx",
	".docm",
	".xls",
	".xlsx",
	".xlsm",
	".ppt",
	".pptx",
	".pptm",
	".odt",
	".ods",
	".odp",
	".rtf",
	".msg",
	".zip",
	".rar",
	".7z",
	".txt",
	".csv",
	".png",
	".jpg",
	".jpeg",
	".gif",
	".eps",
	".tif",
	".tiff",
}

NON_DOCUMENT_EXTENSIONS = {".htm", ".html", ".php", ".asp", ".aspx"}


@dataclass
class SourceDocument:
	entry_key: str
	url: str
	title: str
	description: str
	category_top: str
	category_sub: str


def nowIso() -> str:
	"""
	Gibt den aktuellen Zeitpunkt als ISO-8601 String in UTC zurück

	Returns:
		str: Aktueller UTC-Zeitpunkt im ISO-Format
	"""
	return datetime.now(timezone.utc).isoformat()


def attributeToText(value: object) -> str:
	"""
	Normalisiert ein Attribut aus BeautifulSoup zu einem String

	Args:
		value (object): Attributwert aus BeautifulSoup

	Returns:
		str: Normalisierter Stringwert des Attributs
	"""
	if value is None:
		return ""
	if isinstance(value, str):
		return value
	# BeautifulSoup liefert Attribute manchmal als Listen statt als String
	if isinstance(value, list):
		return " ".join(str(item) for item in value)
	return str(value)


def buildSession() -> requests.Session:
	"""
	Erstellt eine Requests-Session mit vordefiniertem User-Agent

	Returns:
		requests.Session: Konfigurierte HTTP-Session
	"""
	session = requests.Session()
	session.headers.update({"User-Agent": USER_AGENT})
	return session


def loadMetadata() -> Dict:
	"""
	Lädt die bestehende Metadaten-Datei aus dem Dateisystem

	Returns:
		Dict: Geladene Metadaten oder ein leeres Dictionary bei Fehlern
	"""
	if not METADATA_FILE.exists():
		return {}

	try:
		with METADATA_FILE.open("r", encoding="utf-8") as handle:
			data = json.load(handle)
			if isinstance(data, dict):
				return data
	except Exception as exc:
		print(f"Warnung: Metadaten konnten nicht geladen werden: {exc}")

	return {}


def saveMetadata(metadata: Dict) -> None:
	"""
	Speichert Metadaten als JSON in die zentrale Metadaten-Datei

	Args:
		metadata (Dict): Zu speichernde Metadatenstruktur

	Returns:
		None: Diese Funktion gibt keinen Wert zurück
	"""
	METADATA_FILE.parent.mkdir(parents=True, exist_ok=True)
	with METADATA_FILE.open("w", encoding="utf-8") as handle:
		json.dump(metadata, handle, indent=2, ensure_ascii=False)


def sanitizePathSegment(value: str, fallback: str) -> str:
	"""
	Bereinigt einen Text, damit er sicher als Pfadsegment nutzbar ist

	Args:
		value (str): Ursprünglicher Text für den Dateipfad
		fallback (str): Ersatzwert falls der bereinigte Text leer ist

	Returns:
		str: Bereinigtes Pfadsegment
	"""
	cleaned = (value or "").strip()
	cleaned = re.sub(r"[\x00-\x1f\x7f]", "", cleaned)
	cleaned = cleaned.replace("/", "-").replace("\\", "-")
	cleaned = re.sub(r"[<>:\"|?*]", "_", cleaned)
	cleaned = re.sub(r"\s+", " ", cleaned).strip(" .")
	return cleaned or fallback


def guessFilename(url: str, title: str) -> str:
	"""
	Leitet einen Dateinamen aus URL oder Titel ab

	Args:
		url (str): Dokument-URL
		title (str): Dokumenttitel als Fallback

	Returns:
		str: Bereinigter Dateiname
	"""
	parsed = urlparse(url)
	name = os.path.basename(parsed.path)
	if name:
		return sanitizePathSegment(name, "dokument")

	title_part = sanitizePathSegment(title, "dokument")
	return f"{title_part}.bin"


def makeEntryKey(url: str, title: str, category_top: str, category_sub: str) -> str:
	"""
	Erzeugt einen stabilen Schlüssel für einen Dokumenteintrag

	Args:
		url (str): Dokument-URL
		title (str): Dokumenttitel
		category_top (str): Oberkategorie des Dokuments
		category_sub (str): Unterkategorie des Dokuments

	Returns:
		str: SHA1-Hash als eindeutiger Eintragsschlüssel
	"""
	payload = "|".join([
		url.strip(),
		title.strip(),
		category_top.strip(),
		category_sub.strip(),
	])
	return hashlib.sha1(payload.encode("utf-8")).hexdigest()


def isDocumentUrl(url: str) -> bool:
	"""
	Prüft, ob eine URL wahrscheinlich auf ein Dokument zeigt

	Args:
		url (str): Zu prüfende URL

	Returns:
		bool: True bei Dokument-URL, sonst False
	"""
	parsed = urlparse(url)
	path = parsed.path.lower()

	extension = os.path.splitext(path)[1]
	if extension in NON_DOCUMENT_EXTENSIONS:
		return False
	if extension in DOCUMENT_EXTENSIONS:
		return True

	# Manche Downloads liegen ohne Datei-Endung im fileadmin Bereich
	if "/fileadmin/" in path:
		return True

	return False


def extractDescription(link: Tag) -> str:
	"""
	Extrahiert eine mögliche Beschreibung rund um einen Dokumentlink

	Args:
		link (Tag): Link-Element aus dem HTML-Dokument

	Returns:
		str: Gefundene Beschreibung oder ein leerer String
	"""
	li_parent = link.find_parent("li")
	if li_parent:
		# Beschreibungen stehen oft direkt im selben Listenblock
		desc_div = li_parent.find(class_=lambda cls: isinstance(cls, str) and "ce-uploads-description" in cls)
		if desc_div:
			return desc_div.get_text(" ", strip=True)

	# Fallback für Beschreibungen direkt nach dem Link
	next_desc = link.find_next_sibling(class_=lambda cls: isinstance(cls, str) and "ce-uploads-description" in cls)
	if next_desc:
		return next_desc.get_text(" ", strip=True)

	# Lliest den umgebenden Textblock
	parent = link.find_parent(["div", "p", "li"])
	if parent:
		text = parent.get_text(" ", strip=True)
		link_text = link.get_text(" ", strip=True)
		if link_text and link_text in text:
			remainder = text.split(link_text, 1)[1].strip()
			if 3 <= len(remainder) <= 500:
				return remainder

	return ""


def collectTabMapping(soup: BeautifulSoup) -> List[Tuple[str, str, bool]]:
	"""
	Liest die Tab-Struktur aus und markiert Bekanntmachungs-Tabs

	Args:
		soup (BeautifulSoup): Geparstes HTML der Seite

	Returns:
		List[Tuple[str, str, bool]]: Liste aus Tab-ID, Tab-Name und Bekanntmachungs-Flag
	"""
	mapping: List[Tuple[str, str, bool]] = []
	# Die Tab-Navigation bestimmt welche Inhalts-Panes durchsucht werden
	for li in soup.select("ul.nav.nav-tabs li.nav-link"):
		anchor = li.find("a")
		if not anchor:
			continue

		tab_target = attributeToText(anchor.get("data-href")).strip()
		if not tab_target.startswith("#"):
			continue

		tab_id = tab_target[1:]
		tab_label = anchor.get_text(" ", strip=True)
		li_id = attributeToText(li.get("id")).strip().lower()
		label_lower = tab_label.lower()
		is_bekanntmachung = (
			li_id == "bekanntmachungen"
			or "amtliche" in label_lower
			or "bekanntmach" in label_lower
		)
		# Bekanntmachungen werden bewusst ausgeschlossen
		mapping.append((tab_id, tab_label, is_bekanntmachung))

	return mapping


def nearestSubHeading(link: Tag, pane: Tag) -> str:
	"""
	Sucht die nächstgelegene vorherige Zwischenüberschrift für einen Link

	Args:
		link (Tag): Link-Element innerhalb eines Tabs
		pane (Tag): Tab-Container als Suchgrenze

	Returns:
		str: Gefundene Überschrift oder leerer String
	"""
	for previous in link.find_all_previous(["h2", "h3"]):
		if pane not in previous.parents and previous is not pane:
			continue
		heading = previous.get_text(" ", strip=True)
		if heading:
			return heading
	return ""


def isInternalDocumentsPage(url: str) -> bool:
	"""
	Prüft, ob eine URL auf die interne Dokumentenseite verweist

	Args:
		url (str): Zu prüfende URL

	Returns:
		bool: True wenn die URL zur internen Dokumentenseite gehört
	"""
	parsed = urlparse(url)
	return (
		parsed.netloc == "www.ravensburg.dhbw.de"
		and parsed.path.rstrip("/") == "/service-einrichtungen/dokumente-downloads"
	)


def extractDocumentsFromHtml(base_url: str, html: str) -> Tuple[List[SourceDocument], Set[str], Set[str]]:
	"""
	Extrahiert Dokumenteinträge und Folge-Links aus dem HTML einer Seite

	Args:
		base_url (str): Basis-URL zum Auflösen relativer Links
		html (str): HTML-Quelltext der Seite

	Returns:
		Tuple[List[SourceDocument], Set[str], Set[str]]:
			Gefundene Dokumente, erwartete Entry-Keys und zu crawelnde Folge-Links
	"""
	soup = BeautifulSoup(html, "html.parser")
	tab_mapping = collectTabMapping(soup)

	all_docs: Dict[str, SourceDocument] = {}
	expected_keys: Set[str] = set()
	follow_links: Set[str] = set()

	for tab_id, tab_label, is_bekanntmachung in tab_mapping:
		pane = soup.find("div", id=tab_id)
		if not isinstance(pane, Tag):
			continue

		if is_bekanntmachung:
			# Doffizielle Bekanntmachungen wird ignoriert da er nur für Stundenten und Duale Partner unwichtige Dokumente enthält
			continue

		top_category = tab_label.strip() or "Ohne Kategorie"

		for link in pane.find_all("a", href=True):
			href = attributeToText(link.get("href", "")).strip()
			if not href:
				continue

			if href.startswith(("#", "mailto:", "tel:", "javascript:")):
				continue

			absolute_url = urljoin(base_url, href)

			if isInternalDocumentsPage(absolute_url):
				parsed_internal = urlparse(absolute_url)
				# Nur Seiten mit Query-Parametern werden als Unterseiten weiterverfolgt
				if parsed_internal.query:
					follow_links.add(absolute_url)

			if not isDocumentUrl(absolute_url):
				continue

			# Titel wird bevorzugt aus dem Attribut gelesen, sonst aus dem Linktext
			title = attributeToText(link.get("title", "")).strip() or link.get_text(" ", strip=True)
			if not title:
				title = guessFilename(absolute_url, "Dokument")

			# Die Überschrift oberhalb des Links wird als Unterkategorie verwendet
			sub_category = nearestSubHeading(link, pane)
			if sub_category.lower().startswith("amtliche bekanntmach"):
				continue

			# Beschreibung und Eintragsschlüssel werden aus den gesammelten Daten gebaut
			description = extractDescription(link)
			entry_key = makeEntryKey(absolute_url, title, top_category, sub_category)
			expected_keys.add(entry_key)

			all_docs[entry_key] = SourceDocument(
				entry_key=entry_key,
				url=absolute_url,
				title=title,
				description=description,
				category_top=top_category,
				category_sub=sub_category,
			)

	return sorted(all_docs.values(), key=lambda item: item.entry_key), expected_keys, follow_links


def crawlAllDocuments(session: requests.Session, start_url: str) -> Tuple[List[SourceDocument], Set[str]]:
	"""
	Durchläuft die Dokumentenseiten rekursiv und sammelt alle Einträge

	Args:
		session (requests.Session): HTTP-Session für Seitenabrufe
		start_url (str): Start-URL für den Crawl

	Returns:
		Tuple[List[SourceDocument], Set[str]]: Alle gefundenen Dokumente und erwartete Entry-Keys
	"""
	queue: List[str] = [start_url]
	visited: Set[str] = set()
	all_docs: Dict[str, SourceDocument] = {}
	expected_keys: Set[str] = set()

	while queue:
		page_url = queue.pop(0)
		if page_url in visited:
			continue

		# Bereits besuchte Seiten werden nicht erneut verarbeitet
		visited.add(page_url)

		try:
			html = fetchPageHtml(session, page_url)
		except Exception as exc:
			print(f"Warnung: Seite konnte nicht geladen werden ({page_url}): {exc}")
			continue

		page_docs, page_expected, page_follow = extractDocumentsFromHtml(page_url, html)
		for doc in page_docs:
			all_docs[doc.entry_key] = doc
		expected_keys.update(page_expected)

		for next_url in sorted(page_follow):
			if next_url not in visited and next_url not in queue:
				queue.append(next_url)

		# Kleine Pause um Überlastung zu vermeiden
		time.sleep(REQUEST_DELAY_SECONDS)

	return sorted(all_docs.values(), key=lambda item: item.entry_key), expected_keys


def fetchPageHtml(session: requests.Session, url: str) -> str:
	"""
	Lädt den HTML-Quelltext einer Seite per GET-Anfrage

	Args:
		session (requests.Session): HTTP-Session für den Abruf
		url (str): URL der abzurufenden Seite

	Returns:
		str: HTML-Quelltext der Antwort
	"""
	# Ein normaler GET holt den HTML-Quelltext der Zielseite
	response = session.get(url, timeout=REQUEST_TIMEOUT)
	response.raise_for_status()
	return response.text


def headMetadata(session: requests.Session, url: str) -> Dict[str, str]:
	"""
	Liest Datei-Metadaten einer URL über eine HEAD-Anfrage

	Args:
		session (requests.Session): HTTP-Session für den Abruf
		url (str): Dokument-URL

	Returns:
		Dict[str, str]: Content-Length, Last-Modified, ETag und Content-Type
	"""
	try:
		# HEAD reicht aus, um Datei-Metadaten ohne Voll-Download abzurufen
		response = session.head(url, timeout=HEAD_TIMEOUT, allow_redirects=True)
		response.raise_for_status()
		headers = response.headers
		return {
			"content_length": headers.get("Content-Length", ""),
			"last_modified": headers.get("Last-Modified", ""),
			"etag": headers.get("ETag", ""),
			"content_type": headers.get("Content-Type", ""),
		}
	except Exception:
		# Fallback auf leere Werte, wenn der Server HEAD nicht sauber beantwortet
		return {
			"content_length": "",
			"last_modified": "",
			"etag": "",
			"content_type": "",
		}


def computeSha256(path: Path) -> str:
	"""
	Berechnet die SHA256-Prüfsumme einer lokalen Datei

	Args:
		path (Path): Pfad zur lokalen Datei

	Returns:
		str: SHA256-Hash als Hex-String
	"""
	digest = hashlib.sha256()
	with path.open("rb") as handle:
		# Die Datei wird in Blöcken gelesen dass auch große Downloads effizient bleiben
		for chunk in iter(lambda: handle.read(1024 * 1024), b""):
			digest.update(chunk)
	return digest.hexdigest()


def buildLocalPath(doc: SourceDocument, used_paths: Set[str]) -> Path:
	"""
	Erzeugt einen lokalen, konfliktfreien Zielpfad für ein Dokument

	Args:
		doc (SourceDocument): Dokumentdaten aus dem Crawl
		used_paths (Set[str]): Bereits vergebene relative Pfade

	Returns:
		Path: Relativer Zielpfad unterhalb des data-Ordners
	"""
	top = sanitizePathSegment(doc.category_top, "Ohne Kategorie")
	sub = sanitizePathSegment(doc.category_sub, "Allgemein") if doc.category_sub else ""
	filename = sanitizePathSegment(guessFilename(doc.url, doc.title), "dokument.bin")

	if sub:
		relative = Path("documents") / top / sub / filename
	else:
		relative = Path("documents") / top / filename

	candidate = relative
	stem = candidate.stem
	suffix = candidate.suffix
	index = 2

	# Gleiche Dateinamen werden mit einem Suffix eindeutig gemacht
	while str(candidate) in used_paths:
		new_name = f"{stem}_{index}{suffix}"
		if sub:
			candidate = Path("documents") / top / sub / new_name
		else:
			candidate = Path("documents") / top / new_name
		index += 1

	used_paths.add(str(candidate))
	return candidate


def downloadFile(session: requests.Session, url: str, destination: Path) -> Tuple[bool, str]:
	"""
	Lädt eine Datei herunter und speichert sie lokal ab

	Args:
		session (requests.Session): HTTP-Session für den Download
		url (str): Download-URL
		destination (Path): Lokaler Zielpfad

	Returns:
		Tuple[bool, str]: Erfolgsstatus und Fehlermeldung bei Fehler
	"""
	destination.parent.mkdir(parents=True, exist_ok=True)

	try:
		with session.get(url, timeout=REQUEST_TIMEOUT, stream=True) as response:
			response.raise_for_status()
			content_type = (response.headers.get("Content-Type") or "").lower()
			# HTML-Antworten sind in diesem Kontext keine echten Dateien
			if "text/html" in content_type:
				return False, "übersprungen (Content-Type text/html)"

			# Der Inhalt wird direkt in die Zieldatei gestreamt
			with destination.open("wb") as handle:
				for chunk in response.iter_content(chunk_size=64 * 1024):
					if chunk:
						handle.write(chunk)
	except Exception as exc:
		return False, str(exc)

	return True, ""


def shouldRedownload(doc: SourceDocument, old: Optional[Dict], local_path: Path, head: Dict[str, str]) -> bool:
	"""
	Entscheidet, ob ein Dokument erneut heruntergeladen werden muss

	Args:
		doc (SourceDocument): Aktueller Dokumenteintrag aus dem Crawl
		old (Optional[Dict]): Alter Metadaten-Eintrag oder None
		local_path (Path): Lokaler Pfad zur bereits gespeicherten Datei
		head (Dict[str, str]): Aktuelle HEAD-Metadaten der URL

	Returns:
		bool: True wenn ein neuer Download notwendig ist
	"""
	if old is None:
		return True
	if not local_path.exists():
		return True

	# Metadaten- oder Inhaltsänderungen erzwingen einen neuen Download
	if old.get("description", "") != doc.description:
		return True
	if old.get("title", "") != doc.title:
		return True
	if old.get("category_top", "") != doc.category_top:
		return True
	if old.get("category_sub", "") != doc.category_sub:
		return True

	old_length = str(old.get("content_length", ""))
	old_modified = old.get("last_modified", "")
	old_etag = old.get("etag", "")

	if head.get("content_length", "") and head.get("content_length") != old_length:
		return True
	if head.get("last_modified", "") and head.get("last_modified") != old_modified:
		return True
	if head.get("etag", "") and head.get("etag") != old_etag:
		return True

	return False


def removeDeletedDocuments(
	old_by_key: Dict[str, Dict],
	current_keys: Set[str],
	current_local_paths: Set[str],
) -> int:
	"""
	Entfernt lokale Dateien, deren Einträge nicht mehr im Crawl vorkommen

	Args:
		old_by_key (Dict[str, Dict]): Frühere Metadaten nach Entry-Key
		current_keys (Set[str]): Aktuell gefundene Entry-Keys
		current_local_paths (Set[str]): Aktuell vergebene lokale Pfade

	Returns:
		int: Anzahl erfolgreich gelöschter Dateien
	"""
	removed = 0
	for key, old in old_by_key.items():
		if key in current_keys:
			continue

		local_rel = old.get("local_path", "")
		if not local_rel or local_rel in current_local_paths:
			continue

		# Nur Dateien löschen die nicht mehr zu einem aktuellen Eintrag gehören
		file_path = DATA_DIR / local_rel
		if file_path.exists() and file_path.is_file():
			try:
				file_path.unlink()
				removed += 1
			except Exception as exc:
				print(f"Warnung: Konnte entfernte Datei nicht löschen ({file_path}): {exc}")
	return removed


def verifyCoverage(expected_keys: Set[str], metadata_docs: Iterable[Dict]) -> Tuple[Set[str], Set[str]]:
	"""
	Vergleicht erwartete Keys mit den Keys in den finalen Metadaten

	Args:
		expected_keys (Set[str]): Keys aus dem Crawling
		metadata_docs (Iterable[Dict]): Zu speichernde Metadaten-Einträge

	Returns:
		Tuple[Set[str], Set[str]]: Fehlende Keys und zusätzliche Keys
	"""
	actual_keys = {entry.get("entry_key", "") for entry in metadata_docs if entry.get("entry_key")}
	missing = expected_keys - actual_keys
	extra = actual_keys - expected_keys
	return missing, extra


def send_telegram_message(message: str) -> bool:
	"""
	Sendet eine Nachricht über das Telegram-Hilfsskript

	Args:
		message (str): Zu sendender Nachrichtentext

	Returns:
		bool: True bei erfolgreichem Versand, sonst False
	"""
	telegram_script = SCRIPT_DIR / "telegram_messenger.py"
	if not telegram_script.exists():
		print(f"Warnung: Telegram-Skript nicht gefunden: {telegram_script}")
		return False

	try:
		result = subprocess.run(
			[sys.executable, str(telegram_script), message],
			capture_output=True,
			text=True,
			check=False,
		)
	except Exception as exc:
		print(f"Warnung: Telegram-Benachrichtigung konnte nicht gesendet werden: {exc}")
		return False

	if result.returncode != 0:
		stderr = (result.stderr or "").strip()
		stdout = (result.stdout or "").strip()
		error_text = stderr or stdout or f"Exit-Code {result.returncode}"
		print(f"Warnung: Telegram-Benachrichtigung fehlgeschlagen: {error_text}")
		return False

	return True


def send_new_without_description_notification(items: List[Dict[str, str]]) -> bool:
	"""
	Sendet eine Sammelmeldung für neue Dokumente ohne Beschreibung

	Args:
		items (List[Dict[str, str]]): Liste mit Titel und lokalem Pfad der neuen Dokumente

	Returns:
		bool: True wenn keine Fehler beim Senden aufgetreten sind
	"""
	if not items:
		return True

	max_list_items = 50
	lines = [
		"Neue Dokumente ohne Beschreibung wurden hinzugefügt:",
		"",
	]

	# Die Nachricht bleibt bewusst kompakt dass Telegram sie gut lesbar darstellt
	for item in items[:max_list_items]:
		title = item.get("title", "(ohne Titel)")
		local_path = item.get("local_path", "(ohne Pfad)")
		lines.append(f"- {title} | {local_path}")

	remaining = len(items) - max_list_items
	if remaining > 0:
		lines.append("")
		lines.append(f"... und {remaining} weitere")

	message = "\n".join(lines)
	return send_telegram_message(message)


def main() -> int:
	"""
	Steuert den kompletten Scrape-, Download- und Metadaten-Workflow

	Returns:
		int: 0 bei Erfolg, 1 bei Fehlern oder fehlender Coverage
	"""
	print("DHBW Dokumente-Scraper")
	print(f"Startzeitpunkt: {nowIso()}")

	DOCUMENTS_DIR.mkdir(parents=True, exist_ok=True)
	session = buildSession()

	# Vorhandene Metadaten werden geladen um Änderungen inkrementell zu erkennen
	old_metadata = loadMetadata()
	old_docs_list = old_metadata.get("documents", []) if isinstance(old_metadata, dict) else []
	old_by_key: Dict[str, Dict] = {}
	for item in old_docs_list:
		if not isinstance(item, dict):
			continue
		entry_key = item.get("entry_key", "")
		if not entry_key and item.get("url"):
			# Alte Einträge bekommen bei Bedarf denselben Schlüssel wie neue Einträge
			entry_key = makeEntryKey(
				item.get("url", ""),
				item.get("title", ""),
				item.get("category_top", ""),
				item.get("category_sub", ""),
			)
		if entry_key:
			old_by_key[entry_key] = item

	print(f"Vorhandene Metadateneinträge: {len(old_by_key)}")
	print(f"Lade Seite: {BASE_URL}")

	source_documents, expected_keys = crawlAllDocuments(session, BASE_URL)

	print(f"Gefundene Dokumente (ohne Bekanntmachungen): {len(source_documents)}")

	# Bereits bekannte Pfade werden reserviert, damit keine Kollisionen entstehen
	used_paths: Set[str] = {
		str(entry.get("local_path"))
		for key, entry in old_by_key.items()
		if key in expected_keys and entry.get("local_path")
	}

	processed_docs: List[Dict] = []
	stats = {
		"new": 0,
		"new_without_description": 0,
		"updated": 0,
		"unchanged": 0,
		"failed": 0,
		"removed": 0,
		"downloaded": 0,
	}
	failed_urls: List[str] = []
	new_docs_without_description: List[Dict[str, str]] = []

	for index, doc in enumerate(source_documents, start=1):
		old = old_by_key.get(doc.entry_key)

		if old and old.get("local_path"):
			relative_path = Path(old["local_path"])
		else:
			# Neue Einträge bekommen einen stabilen, konfliktfreien Zielpfad
			relative_path = buildLocalPath(doc, used_paths)

		local_path = DATA_DIR / relative_path
		head = headMetadata(session, doc.url)

		# HEAD-Daten dienen als billiger Änderungsindikator vor einem Voll-Download
		redownload = shouldRedownload(doc, old, local_path, head)

		# Alle Metadaten für den Eintrag werden in einem Dictionary gesammelt
		document_entry = {
			"entry_key": doc.entry_key,
			"url": doc.url,
			"title": doc.title,
			"description": doc.description,
			"category_top": doc.category_top,
			"category_sub": doc.category_sub,
			"filename": local_path.name,
			"local_path": str(relative_path),
			"content_length": head.get("content_length", ""),
			"last_modified": head.get("last_modified", ""),
			"etag": head.get("etag", ""),
			"content_type": head.get("content_type", ""),
			"last_seen": nowIso(),
		}

		if not redownload:
			# Unveränderte Einträge behalten Hash und Download-Zeitpunkt aus den alten Metadaten
			document_entry["downloaded_at"] = old.get("downloaded_at", "") if old else ""
			document_entry["sha256"] = old.get("sha256", "") if old else ""
			processed_docs.append(document_entry)
			stats["unchanged"] += 1
			print(f"[{index}/{len(source_documents)}] Unverändert: {doc.title}")
			continue

		# Bei Änderungen wird die Datei neu geladen und lokal überschrieben
		ok, error = downloadFile(session, doc.url, local_path)
		if not ok:
			stats["failed"] += 1
			failed_urls.append(f"{doc.url} -> {error}")
			print(f"[{index}/{len(source_documents)}] FEHLER: {doc.title} ({error})")
			continue

		document_entry["downloaded_at"] = nowIso()
		document_entry["sha256"] = computeSha256(local_path)

		if old is None:
			# Neue Dokumente werden separat gezählt und ggf. gemeldet
			stats["new"] += 1
			if not doc.description.strip():
				stats["new_without_description"] += 1
				new_docs_without_description.append({
					"title": doc.title,
					"local_path": str(relative_path),
				})
			print(f"[{index}/{len(source_documents)}] Neu: {doc.title}")
		else:
			stats["updated"] += 1
			print(f"[{index}/{len(source_documents)}] Aktualisiert: {doc.title}")

		stats["downloaded"] += 1
		processed_docs.append(document_entry)
		# Kurze Pause zwischen Downloads hält das Verhalten freundlich für den Server
		time.sleep(REQUEST_DELAY_SECONDS)

	current_keys = {entry["entry_key"] for entry in processed_docs}
	current_local_paths = {
		entry.get("local_path", "")
		for entry in processed_docs
		if entry.get("local_path")
	}
	# Verwaiste lokale Dateien werden entfernt wenn der Eintrag nicht mehr existiert
	stats["removed"] = removeDeletedDocuments(old_by_key, current_keys, current_local_paths)

	# Die neue Metadaten-Datei spiegelt den kompletten aktuellen Stand wider
	new_metadata = {
		"updated_at": nowIso(),
		"source": BASE_URL,
		"document_count": len(processed_docs),
		"documents": sorted(processed_docs, key=lambda item: item["entry_key"]),
	}
	saveMetadata(new_metadata)

	# Coverage prüft ob Crawling und Metadaten dieselben Einträge sehen
	missing, extra = verifyCoverage(expected_keys, processed_docs)

	category_counts: Dict[str, int] = {}
	for doc in source_documents:
		category_counts[doc.category_top] = category_counts.get(doc.category_top, 0) + 1

	print("\nZusammenfassung:\n")
	print(f"Erwartete Dokument-Einträge: {len(expected_keys)}")
	print(f"Metadaten-Einträge: {len(processed_docs)}")
	print(f"Neu: {stats['new']}")
	print(f"Neu ohne Beschreibung: {stats['new_without_description']}")
	print(f"Aktualisiert: {stats['updated']}")
	print(f"Unverändert: {stats['unchanged']}")
	print(f"Heruntergeladen: {stats['downloaded']}")
	print(f"Entfernt (lokal gelöscht): {stats['removed']}")
	print(f"Fehlgeschlagen: {stats['failed']}")
	print(f"Coverage fehlend: {len(missing)}")
	print(f"Coverage extra: {len(extra)}")
	print("\nEinträge pro Top-Kategorie:")
	for category_name in sorted(category_counts):
		print(f"- {category_name}: {category_counts[category_name]}")

	if failed_urls:
		print("\nFehlgeschlagene Downloads:")
		for item in failed_urls[:20]:
			print(f"- {item}")
		if len(failed_urls) > 20:
			print(f"... und {len(failed_urls) - 20} weitere")

	if missing:
		print("\nFehlende Eintrags-Keys in Metadaten (erste 20):")
		for entry_key in sorted(list(missing))[:20]:
			print(f"- {entry_key}")

	if extra:
		print("\nZusätzliche Eintrags-Keys in Metadaten (erste 20):")
		for entry_key in sorted(list(extra))[:20]:
			print(f"- {entry_key}")

	if new_docs_without_description:
		notification_ok = send_new_without_description_notification(new_docs_without_description)
		if notification_ok:
			print("\nTelegram-Benachrichtigung gesendet: Neue Dokumente ohne Beschreibung")
		else:
			print("\nWarnung: Telegram-Benachrichtigung für neue Dokumente ohne Beschreibung fehlgeschlagen")

	print(f"\nMetadaten: {METADATA_FILE}")
	print(f"Dateien: {DOCUMENTS_DIR}")
	print(f"Ende: {nowIso()}")

	if stats["failed"] > 0 or missing:
		return 1

	return 0


if __name__ == "__main__":
	raise SystemExit(main())