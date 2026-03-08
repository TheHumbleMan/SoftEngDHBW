import sys
import tempfile
import unittest
from datetime import datetime
from pathlib import Path
from unittest.mock import MagicMock, patch

PROJECT_ROOT = Path(__file__).resolve().parents[1]
if str(PROJECT_ROOT) not in sys.path:
	sys.path.insert(0, str(PROJECT_ROOT))

import scripts.scraper_dokumente as scraper


class _FakeResponse:
	def __init__(self, text="", headers=None, chunks=None, raise_error: Exception | None = None):
		self.text = text
		self.headers = headers or {}
		self._chunks = chunks or []
		self._raise_error = raise_error

	def raise_for_status(self):
		if self._raise_error:
			raise self._raise_error

	def iter_content(self, chunk_size=8192):
		for chunk in self._chunks:
			yield chunk

	def __enter__(self):
		return self

	def __exit__(self, exc_type, exc_val, exc_tb):
		return False


class _FakeSession:
	def __init__(self, get_response=None, head_response=None, get_error: Exception | None = None, head_error: Exception | None = None):
		self._get_response = get_response
		self._head_response = head_response
		self._get_error = get_error
		self._head_error = head_error

	def get(self, url, **kwargs):
		if self._get_error:
			raise self._get_error
		return self._get_response

	def head(self, url, **kwargs):
		if self._head_error:
			raise self._head_error
		return self._head_response


class ScraperDokumenteTests(unittest.TestCase):
	def test_now_iso_is_valid_datetime(self):
		parsed = datetime.fromisoformat(scraper.now_iso())
		self.assertIsNotNone(parsed.tzinfo)

	def test_attr_to_text_variants(self):
		self.assertEqual(scraper.attr_to_text(None), "")
		self.assertEqual(scraper.attr_to_text("x"), "x")
		self.assertEqual(scraper.attr_to_text(["a", "b"]), "['a', 'b']")
		soup = scraper.BeautifulSoup("<div class='a b'></div>", "html.parser")
		class_attr = soup.find("div").get("class")
		self.assertEqual(scraper.attr_to_text(class_attr), "a b")

	def test_build_session_sets_user_agent(self):
		session = scraper.build_session()
		self.assertIn("User-Agent", session.headers)
		self.assertIn("Mozilla", session.headers["User-Agent"])

	def test_load_metadata_returns_empty_if_missing(self):
		with tempfile.TemporaryDirectory() as tmp:
			original = scraper.METADATA_FILE
			scraper.METADATA_FILE = Path(tmp) / "missing.json"
			try:
				self.assertEqual(scraper.load_metadata(), {})
			finally:
				scraper.METADATA_FILE = original

	def test_save_and_load_metadata_roundtrip(self):
		with tempfile.TemporaryDirectory() as tmp:
			original = scraper.METADATA_FILE
			scraper.METADATA_FILE = Path(tmp) / "meta.json"
			data = {"a": 1, "b": "x"}
			try:
				scraper.save_metadata(data)
				loaded = scraper.load_metadata()
				self.assertEqual(loaded, data)
			finally:
				scraper.METADATA_FILE = original

	def test_load_metadata_returns_empty_for_invalid_json(self):
		with tempfile.TemporaryDirectory() as tmp:
			original = scraper.METADATA_FILE
			file_path = Path(tmp) / "meta.json"
			file_path.write_text("{invalid", encoding="utf-8")
			scraper.METADATA_FILE = file_path
			try:
				self.assertEqual(scraper.load_metadata(), {})
			finally:
				scraper.METADATA_FILE = original

	def test_make_entry_key_is_stable(self):
		key1 = scraper.make_entry_key(
			"https://example.org/a.pdf",
			"Titel",
			"Top",
			"Sub",
		)
		key2 = scraper.make_entry_key(
			"https://example.org/a.pdf",
			"Titel",
			"Top",
			"Sub",
		)
		self.assertEqual(key1, key2)

	def test_make_entry_key_changes_on_field_change(self):
		base = scraper.make_entry_key("https://example.org/a.pdf", "Titel", "Top", "Sub")
		changed = scraper.make_entry_key("https://example.org/b.pdf", "Titel", "Top", "Sub")
		self.assertNotEqual(base, changed)

	def test_sanitize_path_segment(self):
		self.assertEqual(scraper.sanitize_path_segment("  A/B\\C:*?  ", "fallback"), "A-B-C___")

	def test_sanitize_path_segment_fallback(self):
		self.assertEqual(scraper.sanitize_path_segment("   ", "fallback"), "fallback")

	def test_guess_filename_from_url(self):
		name = scraper.guess_filename("https://example.org/path/file.pdf", "Titel")
		self.assertEqual(name, "file.pdf")

	def test_guess_filename_from_title_when_url_has_no_name(self):
		name = scraper.guess_filename("https://example.org/path/", "Mein Titel")
		self.assertEqual(name, "Mein Titel.bin")

	def test_is_document_url_by_extension(self):
		self.assertTrue(scraper.is_document_url("https://example.org/x.docx"))
		self.assertFalse(scraper.is_document_url("https://example.org/x.html"))

	def test_is_document_url_fileadmin_without_extension(self):
		self.assertTrue(scraper.is_document_url("https://example.org/fileadmin/something/noext"))

	def test_collect_tab_mapping_detects_bekanntmachung(self):
		soup = scraper.BeautifulSoup(
			"""
			<ul class='nav nav-tabs'>
				<li class='nav-link' id='x'><a data-href='#t1'>Normale Kategorie</a></li>
				<li class='nav-link' id='y'><a data-href='#t2'>Amtliche Hinweise</a></li>
			</ul>
			""",
			"html.parser",
		)
		mapping = scraper.collect_tab_mapping(soup)
		self.assertEqual(mapping[0], ("t1", "Normale Kategorie", False))
		self.assertEqual(mapping[1], ("t2", "Amtliche Hinweise", True))

	def test_collect_tab_mapping_skips_invalid_tabs(self):
		soup = scraper.BeautifulSoup(
			"""
			<ul class='nav nav-tabs'>
				<li class='nav-link' id='x'></li>
				<li class='nav-link' id='y'><a data-href='abc'>Ungueltig</a></li>
			</ul>
			""",
			"html.parser",
		)
		self.assertEqual(scraper.collect_tab_mapping(soup), [])

	def test_nearest_sub_heading_returns_empty_without_heading(self):
		soup = scraper.BeautifulSoup("<div id='x'><a href='#'>x</a></div>", "html.parser")
		pane = soup.find("div", id="x")
		link = pane.find("a")
		self.assertEqual(scraper.nearest_sub_heading(link, pane), "")

	def test_nearest_sub_heading_returns_heading(self):
		soup = scraper.BeautifulSoup("<div id='x'><h3>Sub</h3><a href='#'>x</a></div>", "html.parser")
		pane = soup.find("div", id="x")
		link = pane.find("a")
		self.assertEqual(scraper.nearest_sub_heading(link, pane), "Sub")

	def test_is_internal_documents_page(self):
		self.assertTrue(scraper.is_internal_documents_page("https://www.ravensburg.dhbw.de/service-einrichtungen/dokumente-downloads"))
		self.assertFalse(scraper.is_internal_documents_page("https://example.org/service-einrichtungen/dokumente-downloads"))

	def test_build_local_path_collision(self):
		doc = scraper.SourceDocument(
			entry_key="k",
			url="https://example.org/file.pdf",
			title="Titel",
			description="",
			category_top="Top",
			category_sub="Sub",
		)
		used_paths = {"documents/Top/Sub/file.pdf"}
		result = scraper.build_local_path(doc, used_paths)
		self.assertEqual(str(result), "documents/Top/Sub/file_2.pdf")
		self.assertIn("documents/Top/Sub/file_2.pdf", used_paths)

	def test_should_redownload_for_new_document(self):
		doc = scraper.SourceDocument("k", "https://e.org/a.pdf", "Titel", "", "Top", "Sub")
		local = Path("/tmp/nonexistent-file-for-test")
		self.assertTrue(scraper.should_redownload(doc, None, local, {}))

	def test_should_redownload_if_file_missing(self):
		doc = scraper.SourceDocument("k", "https://e.org/a.pdf", "Titel", "", "Top", "Sub")
		old = {"description": "", "title": "Titel", "category_top": "Top", "category_sub": "Sub"}
		local = Path("/tmp/nonexistent-file-for-test")
		self.assertTrue(scraper.should_redownload(doc, old, local, {}))

	def test_should_redownload_if_metadata_changed(self):
		with tempfile.TemporaryDirectory() as tmp:
			local = Path(tmp) / "a.pdf"
			local.write_bytes(b"abc")
			doc = scraper.SourceDocument("k", "https://e.org/a.pdf", "Titel Neu", "", "Top", "Sub")
			old = {
				"description": "",
				"title": "Titel Alt",
				"category_top": "Top",
				"category_sub": "Sub",
				"content_length": "3",
				"last_modified": "x",
				"etag": "y",
			}
			self.assertTrue(scraper.should_redownload(doc, old, local, {}))

	def test_should_redownload_if_head_changes(self):
		with tempfile.TemporaryDirectory() as tmp:
			local = Path(tmp) / "a.pdf"
			local.write_bytes(b"abc")
			doc = scraper.SourceDocument("k", "https://e.org/a.pdf", "Titel", "", "Top", "Sub")
			old = {
				"description": "",
				"title": "Titel",
				"category_top": "Top",
				"category_sub": "Sub",
				"content_length": "3",
				"last_modified": "old",
				"etag": "old-etag",
			}
			head = {"content_length": "4", "last_modified": "old", "etag": "old-etag"}
			self.assertTrue(scraper.should_redownload(doc, old, local, head))

	def test_should_not_redownload_if_nothing_changed(self):
		with tempfile.TemporaryDirectory() as tmp:
			local = Path(tmp) / "a.pdf"
			local.write_bytes(b"abc")
			doc = scraper.SourceDocument("k", "https://e.org/a.pdf", "Titel", "desc", "Top", "Sub")
			old = {
				"description": "desc",
				"title": "Titel",
				"category_top": "Top",
				"category_sub": "Sub",
				"content_length": "3",
				"last_modified": "old",
				"etag": "old-etag",
			}
			head = {"content_length": "3", "last_modified": "old", "etag": "old-etag"}
			self.assertFalse(scraper.should_redownload(doc, old, local, head))

	def test_remove_deleted_documents_deletes_only_non_current_paths(self):
		with tempfile.TemporaryDirectory() as tmp:
			original_data_dir = scraper.DATA_DIR
			scraper.DATA_DIR = Path(tmp)
			try:
				old_by_key = {
					"old_removed": {"local_path": "documents/A/old_removed.pdf"},
					"old_reused_path": {"local_path": "documents/A/reused.pdf"},
					"still_key": {"local_path": "documents/A/still_key.pdf"},
				}
				for rel in [
					"documents/A/old_removed.pdf",
					"documents/A/reused.pdf",
					"documents/A/still_key.pdf",
				]:
					p = scraper.DATA_DIR / rel
					p.parent.mkdir(parents=True, exist_ok=True)
					p.write_bytes(b"x")

				current_keys = {"still_key", "new_reusing"}
				current_local_paths = {"documents/A/still_key.pdf", "documents/A/reused.pdf"}

				removed = scraper.remove_deleted_documents(old_by_key, current_keys, current_local_paths)

				self.assertEqual(removed, 1)
				self.assertFalse((scraper.DATA_DIR / "documents/A/old_removed.pdf").exists())
				self.assertTrue((scraper.DATA_DIR / "documents/A/reused.pdf").exists())
				self.assertTrue((scraper.DATA_DIR / "documents/A/still_key.pdf").exists())
			finally:
				scraper.DATA_DIR = original_data_dir

	def test_remove_deleted_documents_ignores_nonexistent_files(self):
		with tempfile.TemporaryDirectory() as tmp:
			original_data_dir = scraper.DATA_DIR
			scraper.DATA_DIR = Path(tmp)
			try:
				old_by_key = {"gone": {"local_path": "documents/A/missing.pdf"}}
				removed = scraper.remove_deleted_documents(old_by_key, set(), set())
				self.assertEqual(removed, 0)
			finally:
				scraper.DATA_DIR = original_data_dir

	def test_extract_documents_from_html_filters_bekanntmachung_and_builds_follow_links(self):
		html = """
		<html>
		  <ul class=\"nav nav-tabs\">
		    <li class=\"nav-link\" id=\"studium\"><a data-href=\"#t1\">Studium</a></li>
		    <li class=\"nav-link\" id=\"bekanntmachungen\"><a data-href=\"#t2\">Bekanntmachungen</a></li>
		  </ul>
		  <div id=\"t1\">
		    <h2>Unterkategorie</h2>
		    <a href=\"/fileadmin/docs/a.pdf\" title=\"Dok A\">Dok A</a>
		    <a href=\"/service-einrichtungen/dokumente-downloads?tx=1\">Mehr</a>
		  </div>
		  <div id=\"t2\">
		    <a href=\"/fileadmin/docs/amtlich.pdf\">Amtlich</a>
		  </div>
		</html>
		"""
		docs, expected_keys, follow_links = scraper.extract_documents_from_html(
			"https://www.ravensburg.dhbw.de/service-einrichtungen/dokumente-downloads",
			html,
		)
		self.assertEqual(len(docs), 1)
		self.assertEqual(len(expected_keys), 1)
		self.assertEqual(docs[0].category_top, "Studium")
		self.assertEqual(docs[0].category_sub, "Unterkategorie")
		self.assertIn(
			"https://www.ravensburg.dhbw.de/service-einrichtungen/dokumente-downloads?tx=1",
			follow_links,
		)

	def test_extract_documents_from_html_description_from_li_and_skip_special_links(self):
		html = """
		<html>
		  <ul class='nav nav-tabs'>
		    <li class='nav-link' id='studium'><a data-href='#t1'>Studium</a></li>
		  </ul>
		  <div id='t1'>
		    <h2>Sub</h2>
		    <ul>
		      <li>
		        <a href='/fileadmin/docs/b.pdf' title='Dok B'>Dok B</a>
		        <div class='ce-uploads-description'>Beschreibung B</div>
		      </li>
		    </ul>
		    <a href='mailto:x@example.org'>Mail</a>
		    <a href='javascript:void(0)'>JS</a>
		  </div>
		</html>
		"""
		docs, _, _ = scraper.extract_documents_from_html(
			"https://www.ravensburg.dhbw.de/service-einrichtungen/dokumente-downloads",
			html,
		)
		self.assertEqual(len(docs), 1)
		self.assertEqual(docs[0].description, "Beschreibung B")

	def test_extract_documents_from_html_description_from_sibling(self):
		html = """
		<html>
		  <ul class='nav nav-tabs'><li class='nav-link' id='studium'><a data-href='#t1'>Studium</a></li></ul>
		  <div id='t1'>
		    <h2>Sub</h2>
		    <a href='/fileadmin/docs/c.pdf'>Dok C</a>
		    <div class='ce-uploads-description'>Beschreibung C</div>
		  </div>
		</html>
		"""
		docs, _, _ = scraper.extract_documents_from_html(
			"https://www.ravensburg.dhbw.de/service-einrichtungen/dokumente-downloads",
			html,
		)
		self.assertEqual(docs[0].description, "Beschreibung C")

	def test_fetch_page_html_success(self):
		response = _FakeResponse(text="<html>x</html>")
		session = _FakeSession(get_response=response)
		self.assertEqual(scraper.fetch_page_html(session, "https://example.org"), "<html>x</html>")

	def test_head_metadata_success_and_failure(self):
		ok_response = _FakeResponse(headers={
			"Content-Length": "100",
			"Last-Modified": "Mon",
			"ETag": "abc",
			"Content-Type": "application/pdf",
		})
		ok_session = _FakeSession(head_response=ok_response)
		meta = scraper.head_metadata(ok_session, "https://example.org/a.pdf")
		self.assertEqual(meta["content_length"], "100")
		self.assertEqual(meta["content_type"], "application/pdf")

		fail_session = _FakeSession(head_error=RuntimeError("boom"))
		meta_fail = scraper.head_metadata(fail_session, "https://example.org/a.pdf")
		self.assertEqual(meta_fail["content_length"], "")

	def test_compute_sha256_known_content(self):
		with tempfile.TemporaryDirectory() as tmp:
			file_path = Path(tmp) / "x.bin"
			file_path.write_bytes(b"abc")
			digest = scraper.compute_sha256(file_path)
			self.assertEqual(digest, "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad")

	def test_download_file_success(self):
		chunks = [b"ab", b"cd"]
		response = _FakeResponse(headers={"Content-Type": "application/pdf"}, chunks=chunks)
		session = _FakeSession(get_response=response)
		with tempfile.TemporaryDirectory() as tmp:
			dest = Path(tmp) / "a.pdf"
			ok, error = scraper.download_file(session, "https://example.org/a.pdf", dest)
			self.assertTrue(ok)
			self.assertEqual(error, "")
			self.assertEqual(dest.read_bytes(), b"abcd")

	def test_download_file_skips_html_content(self):
		response = _FakeResponse(headers={"Content-Type": "text/html; charset=utf-8"})
		session = _FakeSession(get_response=response)
		with tempfile.TemporaryDirectory() as tmp:
			dest = Path(tmp) / "a.pdf"
			ok, error = scraper.download_file(session, "https://example.org/a.pdf", dest)
			self.assertFalse(ok)
			self.assertIn("text/html", error)

	def test_download_file_handles_exception(self):
		session = _FakeSession(get_error=RuntimeError("network"))
		with tempfile.TemporaryDirectory() as tmp:
			dest = Path(tmp) / "a.pdf"
			ok, error = scraper.download_file(session, "https://example.org/a.pdf", dest)
			self.assertFalse(ok)
			self.assertIn("network", error)

	def test_verify_coverage(self):
		expected = {"a", "b"}
		metadata_docs = [{"entry_key": "a"}, {"entry_key": "c"}]
		missing, extra = scraper.verify_coverage(expected, metadata_docs)
		self.assertEqual(missing, {"b"})
		self.assertEqual(extra, {"c"})

	def test_send_telegram_message_script_missing(self):
		with tempfile.TemporaryDirectory() as tmp:
			original_script_dir = scraper.SCRIPT_DIR
			scraper.SCRIPT_DIR = Path(tmp)
			try:
				self.assertFalse(scraper.send_telegram_message("hi"))
			finally:
				scraper.SCRIPT_DIR = original_script_dir

	def test_send_telegram_message_success(self):
		with tempfile.TemporaryDirectory() as tmp:
			script_dir = Path(tmp)
			(script_dir / "telegram_messenger.py").write_text("print('ok')", encoding="utf-8")
			original_script_dir = scraper.SCRIPT_DIR
			scraper.SCRIPT_DIR = script_dir
			try:
				with patch("scripts.scraper_dokumente.subprocess.run") as mocked:
					mocked.return_value = MagicMock(returncode=0, stdout="", stderr="")
					self.assertTrue(scraper.send_telegram_message("hello"))
			finally:
				scraper.SCRIPT_DIR = original_script_dir

	def test_send_telegram_message_failure_return_code(self):
		with tempfile.TemporaryDirectory() as tmp:
			script_dir = Path(tmp)
			(script_dir / "telegram_messenger.py").write_text("print('ok')", encoding="utf-8")
			original_script_dir = scraper.SCRIPT_DIR
			scraper.SCRIPT_DIR = script_dir
			try:
				with patch("scripts.scraper_dokumente.subprocess.run") as mocked:
					mocked.return_value = MagicMock(returncode=1, stdout="x", stderr="")
					self.assertFalse(scraper.send_telegram_message("hello"))
			finally:
				scraper.SCRIPT_DIR = original_script_dir

	def test_send_new_without_description_notification_empty(self):
		self.assertTrue(scraper.send_new_without_description_notification([]))

	def test_send_new_without_description_notification_truncates(self):
		items = [{"title": f"T{i}", "local_path": f"p{i}"} for i in range(55)]
		with patch("scripts.scraper_dokumente.send_telegram_message") as send_mock:
			send_mock.return_value = True
			ok = scraper.send_new_without_description_notification(items)
			self.assertTrue(ok)
			self.assertTrue(send_mock.called)
			message = send_mock.call_args[0][0]
			self.assertIn("... und 5 weitere", message)

	def test_crawl_all_documents_collects_docs_and_follows_links(self):
		session = object()
		start = "https://www.ravensburg.dhbw.de/service-einrichtungen/dokumente-downloads"
		doc1 = scraper.SourceDocument("k1", "u1", "t1", "d1", "c1", "s1")
		doc2 = scraper.SourceDocument("k2", "u2", "t2", "d2", "c2", "s2")

		def fake_fetch(_session, page_url):
			return f"html:{page_url}"

		def fake_extract(page_url, html):
			if page_url == start:
				return [doc1], {"k1"}, {start + "?x=1"}
			return [doc2], {"k2"}, set()

		with patch("scripts.scraper_dokumente.fetch_page_html", side_effect=fake_fetch), \
			 patch("scripts.scraper_dokumente.extract_documents_from_html", side_effect=fake_extract), \
			 patch("scripts.scraper_dokumente.time.sleep"):
			docs, keys = scraper.crawl_all_documents(session, start)

		self.assertEqual({d.entry_key for d in docs}, {"k1", "k2"})
		self.assertEqual(keys, {"k1", "k2"})

	def test_crawl_all_documents_handles_page_error(self):
		start = "https://www.ravensburg.dhbw.de/service-einrichtungen/dokumente-downloads"

		with patch("scripts.scraper_dokumente.fetch_page_html", side_effect=RuntimeError("x")), \
			 patch("scripts.scraper_dokumente.time.sleep"):
			docs, keys = scraper.crawl_all_documents(object(), start)

		self.assertEqual(docs, [])
		self.assertEqual(keys, set())

	def test_main_success_flow(self):
		with tempfile.TemporaryDirectory() as tmp:
			base = Path(tmp)
			data_dir = base / "data"
			documents_dir = data_dir / "documents"
			metadata_file = data_dir / "dokumente_metadata.json"
			documents_dir.mkdir(parents=True, exist_ok=True)

			doc = scraper.SourceDocument(
				entry_key="k-new",
				url="https://example.org/new.pdf",
				title="Neu",
				description="",
				category_top="Top",
				category_sub="Sub",
			)

			original_data_dir = scraper.DATA_DIR
			original_documents_dir = scraper.DOCUMENTS_DIR
			original_metadata_file = scraper.METADATA_FILE
			try:
				scraper.DATA_DIR = data_dir
				scraper.DOCUMENTS_DIR = documents_dir
				scraper.METADATA_FILE = metadata_file

				with patch("scripts.scraper_dokumente.build_session", return_value=object()), \
					 patch("scripts.scraper_dokumente.load_metadata", return_value={"documents": []}), \
					 patch("scripts.scraper_dokumente.crawl_all_documents", return_value=([doc], {"k-new"})), \
					 patch("scripts.scraper_dokumente.head_metadata", return_value={"content_length": "1", "last_modified": "", "etag": "", "content_type": "application/pdf"}), \
					 patch("scripts.scraper_dokumente.download_file", return_value=(True, "")), \
					 patch("scripts.scraper_dokumente.compute_sha256", return_value="hash"), \
					 patch("scripts.scraper_dokumente.time.sleep"), \
					 patch("scripts.scraper_dokumente.send_new_without_description_notification", return_value=True), \
					 patch("scripts.scraper_dokumente.remove_deleted_documents", return_value=0):
					exit_code = scraper.main()

				self.assertEqual(exit_code, 0)
				self.assertTrue(metadata_file.exists())
			finally:
				scraper.DATA_DIR = original_data_dir
				scraper.DOCUMENTS_DIR = original_documents_dir
				scraper.METADATA_FILE = original_metadata_file

	def test_main_returns_failure_on_missing_coverage(self):
		with tempfile.TemporaryDirectory() as tmp:
			base = Path(tmp)
			data_dir = base / "data"
			documents_dir = data_dir / "documents"
			metadata_file = data_dir / "dokumente_metadata.json"
			documents_dir.mkdir(parents=True, exist_ok=True)

			doc = scraper.SourceDocument(
				entry_key="k-new",
				url="https://example.org/new.pdf",
				title="Neu",
				description="x",
				category_top="Top",
				category_sub="Sub",
			)

			original_data_dir = scraper.DATA_DIR
			original_documents_dir = scraper.DOCUMENTS_DIR
			original_metadata_file = scraper.METADATA_FILE
			try:
				scraper.DATA_DIR = data_dir
				scraper.DOCUMENTS_DIR = documents_dir
				scraper.METADATA_FILE = metadata_file

				with patch("scripts.scraper_dokumente.build_session", return_value=object()), \
					 patch("scripts.scraper_dokumente.load_metadata", return_value={"documents": []}), \
					 patch("scripts.scraper_dokumente.crawl_all_documents", return_value=([doc], {"missing-key"})), \
					 patch("scripts.scraper_dokumente.head_metadata", return_value={"content_length": "1", "last_modified": "", "etag": "", "content_type": "application/pdf"}), \
					 patch("scripts.scraper_dokumente.download_file", return_value=(True, "")), \
					 patch("scripts.scraper_dokumente.compute_sha256", return_value="hash"), \
					 patch("scripts.scraper_dokumente.time.sleep"), \
					 patch("scripts.scraper_dokumente.remove_deleted_documents", return_value=0):
					exit_code = scraper.main()

				self.assertEqual(exit_code, 1)
			finally:
				scraper.DATA_DIR = original_data_dir
				scraper.DOCUMENTS_DIR = original_documents_dir
				scraper.METADATA_FILE = original_metadata_file

	def test_build_local_path_without_subcategory(self):
		doc = scraper.SourceDocument(
			entry_key="k",
			url="https://example.org/file.pdf",
			title="Titel",
			description="",
			category_top="Top",
			category_sub="",
		)
		result = scraper.build_local_path(doc, set())
		self.assertEqual(str(result), "documents/Top/file.pdf")

	def test_should_redownload_on_category_or_etag_change(self):
		with tempfile.TemporaryDirectory() as tmp:
			local = Path(tmp) / "a.pdf"
			local.write_bytes(b"abc")
			doc = scraper.SourceDocument("k", "https://e.org/a.pdf", "Titel", "desc", "Top2", "Sub")
			old = {
				"description": "desc",
				"title": "Titel",
				"category_top": "Top1",
				"category_sub": "Sub",
				"content_length": "3",
				"last_modified": "old",
				"etag": "old-etag",
			}
			self.assertTrue(scraper.should_redownload(doc, old, local, {}))

			doc_same = scraper.SourceDocument("k", "https://e.org/a.pdf", "Titel", "desc", "Top1", "Sub")
			head = {"content_length": "3", "last_modified": "old", "etag": "new-etag"}
			self.assertTrue(scraper.should_redownload(doc_same, old, local, head))

	def test_remove_deleted_documents_skips_current_and_empty_paths(self):
		with tempfile.TemporaryDirectory() as tmp:
			original_data_dir = scraper.DATA_DIR
			scraper.DATA_DIR = Path(tmp)
			try:
				old_by_key = {
					"keep": {"local_path": "documents/A/keep.pdf"},
					"empty": {"local_path": ""},
				}
				p = scraper.DATA_DIR / "documents/A/keep.pdf"
				p.parent.mkdir(parents=True, exist_ok=True)
				p.write_bytes(b"x")
				removed = scraper.remove_deleted_documents(old_by_key, {"keep"}, set())
				self.assertEqual(removed, 0)
				self.assertTrue(p.exists())
			finally:
				scraper.DATA_DIR = original_data_dir

	def test_send_telegram_message_subprocess_exception(self):
		with tempfile.TemporaryDirectory() as tmp:
			script_dir = Path(tmp)
			(script_dir / "telegram_messenger.py").write_text("print('ok')", encoding="utf-8")
			original_script_dir = scraper.SCRIPT_DIR
			scraper.SCRIPT_DIR = script_dir
			try:
				with patch("scripts.scraper_dokumente.subprocess.run", side_effect=RuntimeError("boom")):
					self.assertFalse(scraper.send_telegram_message("hello"))
			finally:
				scraper.SCRIPT_DIR = original_script_dir

	def test_main_handles_old_metadata_parsing_and_download_failure(self):
		with tempfile.TemporaryDirectory() as tmp:
			base = Path(tmp)
			data_dir = base / "data"
			documents_dir = data_dir / "documents"
			metadata_file = data_dir / "dokumente_metadata.json"
			documents_dir.mkdir(parents=True, exist_ok=True)

			doc_old = scraper.SourceDocument("k-old", "https://example.org/old.pdf", "Alt", "desc", "Top", "Sub")
			doc_fail = scraper.SourceDocument("k-fail", "https://example.org/fail.pdf", "Fail", "desc", "Top", "Sub")

			old_metadata = {
				"documents": [
					"invalid",
					{
						"url": "https://example.org/old.pdf",
						"title": "Alt",
						"category_top": "Top",
						"category_sub": "Sub",
						"local_path": "documents/Top/Sub/old.pdf",
						"downloaded_at": "t",
						"sha256": "h",
					},
				]
			}

			original_data_dir = scraper.DATA_DIR
			original_documents_dir = scraper.DOCUMENTS_DIR
			original_metadata_file = scraper.METADATA_FILE
			try:
				scraper.DATA_DIR = data_dir
				scraper.DOCUMENTS_DIR = documents_dir
				scraper.METADATA_FILE = metadata_file

				with patch("scripts.scraper_dokumente.build_session", return_value=object()), \
					 patch("scripts.scraper_dokumente.load_metadata", return_value=old_metadata), \
					 patch("scripts.scraper_dokumente.crawl_all_documents", return_value=([doc_old, doc_fail], {"k-old", "k-fail"})), \
					 patch("scripts.scraper_dokumente.head_metadata", return_value={"content_length": "1", "last_modified": "", "etag": "", "content_type": "application/pdf"}), \
					 patch("scripts.scraper_dokumente.should_redownload", side_effect=[False, True]), \
					 patch("scripts.scraper_dokumente.download_file", return_value=(False, "down-error")), \
					 patch("scripts.scraper_dokumente.remove_deleted_documents", return_value=0), \
					 patch("scripts.scraper_dokumente.time.sleep"):
					exit_code = scraper.main()

				self.assertEqual(exit_code, 1)
			finally:
				scraper.DATA_DIR = original_data_dir
				scraper.DOCUMENTS_DIR = original_documents_dir
				scraper.METADATA_FILE = original_metadata_file


if __name__ == "__main__":
	unittest.main()
