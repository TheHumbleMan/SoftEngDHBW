#!/usr/bin/env python3
"""
Telegram Messenger Script
Sendet Nachrichten über einen Telegram Bot ans Handy

Dieses Programm funktioniert ohne config_msgr.json nicht,
ich habe diese allerdings absichtlich entfernt,
da ich meinen privaten Bot-Token und Chat-ID verwendet habe,
und diese nicht öffentlich machen möchte,
und die Nachrichten sowiso an meine Handy bzw. Telegram-Bot gehen würden.
Wenn sie es trotzden verwenden möchten können,
sie eine config_msgr.json mit ihren eigenen Daten erstellen.
"""

import requests
import json
import sys
import os
from datetime import datetime

class TelegramMessenger:
    def __init__(self, config_file="config_msgr.json"):
        """
        Initialisiert den Telegram Messenger
        
        Args:
            config_file (str): Pfad zur Konfigurationsdatei
        """
        self.config_file = config_file
        self.bot_token = None
        self.chat_id = None
        # Die Konfiguration wird direkt beim Start geladen
        self.loadConfig()
    
    def loadConfig(self):
        """Lädt die Konfiguration aus der config_msgr.json Datei"""
        try:
            # Die Datei liegt neben dem Skript und wird relativ dazu gesucht
            config_path = os.path.join(os.path.dirname(__file__), self.config_file)
            with open(config_path, 'r', encoding='utf-8') as f:
                config = json.load(f)
                self.bot_token = config.get('bot_token')
                self.chat_id = config.get('chat_id')
                
            if not self.bot_token or not self.chat_id:
                raise ValueError("Bot Token oder Chat ID fehlen in der Konfiguration")
                
        except FileNotFoundError:
            # Fehlende Konfiguration ist ein harter Abbruch weil ohne sie nichts gesendet werden kann
            print(f"Konfigurationsdatei '{self.config_file}' nicht gefunden!")
            print("Bitte erstellen Sie eine config_msgr.json mit bot_token und chat_id")
            sys.exit(1)
        except json.JSONDecodeError:
            # Ungültiges JSON wird separat behandelt dass die Ursache klar bleibt
            print(f"Fehler beim Lesen der Konfigurationsdatei '{self.config_file}'")
            sys.exit(1)
        except ValueError as e:
            print(f"Konfigurationsfehler: {e}")
            sys.exit(1)
    
    def sendMessage(self, message, parse_mode="HTML"):
        """
        Sendet eine Nachricht über Telegram
        
        Args:
            message (str): Die zu sendende Nachricht
            parse_mode (str): Formatierung der Nachricht (HTML, Markdown oder None)
        
        Returns:
            bool: True wenn erfolgreich gesendet, False bei Fehler
        """
        # Die Telegram-API erwartet die Bot-Token in der URL
        url = f"https://api.telegram.org/bot{self.bot_token}/sendMessage"
        
        # Nur die Pflichtfelder werden immer gesetzt, Formatierung optional
        payload = {
            'chat_id': self.chat_id,
            'text': message
        }
        
        if parse_mode:
            # Parse-Mode wird nur ergänzt, wenn Telegram den Text formatieren soll
            payload['parse_mode'] = parse_mode
        
        try:
            # Die Nachricht wird per POST an die API gesendet
            response = requests.post(url, data=payload, timeout=30)
            response.raise_for_status()
            
            result = response.json()
            if result.get('ok'):
                print(f"OK - Nachricht erfolgreich gesendet")
                return True
            else:
                print(f"FEHLER - Fehler beim Senden: {result.get('description', 'Unbekannter Fehler')}")
                return False
                
        except requests.exceptions.RequestException as e:
            print(f"FEHLER - Netzwerkfehler: {e}")
            return False
        except json.JSONDecodeError:
            print("FEHLER - Fehler beim Dekodieren der API-Antwort")
            return False
    
    def sendStatusMessage(self, title, status, details=""):
        """
        Sendet eine formatierte Status-Nachricht
        
        Args:
            title (str): Titel der Nachricht
            status (str): Status (SUCCESS, ERROR, WARNING, INFO)
        # Ein Standard-Timestamp macht Statusmeldungen zeitlich einordenbar
            details (str): Zusätzliche Details
        """
        # Kurze Icons helfen beim schnellen Lesen der Nachricht
        timestamp = datetime.now().strftime("%d.%m.%Y %H:%M:%S")
        
        status_icons = {
            "SUCCESS": "[OK]",
            "ERROR": "[FEHLER]", 
            "WARNING": "[WARNUNG]",
            "INFO": "[INFO]"
        # Unbekannte Statuswerte bekommen einen neutralen Platzhalter
        }
        
        # Die Nachricht wird als kleiner Block aufgebaut und dann versendet
        icon = status_icons.get(status.upper(), "[STATUS]")
        
        message = f"{icon} <b>{title}</b>\n"
        message += f"Zeit: {timestamp}\n"
        message += f"Status: {status}\n"
        
        if details:
            message += f"\nDetails:\n{details}"
        
        return self.sendMessage(message)
    
    def testConnection(self):
        """
        Testet die Verbindung zum Telegram Bot
        
        Returns:
            bool: True wenn Verbindung erfolgreich
        """
        # getMe ist der leichteste Weg, die Bot-Zugangsdaten zu prüfen
        url = f"https://api.telegram.org/bot{self.bot_token}/getMe"
        
        try:
            response = requests.get(url, timeout=10)
            response.raise_for_status()
            
            result = response.json()
            if result.get('ok'):
                bot_info = result.get('result', {})
                print(f"OK - Bot-Verbindung erfolgreich")
                print(f"Bot Name: {bot_info.get('first_name', 'Unbekannt')}")
                print(f"Username: @{bot_info.get('username', 'Unbekannt')}")
                return True
            else:
                print(f"FEHLER - Bot-Test fehlgeschlagen: {result.get('description')}")
                return False
                
        except requests.exceptions.RequestException as e:
            print(f"FEHLER - Verbindungsfehler: {e}")
            return False

def main():
    """Hauptfunktion für Kommandozeilennutzung"""
    if len(sys.argv) < 2:
        # Ohne Argumente wird nur die Nutzung angezeigt
        print("Verwendung:")
        print(f"  {sys.argv[0]} 'Ihre Nachricht'")
        print(f"  {sys.argv[0]} --test")
        print(f"  {sys.argv[0]} --status 'Titel' 'Status' 'Details'")
        sys.exit(1)
    
    messenger = TelegramMessenger()
    
    if sys.argv[1] == "--test":
        # Verbindungsprüfung ohne eigentliche Nachricht
        messenger.testConnection()
    elif sys.argv[1] == "--status":
        # Statusmeldungen bekommen eine feste Struktur aus Titel, Status und Details
        if len(sys.argv) < 4:
            print("Für Status-Nachrichten sind mindestens Titel und Status erforderlich")
            sys.exit(1)
        
        title = sys.argv[2]
        status = sys.argv[3]
        details = sys.argv[4] if len(sys.argv) > 4 else ""
        
        messenger.sendStatusMessage(title, status, details)
    else:
        # Alle übrigen Argumente werden zu einer einfachen Nachricht zusammengesetzt
        message = " ".join(sys.argv[1:])
        messenger.sendMessage(message)

if __name__ == "__main__":
    main()
