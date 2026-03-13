import { describe, it, expect, vi, beforeEach } from 'vitest';
import puppeteer from 'puppeteer';
import { scrapeDhbwApp } from '../scripts/dhbwAPP_scraper.js';
import fs from 'fs';

// 1. Mocks für externe Module
vi.mock('puppeteer', () => ({
  default: { launch: vi.fn() },
}));

vi.mock('fs', () => ({
  default: {
    mkdirSync: vi.fn(),
    writeFileSync: vi.fn(),
    existsSync: vi.fn(),
  },
}));

describe('DHBW APP Scraper - High Coverage Suite', () => {
  let browserMock, pageMock;

  beforeEach(() => {
    vi.clearAllMocks();
    fs.existsSync.mockReturnValue(true);

    // Hilfsfunktion für ein minimales DOM-Objekt
    const setupMockDom = () => {
      global.document = {
        body: { scrollHeight: 1000 },
        querySelectorAll: vi.fn().mockReturnValue([]),
      };
      global.window = { scrollTo: vi.fn() };
    };

    setupMockDom();

    // Mock für das Page-Objekt
    pageMock = {
      goto: vi.fn().mockResolvedValue(null),
      waitForSelector: vi.fn().mockResolvedValue(null),
      on: vi.fn(),
      // Dieser Mock deckt jetzt sowohl scrollUntilLoaded als auch das Scraping ab
      evaluate: vi.fn().mockImplementation(async (fn, ...args) => {
        if (typeof fn === 'function') {
          // Falls die Funktion auf scrollHeight prüft (Scrolling logic)
          if (fn.toString().includes('scrollHeight')) {
            return global.document.body.scrollHeight;
          }
          // Falls es die Scraping-Logik ist
          return fn(...args);
        }
        return 0;
      }),
    };

    browserMock = {
      newPage: vi.fn().mockResolvedValue(pageMock),
      close: vi.fn().mockResolvedValue(null),
    };

    puppeteer.launch.mockResolvedValue(browserMock);
  });

  // --- Tests für Pfade & Initialisierung ---

  it('should resolve T-prefix to FN- and handle binary path fallback', async () => {
    fs.existsSync.mockReturnValue(false); // Testet getBinaryPath Branch
    const result = await scrapeDhbwApp({ sessionCourse: 'TINF20', writeFile: false });
    expect(result.kurs).toBe('FN-TINF20');
    expect(puppeteer.launch).toHaveBeenCalledWith(expect.objectContaining({
      executablePath: undefined
    }));
  });

  it('should resolve W-prefix to RV-', async () => {
    const result = await scrapeDhbwApp({ sessionCourse: 'WINF20', writeFile: false });
    expect(result.kurs).toBe('RV-WINF20');
  });

  it('should throw error for unknown course prefixes', async () => {
    await expect(scrapeDhbwApp({ sessionCourse: 'XINF20' })).rejects.toThrow();
  });

  // --- Tests für Scraping Branches (Appointments) ---

  it('should correctly parse appointments including time stripping and icons', async () => {
    pageMock.evaluate.mockImplementation(async (fn) => {
      if (fn.toString().includes('scrollHeight')) return 1000;

      // Simulation eines gefüllten DOMs
      global.document.querySelectorAll = vi.fn().mockReturnValue([{
        querySelector: (sel) => {
          if (sel === ".text-text-primary.text-xl") return { innerText: "Montag, 01.01.2026" };
          if (sel === ".space-y-3") return {
            querySelectorAll: () => [{
              querySelector: (s) => {
                if (s === ".flex.flex-grow") return { innerText: "Vorlesung" };
                if (s.includes("tabler-icon-clock")) return { nextElementSibling: { innerText: "08:00 - 12:00 (20%)" } };
                if (s === ".tabler-icon-home") return { nextElementSibling: { innerText: "H123" } };
                if (s === ".tabler-icon-map-pin") return { nextElementSibling: { innerText: "Campus" } };
                if (s === ".tabler-icon-info-square-rounded") return { nextElementSibling: { innerText: "Info" } };
                return null;
              },
              querySelectorAll: () => [{ nextElementSibling: { innerText: "08:00 - 12:00 (20%)" } }]
            }]
          };
        }
      }]);
      return fn();
    });

    const result = await scrapeDhbwApp({ sessionCourse: 'TINF20', writeFile: false });
    const app = result.data[0].appointments[0];
    expect(app.endTime).toBe("12:00"); // Branch: spaceIndex !== -1
    expect(app.locationExtra).toBe("Campus");
  });

  it('should handle missing fields with default strings', async () => {
    pageMock.evaluate.mockImplementation(async (fn) => {
      if (fn.toString().includes('scrollHeight')) return 1000;

      global.document.querySelectorAll = vi.fn().mockReturnValue([{
        querySelector: (sel) => {
          if (sel === ".text-text-primary.text-xl") return { innerText: "Tag, 01.01." };
          if (sel === ".space-y-3") return { querySelectorAll: () => [{
              querySelector: () => null, // Löst "||" Branches aus
              querySelectorAll: () => []
          }]};
        }
      }]);
      return fn();
    });

    const result = await scrapeDhbwApp({ sessionCourse: 'TINF20', writeFile: false });
    expect(result.data[0].appointments[0].name).toBe("Termin ohne Name");
  });

  // --- Tests für Datei-Operationen & Scroll-Logik ---

  it('should create directory and write file if writeFile is true', async () => {
    await scrapeDhbwApp({ sessionCourse: 'TINF20', writeFile: true });
    expect(fs.mkdirSync).toHaveBeenCalled();
    expect(fs.writeFileSync).toHaveBeenCalled();
  });

  it('should skip file writing if writeFile is false', async () => {
    await scrapeDhbwApp({ sessionCourse: 'TINF20', writeFile: false });
    expect(fs.writeFileSync).not.toHaveBeenCalled();
  });

  it('should terminate scroll loop when height remains constant', async () => {
    let heights = [1000, 1500, 1500]; // Zweiter und dritter Call gleich -> Loop Ende
    let count = 0;
    pageMock.evaluate.mockImplementation(async (fn) => {
      if (fn.toString().includes('scrollHeight')) return heights[count++];
      return [];
    });

    await scrapeDhbwApp({ sessionCourse: 'TINF20', writeFile: false });
    expect(count).toBeGreaterThan(1);
  });

  it('should forward browser logs', async () => {
    let logHandler;
    pageMock.on.mockImplementation((evt, cb) => { if (evt === 'console') logHandler = cb; });
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    await scrapeDhbwApp({ sessionCourse: 'TINF20', writeFile: false });
    logHandler({ text: () => "Browser Msg" });

    expect(consoleSpy).toHaveBeenCalledWith("BROWSER LOG:", "Browser Msg");
    consoleSpy.mockRestore();
  });
});