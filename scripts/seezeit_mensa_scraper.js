import puppeteer from "puppeteer";
import fs from "fs";

// Konfiguration der Standorte
const standorte = [
    { 
        name: 'Friedrichshafen', 
        url: 'https://seezeit.com/essen/speiseplaene/mensa-friedrichshafen/',
        datei: './data/mensa_FN.json'
    },
    { 
        name: 'Ravensburg', 
        url: 'https://seezeit.com/essen/speiseplaene/mensa-ravensburg/',
        datei: './data/mensa_RV.json'
    }
];


    // Extrahiert die Daten von einer einzelnen Seite

const getBinaryPath = () => {
  const paths = [
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/firefox',
    '/usr/bin/chromium-browser',
    '/usr/bin/chromium'
  ];
  return paths.find(path => fs.existsSync(path));
};

export async function scrapeSeezeit(page, url) {
    await page.goto(url, { waitUntil: 'networkidle2' });

    return await page.evaluate(() => {
        const ergebnisse = [];
        const dates = {};
        
        // 1. Datum-Tabs auslesen
        document.querySelectorAll('.tabs .tab').forEach(tab => {
            const id = tab.getAttribute('rel');
            const dateText = tab.querySelector('span')?.innerText.trim();
            dates[id] = dateText;
        });

        // 2. Tages-Container verarbeiten
        document.querySelectorAll('.contents').forEach(container => {
            const tabId = container.id.replace('tab', '');
            const datum = dates[tabId];

            const tagesEintrag = {
                datum: datum,
                gerichte: []
            };

            const menus = container.querySelectorAll('.speiseplanTagKat');
            menus.forEach(menu => {
                // Texte bereinigen (z.B. Sättigungs-beilage -> Sättigungsbeilage)
                let category = menu.querySelector('.category')?.innerText || "";
                category = category
                    .replace(/-\n/g, '')      // Bindestrich mit direktem Umbruch löschen
                    .replace(/\n/g, ' ')      // Restliche Umbrüche zu Leerzeichen
                    .replace(/- /g, '')       // Bindestriche vor Leerzeichen löschen
                    .replace("Sättigungs-beilage", "Sättigungsbeilage")
                    .replace("Gemüse-beilage", "Gemüsebeilage")
                    .replace("Salat-beilage", "Salatbeilage")
                    .replace(/\s+/g, ' ')      // Doppelte Leerzeichen entfernen
                    .trim();

                const rawTitle = menu.querySelector('.title')?.innerText || "";
                const preise = menu.querySelector('.preise')?.innerText.trim();

                if (category && rawTitle) {
                    // Allergene und Zustazstoffe aus Gericht extrahieren
                    const allergenMatches = rawTitle.match(/\(([^)]+)\)/g);
                    let allergene = [];
                    
                    if (allergenMatches) {
                        allergenMatches.forEach(match => {
                            const codes = match.replace(/[()]/g, '').split(',');
                            allergene.push(...codes.map(c => c.trim()));
                        });
                    }

                    //Gericht bereinigen
                    const saubererName = rawTitle
                        .replace(/\([^)]*\)/g, '') // Alles in Klammern weg
                        .replace(/-\n/g, '')       // Bindestrich-Umbrüche weg
                        .replace(/\n/g, ' ')       // Normale Umbrüche weg
                        .replace(/\s+/g, ' ')      // Doppelte Leerzeichen weg
                        .trim();

                    tagesEintrag.gerichte.push({
                        kategorie: category,
                        name: saubererName,
                        allergene: [...new Set(allergene)],
                        preise: preise
                    });
                }
            });
            //nur Tage anzeigen die nicht leer sind
            if (tagesEintrag.gerichte.length > 0) {
                ergebnisse.push(tagesEintrag);
            }
        });

        return ergebnisse;
    });
}


//Steuert den Browser und arbeitet alle Standorte ab, Wird von server.js aufgerufen.

export async function scrapeSeezeitAll() {
    const browser = await puppeteer.launch({ 
        headless: "new",
        executablePath: getBinaryPath() || undefined,
        args: ['--no-sandbox'] // Wichtig für Stabilität auf Servern
    });
    
    const allData = {};

    try {
        const page = await browser.newPage();
            //Schleife über alle Standorte
        for (const standort of standorte) {
            try {
                console.log(`Scrape ${standort.name}...`);
                const daten = await scrapeSeezeit(page, standort.url);
                
                // Als JSON-Datei speichern
                fs.writeFileSync(standort.datei, JSON.stringify(daten, null, 2), 'utf-8');
                
                allData[standort.name] = daten;
                console.log(`${standort.name} erfolgreich aktualisiert.`);
            } catch (error) {
                console.error(`Fehler bei ${standort.name}:`, error.message);
            }
        }
    } finally {
        await browser.close();
        console.log("--- Mensa-Scraping beendet ---");
    }

    return allData;
}