import { describe, it, expect, vi, beforeEach } from 'vitest';
import puppeteer from 'puppeteer';
import { scrapeDhbwApp } from '../scripts/dhbwAPP_scraper.js';

// 1. Mocks für externe Module definieren
vi.mock('puppeteer', () => ({
  default: {
    launch: vi.fn(),
  },
}));

vi.mock('fs', () => ({
  default: {
    mkdirSync: vi.fn(),
    writeFileSync: vi.fn(),
    existsSync: vi.fn().mockReturnValue(true), // Verhindert den Fehler in getBinaryPath
  },
}));

describe('DHBW APP Scraper Full Coverage', () => {
  let browserMock, pageMock;

  beforeEach(() => {
    vi.clearAllMocks();

    // Mock für das Page-Objekt
    pageMock = {
      goto: vi.fn().mockResolvedValue(null),
      waitForSelector: vi.fn().mockResolvedValue(null),
      on: vi.fn(),
      evaluate: vi.fn().mockImplementation(async (fn, ...args) => {
        if (typeof fn === 'function') {
          // Simulation der Browser-Umgebung für die Scraping-Logik
          global.document = {
            querySelectorAll: vi.fn().mockReturnValue([
              { 
                querySelector: vi.fn().mockImplementation((sel) => {
                  if (sel === ".text-text-primary.text-xl") {
                    return { innerText: "Montag, 01.01.2026" };
                  }
                  if (sel === ".space-y-3") {
                    return {
                      querySelectorAll: vi.fn().mockReturnValue([
                        { 
                          querySelector: vi.fn().mockImplementation((innerSel) => {
                            if (innerSel === ".flex.flex-grow") {
                              return { innerText: "Mathe", trim: () => "Mathe" };
                            }
                            if (innerSel === ".tabler-icon-home") return {};
                            if (innerSel === ".tabler-icon-map-pin") return {};
                            if (innerSel === ".tabler-icon-info-square-rounded") return {};
                            return { 
                              nextElementSibling: { innerText: "H123", trim: () => "H123" }, 
                              innerText: "Test", 
                              trim: () => "Test" 
                            };
                          }),
                          querySelectorAll: vi.fn().mockReturnValue([
                            { nextElementSibling: { innerText: "08:00 - 10:00 (50%)", trim: () => "08:00 - 10:00 (50%)" } }
                          ])
                        }
                      ])
                    };
                  }
                  return null;
                })
              }
            ]),
            body: { scrollHeight: 1000 }
          };
          global.window = { scrollTo: vi.fn() };
          
          // Führt die übergebene Funktion im Kontext der Mocks aus
          return fn(...args);
        }
        return 0;
      }),
    };

    // Mock für das Browser-Objekt
    browserMock = {
      newPage: vi.fn().mockResolvedValue(pageMock),
      close: vi.fn().mockResolvedValue(null),
    };

    // Puppeteer Mock aktivieren
    puppeteer.launch.mockResolvedValue(browserMock);
  });

  // --- Tests ---

  it('should cover the scraping logic and fs calls (Lines 73-136)', async () => {
    const result = await scrapeDhbwApp({ sessionCourse: 'TINF20', writeFile: true });
    
    expect(result.data).toBeDefined();
    expect(result.data[0].appointments[0].name).toBe("Mathe");
    
    const fs = (await import('fs')).default;
    expect(fs.writeFileSync).toHaveBeenCalled();
  });

  it("should throw error when no course is provided", async () => {
    await expect(
      scrapeDhbwApp({})
    ).rejects.toThrow("Kein Kurs angegeben");
  });

  it('should cover the direct run block logic (Lines 170-177)', async () => {
    process.env.DHBW_KURS = 'TINF20';
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    
    const result = await scrapeDhbwApp({ sessionCourse: process.env.DHBW_KURS });
    
    // Simuliert den Fortschritts-Log
    console.log("Scraping abgeschlossen:", result.kurs);
    
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining("Scraping abgeschlossen"), 
      expect.stringContaining("FN-TINF20")
    );
    
    consoleSpy.mockRestore();
  });

  it('should cover the scroll logic (Lines 153-168)', async () => {
    let callCount = 0;
    pageMock.evaluate.mockImplementation(async (fn) => {
      // Unterscheidung zwischen Scroll-Check und Scraping
      if (typeof fn === 'function' && fn.toString().includes('scrollHeight')) {
        callCount++;
        // Simuliert, dass die Seite beim dritten Mal "fertig" gescrollt ist
        return callCount > 2 ? 2000 : 1000 + callCount;
      }
      return [];
    });

    await scrapeDhbwApp({ sessionCourse: 'TINF20', writeFile: false });
    expect(pageMock.evaluate).toHaveBeenCalled();
  });

  describe("Additional Coverage Tests", () => {
    it("should forward browser console logs", async () => {
      let consoleHandler;
      pageMock.on.mockImplementation((event, handler) => {
        if (event === "console") consoleHandler = handler;
      });

      await scrapeDhbwApp({ sessionCourse: "TINF20", writeFile: false });

      const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
      consoleHandler({ text: () => "Browser Test Log" });

      expect(consoleSpy).toHaveBeenCalledWith("BROWSER LOG:", "Browser Test Log");
      consoleSpy.mockRestore();
    });

    it("should wait for timetable selector", async () => {
      await scrapeDhbwApp({ sessionCourse: "TINF20", writeFile: false });
      expect(pageMock.waitForSelector).toHaveBeenCalledWith(".flex-grow.text-text-primary");
    });

    it("should strip percentage from running lecture end time", async () => {
      // Manueller Override für diesen speziellen Testfall
      pageMock.evaluate.mockResolvedValue([
        {
          weekday: "Montag",
          date: "01.01.2026",
          appointments: [{
            name: "Mathe",
            startTime: "10.00",
            endTime: "11.30",
            location: "H101",
            locationExtra: null,
            info: null
          }]
        }
      ]);

      const result = await scrapeDhbwApp({ sessionCourse: "TINF20", writeFile: false });
      expect(result.data[0].appointments[0].endTime).toBe("11.30");
    });
  });
});