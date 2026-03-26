import pytest
import json
import sys
import os
import requests
import requests_mock
from urllib.parse import unquote
from unittest.mock import patch
from scripts.telegram_messenger import TelegramMessenger, main as messenger_main

# --- FIXTURES ---

@pytest.fixture
def mock_config(tmp_path):
    """Erstellt eine temporäre Konfigurationsdatei für die Tests."""
    config_data = {"bot_token": "123:ABC", "chat_id": "987"}
    config_file = tmp_path / "config_msgr.json"
    config_file.write_text(json.dumps(config_data))
    return config_file

@pytest.fixture
def messenger(mock_config):
    """Initialisiert den Messenger mit der Test-Konfiguration."""
    return TelegramMessenger(config_file=str(mock_config))

# --- TESTS FÜR KLASSE & FEHLERBEHANDLUNG ---

class TestTelegramMessenger:
    def test_send_message_http_error(self, messenger):
        """Provoziert einen 500er Fehler, um die Zeilen in der Fehlerbehandlung zu testen."""
        with requests_mock.Mocker() as m:
            m.post(f"https://api.telegram.org/bot{messenger.bot_token}/sendMessage", 
                   status_code=500)
            assert messenger.send_message("Test") is False

    def test_invalid_json_config(self, tmp_path):
        """Testet eine korrupte Config-Datei."""
        bad_config = tmp_path / "bad_config.json"
        bad_config.write_text("{ 'invalid': json }")
        with pytest.raises(SystemExit):
            TelegramMessenger(config_file=str(bad_config))
    def test_config_file_not_found(self):
        """Testet das Verhalten, wenn die Datei gar nicht existiert."""
        with pytest.raises(SystemExit) as e:
            TelegramMessenger(config_file="pfad/zu/nichts.json")
        assert e.value.code == 1

    def test_config_missing_keys(self, tmp_path):
        """Testet valides JSON, dem aber wichtige Schlüssel fehlen."""
        # Nur bot_token, chat_id fehlt
        incomplete_config = tmp_path / "incomplete.json"
        incomplete_config.write_text(json.dumps({"bot_token": "123:ABC"}))
        
        with pytest.raises(SystemExit) as e:
            TelegramMessenger(config_file=str(incomplete_config))
        assert e.value.code == 1

    def test_config_empty_file(self, tmp_path):
        """Testet eine komplett leere Datei."""
        empty_config = tmp_path / "empty.json"
        empty_config.write_text("")
        
        with pytest.raises(SystemExit) as e:
            TelegramMessenger(config_file=str(empty_config))
        assert e.value.code == 1

    def test_config_load_success(self, tmp_path):
        """Testet den Erfolgsfall: Datei existiert und ist vollständig (das 'Else')."""
        valid_config = tmp_path / "valid_config.json"
        data = {
            "bot_token": "123456:ABC-DEF",
            "chat_id": "987654321"
        }
        valid_config.write_text(json.dumps(data))
        
        # Initialisierung sollte ohne SystemExit durchlaufen
        messenger = TelegramMessenger(config_file=str(valid_config))
        
        # Überprüfen, ob die Werte korrekt zugewiesen wurden
        assert messenger.bot_token == "123456:ABC-DEF"
        assert messenger.chat_id == "987654321"

    def test_connection_corrupt_json(self, messenger):
        """Testet den Fall, dass die API kein valides JSON zurückgibt (JSONDecodeError)."""
        url = f"https://api.telegram.org/bot{messenger.bot_token}/getMe"
        with requests_mock.Mocker() as m:
            # Wir geben einen String zurück, der kein JSON ist (z.B. ein HTML Error Page)
            m.get(url, text="<html><body>502 Bad Gateway</body></html>")
            
            # Dies wird den json.JSONDecodeError beim Aufruf von response.json() auslösen
            result = messenger.test_connection()
            
            assert result is False

# --- TESTS FÜR DIE CLI (MAIN FUNKTION) ---

def test_main_help_exit():
    """Testet den Aufruf ohne Argumente."""
    with patch.object(sys, 'argv', ['messenger.py']):
        with pytest.raises(SystemExit) as e:
            messenger_main()
        assert e.value.code == 1

def test_main_full_flow_status(mock_config):
    """Simuliert: python messenger.py --status 'Titel' 'SUCCESS' 'Details'"""
    with patch("scripts.telegram_messenger.TelegramMessenger.send_status_message", return_value=True) as mock_meth, \
         patch.object(sys, 'argv', ['messenger.py', '--status', 'Titel', 'SUCCESS', 'Details']), \
         patch("scripts.telegram_messenger.os.path.join", return_value=str(mock_config)):
        
        messenger_main()
        mock_meth.assert_called_with('Titel', 'SUCCESS', 'Details')

def test_main_full_flow_test(mock_config):
    """Simuliert: python messenger.py --test"""
    with patch("scripts.telegram_messenger.TelegramMessenger.test_connection", return_value=True) as mock_meth, \
         patch.object(sys, 'argv', ['messenger.py', '--test']), \
         patch("scripts.telegram_messenger.os.path.join", return_value=str(mock_config)):
        
        messenger_main()
        mock_meth.assert_called_once()

# --- SPEZIFISCHE LOGIK-TESTS ---

class TestMessengerSpecifics:

    def test_send_status_message_all_icons(self, messenger):
        """Testet alle Icon-Varianten und dekodiert den Request für den Vergleich."""
        with requests_mock.Mocker() as m:
            adapter = m.post(f"https://api.telegram.org/bot{messenger.bot_token}/sendMessage", json={"ok": True})
            
            # Test WARNING
            messenger.send_status_message("System", "WARNING", "Niedriger Speicher")
            decoded_body = unquote(adapter.last_request.text)
            assert "[WARNUNG]" in decoded_body
            
            # Test unbekannter Status
            messenger.send_status_message("System", "UNKNOWN", "Etwas ist passiert")
            decoded_body_unknown = unquote(adapter.last_request.text)
            assert "[STATUS]" in decoded_body_unknown

    def test_connection_exception(self, messenger):
        """Testet den 'except'-Block bei einem Verbindungsfehler."""
        url = f"https://api.telegram.org/bot{messenger.bot_token}/getMe"
        with requests_mock.Mocker() as m:
            m.get(url, exc=requests.exceptions.ConnectTimeout)
            result = messenger.test_connection()
            assert result is False

    def test_connection_api_says_no(self, messenger):
        """Testet den Zweig, wenn result.get('ok') False ist."""
        url = f"https://api.telegram.org/bot{messenger.bot_token}/getMe"
        with requests_mock.Mocker() as m:
            m.get(url, json={"ok": False, "description": "Forbidden"})
            result = messenger.test_connection()
            assert result is False

    def test_connection_success_output(self, messenger, capsys):
        """Testet den Erfolg und die Konsolenausgabe."""
        url = f"https://api.telegram.org/bot{messenger.bot_token}/getMe"
        with requests_mock.Mocker() as m:
            m.get(url, json={
                "ok": True, 
                "result": {"first_name": "TobiBot", "username": "tobi_bot"}
            })
            result = messenger.test_connection()
            captured = capsys.readouterr()
            assert result is True
            assert "TobiBot" in captured.out