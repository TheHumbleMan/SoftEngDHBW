// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest';
import { scrapeSeezeit, scrapeSeezeitAll } from '../scripts/seezeit_mensa_scraper.js';
import puppeteer from 'puppeteer';
import fs from 'fs';

// Nativ unterstütztes Mocking für ES-Module innerhalb von Vitest
vi.mock('puppeteer');
vi.mock('fs');

describe('Coverage Tests: Seezeit Mensa Scraper', () => {
    let mockPage;
    let mockBrowser;

    beforeAll(() => {
        // Polyfill: JSDOM unterstützt die Eigenschaft "innerText" nativ nicht. 
        // Zur Vermeidung von TypeErrors während des Scraping-Prozesses wird diese über "textContent" simuliert.
        if (!HTMLElement.prototype.hasOwnProperty('innerText')) {
            Object.defineProperty(HTMLElement.prototype, 'innerText', {
                get() { return this.textContent || ''; }
            });
        }
    });

    beforeEach(() => {
        // Zurücksetzen aller Mocks sowie des DOM-Zustands vor jeder Testausführung
        vi.clearAllMocks();
        document.body.innerHTML = '';

        mockPage = {
            goto: vi.fn().mockResolvedValue(true),
            // Die Methode "evaluate" führt den übergebenen Callback direkt im JSDOM-Kontext aus
            evaluate: vi.fn().mockImplementation((cb) => cb()),
        };

        mockBrowser = {
            newPage: vi.fn().mockResolvedValue(mockPage),
            close: vi.fn().mockResolvedValue(true),
        };

        // Überschreiben der Puppeteer-Launch-Methode zur Rückgabe des gemockten Browsers
        puppeteer.launch = vi.fn().mockResolvedValue(mockBrowser);
    });

    describe('Method: scrapeSeezeit', () => {
        it('should parse DOM elements, clean text data, and correctly apply regex filters', async () => {
            // Die simulierte HTML-Struktur deckt gezielt alle regulären Ausdrücke und logischen Verzweigungen ab
            document.body.innerHTML = `
                <div class="tabs">
                    <a class="tab" rel="1"><span>Mo 16.03.</span></a>
                    <a class="tab" rel="2">Di 17.03.</a>
                </div>
                
                <div class="contents" id="tab1">
                    <div class="speiseplanTagKat">
                        <div class="category">Sättigungs-\nbeilage -\n Gemüse-\nbeilage - Salat-beilage - </div>
                        <div class="title">Schnitzel (We, Ei, We) - mit Pommes\n(Knusprig)</div>
                        <div class="preise">3,50 €</div>
                    </div>
                </div>
                
                <div class="contents" id="tab2">
                    <div class="speiseplanTagKat">
                        <div class="category">Hauptgericht</div>
                        <div class="title">Gemüsesuppe</div>
                        <div class="preise">1,50 €</div>
                    </div>
                    <div class="speiseplanTagKat">
                        <div class="category">Dessert</div>
                        <div class="title"></div>
                    </div>
                    <div class="speiseplanTagKat">
                        <div class="category"></div>
                        <div class="title">Apfel</div>
                    </div>
                    <div class="speiseplanTagKat">
                        <div class="category">Beilage</div>
                        <div class="title">Reis ()</div>
                    </div>
                </div>
            `;

            const result = await scrapeSeezeit(mockPage, 'https://test.com');

            // Validierung der extrahierten Datenstruktur
            expect(result).toHaveLength(2);
            expect(result[0].datum).toBe('Mo 16.03.');
            
            const firstDish = result[0].gerichte[0];
            expect(firstDish.kategorie).toBe('Sättigungsbeilage Gemüsebeilage Salatbeilage');
            expect(firstDish.name).toBe('Schnitzel - mit Pommes');
            expect(firstDish.allergene).toEqual(['We', 'Ei', 'Knusprig']); 
            expect(firstDish.preise).toBe('3,50 €');

            // Validierung der Fehlerresistenz (z.B. Optional Chaining bei fehlendem span-Element)
            expect(result[1].datum).toBeUndefined();
            
            // Sicherstellung, dass unvollständige Datensätze (fehlender Titel/Kategorie) herausgefiltert wurden
            expect(result[1].gerichte).toHaveLength(2); // Suppe und Reis (Apfel und Dessert wurden ignoriert)
            
            // Validierung der Handhabung leerer Klammern
            const riceDish = result[1].gerichte[1];
            expect(riceDish.name).toBe('Reis');
            expect(riceDish.allergene).toEqual([]);
        });

        it('should filter out and ignore empty daily containers', async () => {
            // Validierung der logischen Bedingung: if (tagesEintrag.gerichte.length > 0)
            document.body.innerHTML = `
                <div class="tabs"><a class="tab" rel="1"><span>Mi 18.03.</span></a></div>
                <div class="contents" id="tab1"></div>
            `;
            const result = await scrapeSeezeit(mockPage, 'https://test.com');
            
            expect(result).toHaveLength(0);
        });
    });

    describe('Method: scrapeSeezeitAll', () => {
        it('should initialize the browser, process all locations, and export the data', async () => {
            // Validierung der internen Funktion getBinaryPath() durch Simulation eines erfolgreichen Suchtreffers im Array
            fs.existsSync = vi.fn().mockImplementation((path) => path === '/usr/bin/chromium-browser');
            fs.writeFileSync = vi.fn();
            
            mockPage.evaluate = vi.fn().mockResolvedValue([{ datum: 'Heute', gerichte: [{ name: 'Test' }] }]);

            await scrapeSeezeitAll();

            // Überprüfung der korrekten Browser-Initialisierung
            expect(puppeteer.launch).toHaveBeenCalledWith(expect.objectContaining({
                executablePath: '/usr/bin/chromium-browser'
            }));
            
            // Überprüfung der Dateisystem-Operationen
            expect(fs.writeFileSync).toHaveBeenCalledTimes(2);
            expect(mockBrowser.close).toHaveBeenCalledTimes(1);
        });

        it('should apply the fallback path and continue processing despite individual location errors', async () => {
            // Validierung des Fallback-Mechanismus für getBinaryPath(), wenn keine ausführbare Datei gefunden wird
            fs.existsSync = vi.fn().mockReturnValue(false);
            fs.writeFileSync = vi.fn();
            
            // Validierung des try-catch-Blocks innerhalb der Iteration über die Standorte
            mockPage.goto = vi.fn()
                .mockRejectedValueOnce(new Error('Network Timeout'))
                .mockResolvedValueOnce(true);
                
            mockPage.evaluate = vi.fn().mockResolvedValueOnce([{ datum: 'Morgen', gerichte: [] }]);

            await scrapeSeezeitAll();

            // Sicherstellung, dass im Fehlerfall undefined als Pfad übergeben wird
            expect(puppeteer.launch).toHaveBeenCalledWith(expect.objectContaining({
                executablePath: undefined
            }));
            
            // Lediglich der erfolgreiche Schleifendurchlauf darf einen Schreibvorgang auslösen
            expect(fs.writeFileSync).toHaveBeenCalledTimes(1);
            
            // Die Freigabe der Browser-Ressourcen muss zwingend erfolgen (Validierung des finally-Blocks)
            expect(mockBrowser.close).toHaveBeenCalledTimes(1);
        });
    });
});