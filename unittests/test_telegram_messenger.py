import pytest
import json
import sys
import requests
import requests_mock
from unittest.mock import patch
from scripts.telegram_messenger import TelegramMessenger, main as messenger_main

# --- FIXTURES ---

@pytest.fixture
def mock_config(tmp_path):
    """Erstellt eine temporäre, absolute Konfigurationsdatei."""
    config_data = {"bot_token": "123:ABC", "chat_id": "987"}
    config_file = tmp_path / "config_msgr.json"
    config_file.write_text(json.dumps(config_data))
    return str(config_file)

@pytest.fixture
def messenger(mock_config):
    """
    Da mock_config ein absoluter Pfad ist, ignoriert os.path.join in der 
    load_config-Methode das Skript-Verzeichnis automatisch. Kein Patching nötig!
    """
    return TelegramMessenger(config_file=mock_config)


# --- KLASSEN- & FEHLER-TESTS ---

def test_load_config_not_found():
    with pytest.raises(SystemExit) as e:
        TelegramMessenger(config_file="/pfad/den/es/nicht/gibt.json")
    assert e.value.code == 1

def test_load_config_invalid_json(tmp_path):
    bad = tmp_path / "bad.json"
    bad.write_text("{ 'kaputt': ")
    with pytest.raises(SystemExit) as e:
        TelegramMessenger(config_file=str(bad))
    assert e.value.code == 1

def test_load_config_missing_keys(tmp_path):
    inc = tmp_path / "inc.json"
    inc.write_text('{"bot_token": "123"}')
    with pytest.raises(SystemExit) as e:
        TelegramMessenger(config_file=str(inc))
    assert e.value.code == 1

def test_send_message_success(messenger):
    with requests_mock.Mocker() as m:
        m.post(f"https://api.telegram.org/bot{messenger.bot_token}/sendMessage", json={"ok": True})
        assert messenger.send_message("Test") is True

def test_send_message_api_error(messenger):
    with requests_mock.Mocker() as m:
        m.post(f"https://api.telegram.org/bot{messenger.bot_token}/sendMessage", json={"ok": False, "description": "Fail"})
        assert messenger.send_message("Test") is False

def test_send_message_network_error(messenger):
    with requests_mock.Mocker() as m:
        m.post(f"https://api.telegram.org/bot{messenger.bot_token}/sendMessage", exc=requests.exceptions.ConnectionError)
        assert messenger.send_message("Test") is False

def test_send_message_json_decode_error(messenger):
    with requests_mock.Mocker() as m:
        m.post(f"https://api.telegram.org/bot{messenger.bot_token}/sendMessage", text="Kein JSON")
        assert messenger.send_message("Test") is False

def test_send_status_message(messenger):
    with requests_mock.Mocker() as m:
        m.post(f"https://api.telegram.org/bot{messenger.bot_token}/sendMessage", json={"ok": True})
        # Testet den If-Zweig mit Details
        messenger.send_status_message("Titel", "ERROR", "Details")
        # Testet einen unbekannten Status ohne Details
        messenger.send_status_message("Titel", "UNKNOWN")

def test_test_connection_success(messenger):
    with requests_mock.Mocker() as m:
        m.get(f"https://api.telegram.org/bot{messenger.bot_token}/getMe", json={"ok": True, "result": {"first_name": "Bot"}})
        assert messenger.test_connection() is True

def test_test_connection_api_error(messenger):
    with requests_mock.Mocker() as m:
        m.get(f"https://api.telegram.org/bot{messenger.bot_token}/getMe", json={"ok": False})
        assert messenger.test_connection() is False

def test_test_connection_network_error(messenger):
    with requests_mock.Mocker() as m:
        m.get(f"https://api.telegram.org/bot{messenger.bot_token}/getMe", exc=requests.exceptions.ConnectionError)
        assert messenger.test_connection() is False


# --- CLI TESTS (MAIN-FUNKTION) ---
# Hier patchen wir die komplette Klasse, damit main() nicht versucht, 
# echte Dateien zu laden oder Requests zu senden.

def test_main_no_args():
    with patch.object(sys, 'argv', ['messenger.py']):
        with pytest.raises(SystemExit) as e:
            messenger_main()
        assert e.value.code == 1

@patch("scripts.telegram_messenger.TelegramMessenger")
def test_main_test_flag(mock_class):
    with patch.object(sys, 'argv', ['messenger.py', '--test']):
        messenger_main()
        mock_class.return_value.test_connection.assert_called_once()

@patch("scripts.telegram_messenger.TelegramMessenger")
def test_main_status_flag_not_enough_args(mock_class):
    with patch.object(sys, 'argv', ['messenger.py', '--status', 'Titel']):
        with pytest.raises(SystemExit) as e:
            messenger_main()
        assert e.value.code == 1

@patch("scripts.telegram_messenger.TelegramMessenger")
def test_main_status_flag_full(mock_class):
    with patch.object(sys, 'argv', ['messenger.py', '--status', 'Titel', 'SUCCESS', 'Details']):
        messenger_main()
        mock_class.return_value.send_status_message.assert_called_with('Titel', 'SUCCESS', 'Details')

@patch("scripts.telegram_messenger.TelegramMessenger")
def test_main_status_flag_no_details(mock_class):
    with patch.object(sys, 'argv', ['messenger.py', '--status', 'Titel', 'INFO']):
        messenger_main()
        mock_class.return_value.send_status_message.assert_called_with('Titel', 'INFO', '')

@patch("scripts.telegram_messenger.TelegramMessenger")
def test_main_simple_message(mock_class):
    with patch.object(sys, 'argv', ['messenger.py', 'Das', 'ist', 'ein', 'Test']):
        messenger_main()
        mock_class.return_value.send_message.assert_called_with('Das ist ein Test')