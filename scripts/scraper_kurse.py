#!/usr/bin/env python3
"""
Web Scraper für DHBW Kursnamen
Durchsucht https://dhbw.app/RV und https://dhbw.app/FN nach Kursnamen (z.B. TIT24) und speichert diese in Dateien.
Muss einmal jährlich am Anfang des Studienjahres entweder durch einen Cronjob oder manuell ausgeführt werden um die Kurslisten zu aktualisieren.
"""

from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.chrome.service import Service
import re
import json
from datetime import datetime
import time


def scrape_course_names(url):
    """
    Scrapet Kursnamen von einer DHBW.app Website mit Selenium.
    
    Args:
        url: Die URL der zu scrapenden Website
        
    Returns:
        Ein Tuple (site_code, list von Kursnamen)
    """
    driver = None
    try:
        # Extrahiere Site-Code aus der URL
        site_code = url.split('/')[-1]  # z.B. 'RV' oder 'FN'
        
        # Chrome-Optionen konfigurieren
        chrome_options = Options()
        chrome_options.add_argument('--headless')  # Kein sichtbares Fenster
        chrome_options.add_argument('--no-sandbox')
        chrome_options.add_argument('--disable-dev-shm-usage')
        chrome_options.add_argument('--disable-gpu')
        chrome_options.add_argument('--window-size=1920,1080')
        
        # WebDriver initialisieren
        driver = webdriver.Chrome(options=chrome_options)
        
        # Website laden
        print(f"Rufe Website ab: {url}")
        driver.get(url)
        
        # Warten bis die Seite geladen ist und Links vorhanden sind
        print(f"Warte auf Seiteninhalt ({site_code})...")
        WebDriverWait(driver, 10).until(
            EC.presence_of_element_located((By.TAG_NAME, "a"))
        )
        
        # Zusätzliche Zeit für JavaScript-Rendering
        time.sleep(1)
        
        # Alle Links finden
        all_links = driver.find_elements(By.TAG_NAME, "a")
        
        # Kursnamen extrahieren
        course_names = []
        search_pattern = f'/c/{site_code}-'
        
        for link in all_links:
            try:
                href = link.get_attribute('href')
                text = link.text.strip()
                
                # Prüfe ob Link auf einen Kurs zeigt und der Text ein Kursname ist
                if href and search_pattern in href and text and re.match(r'^[A-Z]+\d+$', text):
                    course_names.append(text)
            except:
                continue
        
        # Duplikate entfernen und sortieren
        course_names = sorted(set(course_names))
        
        print(f"{len(course_names)} Kurse gefunden ({site_code})")
        return site_code, course_names
        
    except Exception as e:
        print(f"Fehler beim Scrapen von {url}: {e}")
        return site_code, []
    finally:
        # Browser schließen
        if driver:
            driver.quit()


def save_to_txt(course_names, filename="kurse.txt"):
    """
    Speichert Kursnamen in einer Textdatei.
    
    Args:
        course_names: Liste von Kursnamen
        filename: Name der Ausgabedatei
    """
    try:
        # Erstelle Verzeichnis falls nicht vorhanden
        import os
        os.makedirs(os.path.dirname(filename) if os.path.dirname(filename) else '.', exist_ok=True)
        
        with open(filename, 'w', encoding='utf-8') as f:
            f.write(f"# DHBW Ravensburg Kurse\n")
            f.write(f"# Erstellt am: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}\n")
            f.write(f"# Anzahl: {len(course_names)}\n\n")
            
            for course in course_names:
                f.write(f"{course}\n")
        
        print(f"Kurse gespeichert in: {filename}")
        return True
        
    except Exception as e:
        print(f"Fehler beim Speichern: {e}")
        return False


def save_to_json(course_names, filename="kurse.json", site_code=""):
    """
    Speichert Kursnamen in einer JSON-Datei.
    
    Args:
        course_names: Liste von Kursnamen
        filename: Name der Ausgabedatei
        site_code: Code des Standortes (z.B. RV, FN)
    """
    try:
        # Erstelle Verzeichnis falls nicht vorhanden
        import os
        os.makedirs(os.path.dirname(filename) if os.path.dirname(filename) else '.', exist_ok=True)
        
        data = {
            "timestamp": datetime.now().isoformat(),
            "source": f"https://dhbw.app/{site_code}" if site_code and site_code != "ALL" else "https://dhbw.app (Multi-Site)",
            "site": site_code if site_code else "UNKNOWN",
            "count": len(course_names),
            "courses": course_names
        }
        
        with open(filename, 'w', encoding='utf-8') as f:
            json.dump(data, f, indent=2, ensure_ascii=False)
        
        print(f"Kurse gespeichert in: {filename}")
        return True
        
    except Exception as e:
        print(f"Fehler beim Speichern: {e}")
        return False


def main():
    """Hauptfunktion des Scrapers"""
    
    print("DHBW Kurs-Scraper gestartet...")
    
    # URLs der zu scrapenden Websites
    urls = [
        "https://dhbw.app/RV",  # Ravensburg
        "https://dhbw.app/FN",  # Friedrichshafen
    ]
    
    # Scrape alle Websites
    all_courses = {}
    total_courses = 0
    
    for url in urls:
        site_code, course_names = scrape_course_names(url)
        if course_names:
            all_courses[site_code] = course_names
            total_courses += len(course_names)
    
    # Kombinierte Kursliste (alle Kurse von allen Sites)
    combined_courses = []
    for courses in all_courses.values():
        combined_courses.extend(courses)
    combined_courses = sorted(set(combined_courses))
    
    if all_courses:
        print(f"\n{'Standort':<12} {'Kurse':<10}")
        print("-" * 22)
        for site, courses in all_courses.items():
            print(f"{site:<12} {len(courses):<10}")
        print("-" * 22)
        print(f"{'Gesamt':<12} {total_courses:<10}")
        print(f"{'Eindeutig':<12} {len(combined_courses):<10}")
        
        # Speichere einzeln
        for site, courses in all_courses.items():
            # filename = f"data/kurse_{site.lower()}.txt"
            # save_to_txt(courses, filename)
            filename_json = f"../data/kurse_{site.lower()}.json"
            save_to_json(courses, filename_json, site)
        
        # Speichere kombinierte Liste
        # save_to_txt(combined_courses, "data/kurse_all.txt")
        # save_to_json(combined_courses, "data/kurse_all.json", "ALL")
        
        print("\nScraping erfolgreich abgeschlossen!")
    else:
        print("\nKeine Kurse gefunden oder Fehler aufgetreten")


if __name__ == "__main__":
    main()
