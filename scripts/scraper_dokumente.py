#!/usr/bin/env python3
"""Incremental scraper for DHBW Ravensburg documents downloads.

Requirements implemented:
- Download all documents from the documents/downloads page and tab subsections.
- Exclude official announcements (Amtliche Bekanntmachungen / #Bekanntmachungen).
- Persist descriptions per document in one central JSON metadata file.
- Support repeated runs with change detection (new/updated/removed docs).
- Keep at most one layer between top-level tab and document file.
"""

from __future__ import annotations

import hashlib
import json
import os
import re
import time
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, Iterable, List, Optional, Set, Tuple
from urllib.parse import urljoin, urlparse

import requests  # type: ignore[import-untyped]
from bs4 import BeautifulSoup, Tag
from bs4.element import AttributeValueList


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


def now_iso() -> str:
	return datetime.now(timezone.utc).isoformat()


def attr_to_text(value: object) -> str:
	if value is None:
		return ""
	if isinstance(value, str):
		return value
	if isinstance(value, AttributeValueList):
		return " ".join(str(item) for item in value)
	return str(value)


def build_session() -> requests.Session:
	session = requests.Session()
	session.headers.update({"User-Agent": USER_AGENT})
	return session


def load_metadata() -> Dict:
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


def save_metadata(metadata: Dict) -> None:
	METADATA_FILE.parent.mkdir(parents=True, exist_ok=True)
	with METADATA_FILE.open("w", encoding="utf-8") as handle:
		json.dump(metadata, handle, indent=2, ensure_ascii=False)


def sanitize_path_segment(value: str, fallback: str) -> str:
	cleaned = (value or "").strip()
	cleaned = re.sub(r"[\x00-\x1f\x7f]", "", cleaned)
	cleaned = cleaned.replace("/", "-").replace("\\", "-")
	cleaned = re.sub(r"[<>:\"|?*]", "_", cleaned)
	cleaned = re.sub(r"\s+", " ", cleaned).strip(" .")
	return cleaned or fallback


def guess_filename(url: str, title: str) -> str:
	parsed = urlparse(url)
	name = os.path.basename(parsed.path)
	if name:
		return sanitize_path_segment(name, "dokument")

	title_part = sanitize_path_segment(title, "dokument")
	return f"{title_part}.bin"


def make_entry_key(url: str, title: str, category_top: str, category_sub: str) -> str:
	payload = "|".join([
		url.strip(),
		title.strip(),
		category_top.strip(),
		category_sub.strip(),
	])
	return hashlib.sha1(payload.encode("utf-8")).hexdigest()


def is_document_url(url: str) -> bool:
	parsed = urlparse(url)
	path = parsed.path.lower()

	extension = os.path.splitext(path)[1]
	if extension in NON_DOCUMENT_EXTENSIONS:
		return False
	if extension in DOCUMENT_EXTENSIONS:
		return True

	if "/fileadmin/" in path:
		return True

	return False


def extract_description(link: Tag) -> str:
	li_parent = link.find_parent("li")
	if li_parent:
		desc_div = li_parent.find(class_=lambda cls: isinstance(cls, str) and "ce-uploads-description" in cls)
		if desc_div:
			return desc_div.get_text(" ", strip=True)

	next_desc = link.find_next_sibling(class_=lambda cls: isinstance(cls, str) and "ce-uploads-description" in cls)
	if next_desc:
		return next_desc.get_text(" ", strip=True)

	parent = link.find_parent(["div", "p", "li"])
	if parent:
		text = parent.get_text(" ", strip=True)
		link_text = link.get_text(" ", strip=True)
		if link_text and link_text in text:
			remainder = text.split(link_text, 1)[1].strip()
			if 3 <= len(remainder) <= 500:
				return remainder

	return ""


def collect_tab_mapping(soup: BeautifulSoup) -> List[Tuple[str, str, bool]]:
	mapping: List[Tuple[str, str, bool]] = []
	for li in soup.select("ul.nav.nav-tabs li.nav-link"):
		anchor = li.find("a")
		if not anchor:
			continue

		tab_target = attr_to_text(anchor.get("data-href")).strip()
		if not tab_target.startswith("#"):
			continue

		tab_id = tab_target[1:]
		tab_label = anchor.get_text(" ", strip=True)
		li_id = attr_to_text(li.get("id")).strip().lower()
		label_lower = tab_label.lower()
		is_bekanntmachung = (
			li_id == "bekanntmachungen"
			or "amtliche" in label_lower
			or "bekanntmach" in label_lower
		)
		mapping.append((tab_id, tab_label, is_bekanntmachung))

	return mapping


def nearest_sub_heading(link: Tag, pane: Tag) -> str:
	for previous in link.find_all_previous(["h2", "h3"]):
		if pane not in previous.parents and previous is not pane:
			continue
		heading = previous.get_text(" ", strip=True)
		if heading:
			return heading
	return ""


def is_internal_documents_page(url: str) -> bool:
	parsed = urlparse(url)
	return (
		parsed.netloc == "www.ravensburg.dhbw.de"
		and parsed.path.rstrip("/") == "/service-einrichtungen/dokumente-downloads"
	)


def extract_documents_from_html(base_url: str, html: str) -> Tuple[List[SourceDocument], Set[str], Set[str]]:
	soup = BeautifulSoup(html, "html.parser")
	tab_mapping = collect_tab_mapping(soup)

	all_docs: Dict[str, SourceDocument] = {}
	expected_keys: Set[str] = set()
	follow_links: Set[str] = set()

	for tab_id, tab_label, is_bekanntmachung in tab_mapping:
		pane = soup.find("div", id=tab_id)
		if not isinstance(pane, Tag):
			continue

		if is_bekanntmachung:
			continue

		top_category = tab_label.strip() or "Ohne Kategorie"

		for link in pane.find_all("a", href=True):
			href = attr_to_text(link.get("href", "")).strip()
			if not href:
				continue

			if href.startswith(("#", "mailto:", "tel:", "javascript:")):
				continue

			absolute_url = urljoin(base_url, href)

			if is_internal_documents_page(absolute_url):
				parsed_internal = urlparse(absolute_url)
				if parsed_internal.query:
					follow_links.add(absolute_url)

			if not is_document_url(absolute_url):
				continue

			title = attr_to_text(link.get("title", "")).strip() or link.get_text(" ", strip=True)
			if not title:
				title = guess_filename(absolute_url, "Dokument")

			sub_category = nearest_sub_heading(link, pane)
			if sub_category.lower().startswith("amtliche bekanntmach"):
				continue

			description = extract_description(link)
			entry_key = make_entry_key(absolute_url, title, top_category, sub_category)
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


def crawl_all_documents(session: requests.Session, start_url: str) -> Tuple[List[SourceDocument], Set[str]]:
	queue: List[str] = [start_url]
	visited: Set[str] = set()
	all_docs: Dict[str, SourceDocument] = {}
	expected_keys: Set[str] = set()

	while queue:
		page_url = queue.pop(0)
		if page_url in visited:
			continue

		visited.add(page_url)
		#print(f"Analysiere Seite {len(visited)}: {page_url}")

		try:
			html = fetch_page_html(session, page_url)
		except Exception as exc:
			print(f"Warnung: Seite konnte nicht geladen werden ({page_url}): {exc}")
			continue

		page_docs, page_expected, page_follow = extract_documents_from_html(page_url, html)
		for doc in page_docs:
			all_docs[doc.entry_key] = doc
		expected_keys.update(page_expected)

		for next_url in sorted(page_follow):
			if next_url not in visited and next_url not in queue:
				queue.append(next_url)

		time.sleep(REQUEST_DELAY_SECONDS)

	return sorted(all_docs.values(), key=lambda item: item.entry_key), expected_keys


def fetch_page_html(session: requests.Session, url: str) -> str:
	response = session.get(url, timeout=REQUEST_TIMEOUT)
	response.raise_for_status()
	return response.text


def head_metadata(session: requests.Session, url: str) -> Dict[str, str]:
	try:
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
		return {
			"content_length": "",
			"last_modified": "",
			"etag": "",
			"content_type": "",
		}


def compute_sha256(path: Path) -> str:
	digest = hashlib.sha256()
	with path.open("rb") as handle:
		for chunk in iter(lambda: handle.read(1024 * 1024), b""):
			digest.update(chunk)
	return digest.hexdigest()


def build_local_path(doc: SourceDocument, used_paths: Set[str]) -> Path:
	top = sanitize_path_segment(doc.category_top, "Ohne Kategorie")
	sub = sanitize_path_segment(doc.category_sub, "Allgemein") if doc.category_sub else ""
	filename = sanitize_path_segment(guess_filename(doc.url, doc.title), "dokument.bin")

	if sub:
		relative = Path("documents") / top / sub / filename
	else:
		relative = Path("documents") / top / filename

	candidate = relative
	stem = candidate.stem
	suffix = candidate.suffix
	index = 2

	while str(candidate) in used_paths:
		new_name = f"{stem}_{index}{suffix}"
		if sub:
			candidate = Path("documents") / top / sub / new_name
		else:
			candidate = Path("documents") / top / new_name
		index += 1

	used_paths.add(str(candidate))
	return candidate


def download_file(session: requests.Session, url: str, destination: Path) -> Tuple[bool, str]:
	destination.parent.mkdir(parents=True, exist_ok=True)

	try:
		with session.get(url, timeout=REQUEST_TIMEOUT, stream=True) as response:
			response.raise_for_status()
			content_type = (response.headers.get("Content-Type") or "").lower()
			if "text/html" in content_type:
				return False, "übersprungen (Content-Type text/html)"

			with destination.open("wb") as handle:
				for chunk in response.iter_content(chunk_size=64 * 1024):
					if chunk:
						handle.write(chunk)
	except Exception as exc:
		return False, str(exc)

	return True, ""


def should_redownload(doc: SourceDocument, old: Optional[Dict], local_path: Path, head: Dict[str, str]) -> bool:
	if old is None:
		return True
	if not local_path.exists():
		return True

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


def remove_deleted_documents(old_by_key: Dict[str, Dict], current_keys: Set[str]) -> int:
	removed = 0
	for key, old in old_by_key.items():
		if key in current_keys:
			continue

		local_rel = old.get("local_path", "")
		if local_rel:
			file_path = DATA_DIR / local_rel
			if file_path.exists() and file_path.is_file():
				try:
					file_path.unlink()
					removed += 1
				except Exception as exc:
					print(f"Warnung: Konnte entfernte Datei nicht löschen ({file_path}): {exc}")
	return removed


def verify_coverage(expected_keys: Set[str], metadata_docs: Iterable[Dict]) -> Tuple[Set[str], Set[str]]:
	actual_keys = {entry.get("entry_key", "") for entry in metadata_docs if entry.get("entry_key")}
	missing = expected_keys - actual_keys
	extra = actual_keys - expected_keys
	return missing, extra


def main() -> int:
	print("DHBW Dokumente-Scraper")
	print(f"Startzeitpunkt: {now_iso()}")

	DOCUMENTS_DIR.mkdir(parents=True, exist_ok=True)
	session = build_session()

	old_metadata = load_metadata()
	old_docs_list = old_metadata.get("documents", []) if isinstance(old_metadata, dict) else []
	old_by_key: Dict[str, Dict] = {}
	for item in old_docs_list:
		if not isinstance(item, dict):
			continue
		entry_key = item.get("entry_key", "")
		if not entry_key and item.get("url"):
			entry_key = make_entry_key(
				item.get("url", ""),
				item.get("title", ""),
				item.get("category_top", ""),
				item.get("category_sub", ""),
			)
		if entry_key:
			old_by_key[entry_key] = item

	print(f"Vorhandene Metadateneinträge: {len(old_by_key)}")
	print(f"Lade Seite: {BASE_URL}")

	source_documents, expected_keys = crawl_all_documents(session, BASE_URL)

	print(f"Gefundene Dokumente (ohne Bekanntmachungen): {len(source_documents)}")

	used_paths: Set[str] = {
		str(entry.get("local_path"))
		for entry in old_by_key.values()
		if entry.get("local_path")
	}

	processed_docs: List[Dict] = []
	stats = {
		"new": 0,
		"updated": 0,
		"unchanged": 0,
		"failed": 0,
		"removed": 0,
		"downloaded": 0,
	}
	failed_urls: List[str] = []

	for index, doc in enumerate(source_documents, start=1):
		old = old_by_key.get(doc.entry_key)

		if old and old.get("local_path"):
			relative_path = Path(old["local_path"])
		else:
			relative_path = build_local_path(doc, used_paths)

		local_path = DATA_DIR / relative_path
		head = head_metadata(session, doc.url)

		redownload = should_redownload(doc, old, local_path, head)

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
			"last_seen": now_iso(),
		}

		if not redownload:
			document_entry["downloaded_at"] = old.get("downloaded_at", "") if old else ""
			document_entry["sha256"] = old.get("sha256", "") if old else ""
			processed_docs.append(document_entry)
			stats["unchanged"] += 1
			print(f"[{index}/{len(source_documents)}] Unverändert: {doc.title}")
			continue

		ok, error = download_file(session, doc.url, local_path)
		if not ok:
			stats["failed"] += 1
			failed_urls.append(f"{doc.url} -> {error}")
			print(f"[{index}/{len(source_documents)}] FEHLER: {doc.title} ({error})")
			continue

		document_entry["downloaded_at"] = now_iso()
		document_entry["sha256"] = compute_sha256(local_path)

		if old is None:
			stats["new"] += 1
			print(f"[{index}/{len(source_documents)}] Neu: {doc.title}")
		else:
			stats["updated"] += 1
			print(f"[{index}/{len(source_documents)}] Aktualisiert: {doc.title}")

		stats["downloaded"] += 1
		processed_docs.append(document_entry)
		time.sleep(REQUEST_DELAY_SECONDS)

	current_keys = {entry["entry_key"] for entry in processed_docs}
	stats["removed"] = remove_deleted_documents(old_by_key, current_keys)

	new_metadata = {
		"updated_at": now_iso(),
		"source": BASE_URL,
		"document_count": len(processed_docs),
		"documents": sorted(processed_docs, key=lambda item: item["entry_key"]),
	}
	save_metadata(new_metadata)

	missing, extra = verify_coverage(expected_keys, processed_docs)

	category_counts: Dict[str, int] = {}
	for doc in source_documents:
		category_counts[doc.category_top] = category_counts.get(doc.category_top, 0) + 1

	print("\nZusammenfassung:\n")
	print(f"Erwartete Dokument-Einträge: {len(expected_keys)}")
	print(f"Metadaten-Einträge: {len(processed_docs)}")
	print(f"Neu: {stats['new']}")
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

	print(f"\nMetadaten: {METADATA_FILE}")
	print(f"Dateien: {DOCUMENTS_DIR}")
	print(f"Ende: {now_iso()}")

	if stats["failed"] > 0 or missing:
		return 1

	return 0


if __name__ == "__main__":
	raise SystemExit(main())