# tests/test_scraper_dokumente_extended.py
import os
import pytest
from unittest.mock import MagicMock, mock_open, patch
import sys
import json
from pathlib import Path
import requests  # wichtig für Exception-Tests

scripts_dir = Path(__file__).parent.parent / "scripts"
sys.path.insert(0, str(scripts_dir))
import scraper_dokumente as scraper

@pytest.fixture
def setup_dirs(tmp_path, monkeypatch):
    data_dir = tmp_path / "data"
    documents_dir = data_dir / "documents"
    monkeypatch.setattr(scraper, "DATA_DIR", str(data_dir))
    monkeypatch.setattr(scraper, "DOCUMENTS_DIR", str(documents_dir))
    monkeypatch.setattr(scraper, "METADATA_FILE", str(data_dir / "dokumente_metadata.json"))
    yield

# ------------------------------
# get_file_metadata
# ------------------------------
def test_get_file_metadata_success(mocker):
    response = MagicMock()
    response.headers = {'Content-Length': '123', 'Last-Modified': 'today', 'Content-Type': 'application/pdf'}
    mocker.patch('scraper_dokumente.requests.head', return_value=response)
    meta = scraper.get_file_metadata("https://example.com/file.pdf")
    assert meta['size'] == '123'
    assert meta['last_modified'] == 'today'
    assert meta['content_type'] == 'application/pdf'

def test_get_file_metadata_failure(mocker):
    mocker.patch('scraper_dokumente.requests.head', side_effect=Exception("Fail"))
    meta = scraper.get_file_metadata("https://example.com/file.pdf")
    assert meta is None

def test_get_file_metadata_exceptions(mocker):
    mocker.patch("requests.head", side_effect=requests.ConnectionError)
    meta = scraper.get_file_metadata("https://example.com/file.pdf")
    assert meta is None

# ------------------------------
# sanitize / normalize
# ------------------------------
def test_sanitize_filename_and_category():
    # Sonderzeichen
    assert scraper.sanitize_filename("a<>:/\\|?*b.pdf") == "a________b.pdf"
    # langer Name
    long_name = "a"*300 + ".txt"
    sanitized = scraper.sanitize_filename(long_name)
    assert len(sanitized) <= 204
    # Kategorie edge-cases
    assert scraper.sanitize_category_name("///") == "Allgemein"
    assert scraper.sanitize_category_name("") == "Allgemein"
    assert scraper.sanitize_category_name("  Cat / Sub  ") == "Cat/Sub"

def test_normalize_top_category_all_sections():
    assert scraper.normalize_top_category("DOKUMENTE FÜR DUALE PARTNER") == "Duale Partner"
    assert scraper.normalize_top_category("Studienbereich Technik") == "Dokumente der Fakultät Technik"
    assert scraper.normalize_top_category("Fakultät Wirtschaft") == "Dokumente der Fakultät Wirtschaft"
    assert scraper.normalize_top_category("Flyer der DHBW Ravensburg") == "Broschüren & Berichte"
    assert scraper.normalize_top_category("Zulassung und Immatrikulation Studierender") == "Bewerbung & Zulassung"
    assert scraper.normalize_top_category("Studien- und Prüfungsordnung") == "Studien- und Prüfungsordnung"
    assert scraper.normalize_top_category("Random Section") is None

def test_normalize_top_category_edge():
    assert scraper.normalize_top_category("") is None
    assert scraper.normalize_top_category(None) is None
    assert scraper.normalize_top_category("Unbekannte Sektion") is None

# ------------------------------
# download_file
# ------------------------------
def test_download_file_error(tmp_path, mocker):
    mocker.patch("scraper_dokumente.requests.get", side_effect=Exception("Fail"))
    result = scraper.download_file("https://example.com/file.pdf", tmp_path / "file.pdf")
    assert result is False

def test_download_file_exceptions(tmp_path, mocker):
    bad_url = "https://example.com/file.pdf"
    mocker.patch("requests.get", side_effect=requests.Timeout)
    save_path = tmp_path / "file.pdf"
    result = scraper.download_file(bad_url, save_path)
    assert result is False

# ------------------------------
# extract_documents_from_page
# ------------------------------
def test_extract_documents_edge_cases(mocker):
    html = """
    <html>
        <h2>Studienbereich Technik</h2>
        <h3>Subsection</h3>
        <a href="fileadmin/file.pdf">File 1</a>
        <a href="javascript:void(0)">Invalid Link</a>
        <a href="fileadmin/file2">File 2 no ext</a>
        <p>Description for File 2</p>
        <a href="fileadmin/amtliche_doc.pdf">Amtliche</a>
    </html>
    """
    mocker.patch("scraper_dokumente.requests.get", return_value=MagicMock(content=html.encode(), raise_for_status=lambda: None))
    docs = scraper.extract_documents_from_page("https://example.com")
    urls = [d['url'] for d in docs]
    assert any("file.pdf" in u for u in urls)
    assert all("amtliche" not in u.lower() for u in urls)
    categories = [d['category'] for d in docs]
    assert all("Dokumente der Fakultät Technik" in c for c in categories)

def test_extract_documents_descriptions(mocker):
    html = """
    <html>
        <h2>Studienbereich Technik</h2>
        <a href="fileadmin/file1.pdf">Link 1</a>
        <p>Description sibling</p>
        <a href="fileadmin/file2.pdf">Link 2</a>
        <div>Description parent sibling</div>
        <a href="fileadmin/file3.pdf">Link 3</a>
        Text after link
    </html>
    """
    mock_resp = MagicMock(content=html.encode(), raise_for_status=lambda: None)
    mocker.patch("scraper_dokumente.requests.get", return_value=mock_resp)
    docs = scraper.extract_documents_from_page("https://example.com")
    assert len(docs) == 3
    descriptions = [d['description'] for d in docs]
    assert "Description sibling" in descriptions
    assert "Description parent sibling" in descriptions
    assert descriptions[-1] == ""
# ------------------------------
# has_file_changed / has_description_changed
# ------------------------------
def test_has_file_changed_edge(mocker):
    assert scraper.has_file_changed({"url": "x"}, None) is True
    mocker.patch("scraper_dokumente.get_file_metadata", return_value=None)
    assert scraper.has_file_changed({"url": "x"}, {"file_size": "123", "last_modified": "y"}) is True
    mocker.patch("scraper_dokumente.get_file_metadata", return_value={"size": "456", "last_modified": "y"})
    old_doc = {"file_size": "123", "last_modified": "y"}
    assert scraper.has_file_changed({"url": "x"}, old_doc) is True
    mocker.patch("scraper_dokumente.get_file_metadata", return_value={"size": "123", "last_modified": "y"})
    old_doc = {"file_size": "123", "last_modified": "y"}
    assert scraper.has_file_changed({"url": "x"}, old_doc) is False

def test_has_description_changed_edge():
    doc = {"description": "new"}
    assert scraper.has_description_changed(doc, None) is True
    old_doc = {"description": "new"}
    assert scraper.has_description_changed(doc, old_doc) is False

# ------------------------------
# main()
# ------------------------------
def test_main_multiple_cases(setup_dirs, mocker):
    docs = [
        {"url": "url1", "filename": "f1.pdf", "title": "new", "category": "Cat", "description": "Desc"},
        {"url": "url2", "filename": "f2.pdf", "title": "filechanged", "category": "Cat", "description": "Desc2"},
        {"url": "url3", "filename": "f3.pdf", "title": "descchanged", "category": "Cat", "description": "NewDesc"},
        {"url": "url4", "filename": "f4.pdf", "title": "unchanged", "category": "Cat", "description": "Same"}
    ]
    old_docs = [
        {"url": "url2", "file_size": "0", "last_modified": "old", "downloaded_at": "", "description": "Desc2"},
        {"url": "url3", "file_size": "123", "last_modified": "today", "downloaded_at": "", "description": "OldDesc"},
        {"url": "url4", "file_size": "123", "last_modified": "today", "downloaded_at": "", "description": "Same", "description_updated_at": ""}
    ]
    mocker.patch("scraper_dokumente.load_metadata", return_value={"documents": old_docs})
    mocker.patch("scraper_dokumente.extract_documents_from_page", return_value=docs)
    mocker.patch("scraper_dokumente.get_file_metadata", return_value={"size": "123", "last_modified": "today", "content_type": "application/pdf"})
    mocker.patch("scraper_dokumente.download_file", return_value=True)
    mocker.patch("time.sleep", return_value=None)
    
    scraper.main()
    assert os.path.exists(scraper.METADATA_FILE)
    with open(scraper.METADATA_FILE) as f:
        data = f.read()
    for d in ["new", "filechanged", "descchanged", "unchanged"]:
        assert d in data

def test_main_no_documents(mocker):
    mocker.patch("scraper_dokumente.load_metadata", return_value=None)
    mocker.patch("scraper_dokumente.extract_documents_from_page", return_value=[])
    mocker.patch("time.sleep", return_value=None)
    scraper.main()

# ------------------------------
# Erfolgreiches Laden
# ------------------------------
def test_load_metadata_success():
    data = {"documents": [{"url": "url1"}]}
    m = mock_open(read_data=json.dumps(data))
    with patch("builtins.open", m), patch("os.path.exists", return_value=True):
        result = scraper.load_metadata()
        assert result == data
        m.assert_called_once_with(scraper.METADATA_FILE, 'r', encoding='utf-8')

# ------------------------------
# Datei existiert nicht
# ------------------------------
def test_load_metadata_file_missing():
    with patch("os.path.exists", return_value=False):
        result = scraper.load_metadata()
        assert result is None

# ------------------------------
# Fehler beim Laden (z.B. ungültiges JSON)
# ------------------------------
def test_load_metadata_invalid_json():
    m = mock_open(read_data="invalid json")
    with patch("builtins.open", m), patch("os.path.exists", return_value=True):
        result = scraper.load_metadata()
        assert result is None

# ------------------------------
# Erfolgreicher Download
# ------------------------------
def test_download_file_success(tmp_path, mocker):
    url = "https://example.com/file.pdf"
    save_path = tmp_path / "file.pdf"

    # Mock requests.get und iter_content
    mock_response = MagicMock()
    mock_response.iter_content.return_value = [b"chunk1", b"chunk2"]
    mock_response.raise_for_status.return_value = None

    mocker.patch("scraper_dokumente.requests.get", return_value=mock_response)

    result = scraper.download_file(url, save_path)
    assert result is True
    assert save_path.exists()
    content = save_path.read_bytes()
    assert content == b"chunk1chunk2"

# ------------------------------
# Download wirft Exception
# ------------------------------
def test_download_file_exception(tmp_path, mocker):
    url = "https://example.com/file.pdf"
    save_path = tmp_path / "file.pdf"

    mocker.patch("scraper_dokumente.requests.get", side_effect=Exception("Fail"))

    result = scraper.download_file(url, save_path)
    assert result is False
    assert not save_path.exists()

# ------------------------------
# Timeout-Fehler testen
# ------------------------------
def test_download_file_timeout(tmp_path, mocker):
    import requests
    url = "https://example.com/file.pdf"
    save_path = tmp_path / "file.pdf"

    mocker.patch("scraper_dokumente.requests.get", side_effect=requests.Timeout)

    result = scraper.download_file(url, save_path)
    assert result is False
    assert not save_path.exists()