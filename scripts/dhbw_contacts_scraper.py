from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.chrome.service import Service
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
import geckodriver_autoinstaller
from selenium import webdriver

from bs4 import BeautifulSoup
from urllib.parse import urljoin
import time

BASE = "https://www.ravensburg.dhbw.de"
URL = BASE + "/dhbw-ravensburg/ansprechpersonen"

# ---------- Selenium Setup ----------
geckodriver_autoinstaller.install()
options = webdriver.FirefoxOptions()
options.add_argument("--start-maximized")  # Browser maximiert starten
options.set_preference("dom.webnotifications.enabled", False)  # Notifications deaktivieren
options.set_preference("dom.webdriver.enabled", False)         # Automation-Verfolgung erschweren

# Browser starten
driver = webdriver.Firefox(options=options)

# URL öffnen
driver.get(URL)

# ---------- Warten bis Accordion geladen ist ----------
WebDriverWait(driver, 20).until(
    EC.presence_of_element_located(
        (By.CSS_SELECTOR, "[data-bs-toggle='collapse']")
    )
)

# ---------- HTML an BeautifulSoup übergeben ----------
soup = BeautifulSoup(driver.page_source, "html.parser")

personen = []

for btn in soup.select("[data-bs-toggle='collapse']"):
    name = btn.get_text(strip=True)

    funktion_el = btn.select_one(".accordion-subtitle")
    funktion = funktion_el.get_text(strip=True) if funktion_el else None

    href = btn.get("data-bs-target") or btn.get("href")
    detail_url = urljoin(URL, href) if href else None

    personen.append({
        "name": name,
        "funktion": funktion,
        "detail_url": detail_url
    })

print(f"{len(personen)} Personen gefunden")

# ---------- Detailseiten scrapen ----------
def scrape_detail(url):
    if not url:
        return {"telefon": None, "email": None, "adresse": None}

    driver.get(url)

    WebDriverWait(driver, 10).until(
        EC.presence_of_element_located((By.TAG_NAME, "body"))
    )

    soup = BeautifulSoup(driver.page_source, "html.parser")

    def text(sel):
        el = soup.select_one(sel)
        return el.get_text(strip=True) if el else None

    return {
        "telefon": text("dd.phone a"),
        "email": text("dd.mail a"),
        "adresse": text(".address p"),
    }


kontakte = []

for p in personen:
    details = scrape_detail(p["detail_url"])
    kontakte.append({**p, **details})

driver.quit()

# ---------- Beispielausgabe ----------
for k in kontakte[:3]:
    print(k)

print(f"Alle Kontakte: {len(kontakte)}")