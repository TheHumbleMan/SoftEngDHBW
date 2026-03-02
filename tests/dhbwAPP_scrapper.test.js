import { describe, it, expect, vi, beforeEach } from "vitest";
import * as fs from "fs";
import puppeteer from "puppeteer";
import { scrapeDhbwApp } from "../scripts/dhbwAPP_scraper.js";

// Puppeteer mocken
vi.mock("puppeteer");

// fs Methoden explizit mocken
const mkdirSyncMock = vi.fn();
const writeFileSyncMock = vi.fn();

// Alle fs Aufrufe auf die Mock-Funktionen umleiten
vi.stubGlobal("fs", {
  ...fs,
  mkdirSync: mkdirSyncMock,
  writeFileSync: writeFileSyncMock
});

describe("scrapeDhbwApp", () => {
  let browserMock, pageMock;

  beforeEach(() => {
    // Puppeteer mocks zurücksetzen
    mkdirSyncMock.mockReset();
    writeFileSyncMock.mockReset();

    pageMock = {
      goto: vi.fn(),
      waitForSelector: vi.fn(),
      evaluate: vi.fn(),
      on: vi.fn()
    };

    browserMock = {
      newPage: vi.fn().mockResolvedValue(pageMock),
      close: vi.fn()
    };

    puppeteer.launch.mockResolvedValue(browserMock);
  });

  it("scraped die Daten und schreibt eine JSON-Datei", async () => {
    const fakeData = [
      {
        weekday: "Montag",
        date: "01.03.2026",
        appointments: [
          {
            name: "Mathematik",
            startTime: "08.00",
            endTime: "10.00",
            location: "H213b",
            locationExtra: null,
            info: null
          }
        ]
      }
    ];

    pageMock.evaluate.mockResolvedValue(fakeData);

    const sessionCourse = "T123";
    const result = await scrapeDhbwApp({ sessionCourse, writeFile: true });

    expect(puppeteer.launch).toHaveBeenCalled();
    expect(browserMock.newPage).toHaveBeenCalled();
    expect(pageMock.goto).toHaveBeenCalledWith(
      "https://dhbw.app/c/FN-T123",
      expect.any(Object)
    );

    expect(pageMock.evaluate).toHaveBeenCalled();
    expect(mkdirSyncMock).toHaveBeenCalledWith("../data/timetables", { recursive: true });
    expect(writeFileSyncMock).toHaveBeenCalledWith(
      "../data/timetables/FN-T123.json",
      JSON.stringify(fakeData, null, 2),
      "utf-8"
    );

    expect(result.kurs).toBe("FN-T123");
    expect(result.data).toEqual(fakeData);
  });

  it("wirft Fehler bei unbekanntem Kurs-Präfix", async () => {
    await expect(scrapeDhbwApp({ sessionCourse: "X999", writeFile: false }))
      .rejects
      .toThrow("Unbekanntes Kurs-Präfix: X999");
  });

  it("wirft Fehler, wenn kein Kurs angegeben wird", async () => {
    await expect(scrapeDhbwApp({ writeFile: false }))
      .rejects
      .toThrow("Kein Kurs angegeben. Übergib sessionCourse oder setze window.sessionStorage('kurs').");
  });
});