import { Builder, By, until, Key } from "selenium-webdriver";
import firefox from "selenium-webdriver/firefox.js"; // Nutzt Firefox wie dein Python-Skript
import fs from "fs";
import path from "path";

/**
 * Scrapt Kontaktpersonen basierend auf einem Suchbegriff (Kurs)
 * @param {string} kursName - Der Kursname aus der Session (z.B. "WWI2023")
 * @param {string} outputDir - Speicherort für die JSON
 */
async function scrapeDhbwKontakte({ kursName, outputDir }) {
  let driver;

  try {
    const options = new firefox.Options();
    options.addArguments("--headless"); // Wichtig für Server-Betrieb

    driver = await new Builder()
      .forBrowser("firefox")
      .setFirefoxOptions(options)
      .build();

    const BASE_URL = "https://www.ravensburg.dhbw.de/dhbw-ravensburg/ansprechpersonen";
    await driver.get(BASE_URL);

    // 1. Suche nach dem Kurs im Kontakt-Filter
    // Das Suchfeld auf der DHBW Seite hat meist dieses Name-Attribut
    const searchInputSelector = "input[name='tx_dhbw_contacts[search]']";
    
    try {
      const searchBox = await driver.wait(
        until.elementLocated(By.css(searchInputSelector)),
        10000
      );
      
      console.log(`Filtere Kontakte nach: ${kursName}...`);
      await searchBox.sendKeys(kursName, Key.RETURN);
      
      // Kurze Pause für das AJAX-Update der Liste
      await driver.sleep(2000); 
    } catch (e) {
      console.warn("Suchfeld nicht gefunden, fahre mit Gesamtlise fort.");
    }

    // 2. Warten bis Personen-Elemente geladen sind
    const personenSelector = "div.person";
    await driver.wait(until.elementLocated(By.css(personenSelector)), 10000);
    const elements = await driver.findElements(By.css(personenSelector));

    // 3. Daten extrahieren (Effizient via executeScript)
    const kontakte = await driver.executeScript(`
      const nodes = document.querySelectorAll('div.person');
      return Array.from(nodes).map(node => {
        const nameEl = node.querySelector('.contact-image img');
        const phoneEl = node.querySelector('dd.phone a');
        const mailEl = node.querySelector('dd.mail a');
        const addrEl = node.querySelector('.address p');

        return {
          name: nameEl ? nameEl.getAttribute('alt') : node.querySelector('h3')?.innerText.trim(),
          funktion: node.querySelector('.accordion-subtitle')?.innerText.trim() || 'Mitarbeiter/in',
          telefon: phoneEl ? phoneEl.innerText.trim() : null,
          email: mailEl ? mailEl.innerText.trim() : null,
          adresse: addrEl ? addrEl.innerText.trim() : null,
          bild: nameEl ? nameEl.src : null
        };
      });
    `);

    // 4. Speichern
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    const fileName = `kontakte_${kursName.replace(/[^a-z0-9]/gi, '_')}.json`;
    const filePath = path.join(outputDir, fileName);
    
    fs.writeFileSync(filePath, JSON.stringify(kontakte, null, 2), "utf-8");
    
    console.log(`Erfolgreich ${kontakte.length} Kontakte für ${kursName} gespeichert.`);
    return { success: true, count: kontakte.length, file: filePath };

  } catch (err) {
    console.error("Scraping fehlgeschlagen:", err.message);
    throw err;
  } finally {
    if (driver) await driver.quit();
  }
}

export { scrapeDhbwKontakte };