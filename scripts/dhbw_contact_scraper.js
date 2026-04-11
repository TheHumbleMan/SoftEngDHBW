import { Builder, By, until, Key } from "selenium-webdriver";
import firefox from "selenium-webdriver/firefox.js"; // Nutzt Firefox
import fs from "fs";
import path from "path";

/**
 * Scraped Kontaktpersonen basierend auf einem Suchbegriff (Kurs)
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

    // 2. Warten bis Personen-Elemente geladen sind
    const personenSelector = "div.person";
    await driver.wait(until.elementLocated(By.css(personenSelector)), 10000);
    const elements = await driver.findElements(By.css(personenSelector));

    // 3. Daten extrahieren
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

    const fileName = `kontakte.json`;
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