import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { getRoute, CAMPUS_DATA } from '../scripts/opnv.js';

describe('getRoute', () => {
  let originalWindowOpen;
  let originalAlert;

  beforeEach(() => {
    // Mock für window.open
    originalWindowOpen = globalThis.window?.open;
    globalThis.window = { open: vi.fn() };

    // Mock für alert
    originalAlert = globalThis.alert;
    globalThis.alert = vi.fn();

    // Mock DOM-Elemente
    document.body.innerHTML = `
      <input id="routeDate" value="2026-03-02">
      <input id="routeTime" value="14:30">
      <select id="routeMode"><option value="dep" selected>Abfahrt</option><option value="arr">Ankunft</option></select>
      <input id="userAddress" value="Bahnhof, Friedrichshafen">
    `;
  });

  afterEach(() => {
    // Restore
    globalThis.window.open = originalWindowOpen;
    globalThis.alert = originalAlert;
    document.body.innerHTML = '';
  });

  it('öffnet ein Fenster mit korrekter URL für Hinroute', () => {
    getRoute("Bahnhof, Friedrichshafen", CAMPUS_DATA.ADRESSE);
    const urlCalled = globalThis.window.open.mock.calls[0][0];

    expect(urlCalled).toContain(encodeURIComponent("Bahnhof, Friedrichshafen"));
    expect(urlCalled).toContain(encodeURIComponent(CAMPUS_DATA.ADRESSE));
    expect(urlCalled).toContain("itdDate=20260302");
    expect(urlCalled).toContain("itdTime=1430");
    expect(urlCalled).toContain("itdTripDateTimeDepArr=dep");
  });

  it('öffnet ein Fenster mit Ankunftsmodus, wenn ausgewählt', () => {
    document.getElementById("routeMode").value = "arr";
    getRoute("Bahnhof, Friedrichshafen", CAMPUS_DATA.ADRESSE);
    const urlCalled = globalThis.window.open.mock.calls[0][0];
    expect(urlCalled).toContain("itdTripDateTimeDepArr=arr");
  });

  it('warnt, wenn Startadresse leer ist', () => {
    getRoute("  ", CAMPUS_DATA.ADRESSE);
    expect(globalThis.alert).toHaveBeenCalledWith("Bitte Adresse eingeben.");
  });

  it('funktioniert auch ohne Datum/Time-Felder', () => {
    document.getElementById("routeDate").remove();
    document.getElementById("routeTime").remove();
    getRoute("Bahnhof, Friedrichshafen", CAMPUS_DATA.ADRESSE);
    const urlCalled = globalThis.window.open.mock.calls[0][0];
    expect(urlCalled).toContain(encodeURIComponent("Bahnhof, Friedrichshafen"));
    expect(urlCalled).toContain(encodeURIComponent(CAMPUS_DATA.ADRESSE));
    expect(urlCalled).not.toContain("itdDate=");
    expect(urlCalled).not.toContain("itdTime=");
  });
});


describe('OPNV Module', () => {
  beforeEach(() => {
    // 1. window.open richtig spyen
    vi.spyOn(globalThis, 'window', 'get').mockReturnValue({
      open: vi.fn()
    });

    // 2. DOM aufbauen
    document.body.innerHTML = `
      <input id="userAddress" value="Bahnhof, Friedrichshafen">
      <input id="routeDate" value="">
      <input id="routeTime" value="">
      <select id="routeMode"><option value="dep">Abfahrt</option></select>
      <button id="btnToCampus"></button>
      <button id="btnFromCampus"></button>
    `;

    // 3. FakeTimers aktivieren
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.restoreAllMocks();
    document.body.innerHTML = '';
  });

  it('öffnet Fenster mit korrekter URL für Hinroute', () => {
    getRoute("Bahnhof, Friedrichshafen", CAMPUS_DATA.ADRESSE);
    const urlCalled = window.open.mock.calls[0][0];
    expect(urlCalled).toContain(encodeURIComponent("Bahnhof, Friedrichshafen"));
    expect(urlCalled).toContain(encodeURIComponent(CAMPUS_DATA.ADRESSE));
  });

  it('warnt, wenn Startadresse leer ist', () => {
    vi.spyOn(globalThis, 'alert').mockImplementation(() => {});
    getRoute("   ", CAMPUS_DATA.ADRESSE);
    expect(alert).toHaveBeenCalledWith("Bitte Adresse eingeben.");
    alert.mockRestore();
  });

  it('click auf btnToCampus ruft getRoute auf', () => {
    const btn = document.getElementById('btnToCampus');
    btn.click();
    expect(window.open).toHaveBeenCalled();
  });

  it('click auf btnFromCampus ruft getRoute auf', () => {
    const btn = document.getElementById('btnFromCampus');
    btn.click();
    expect(window.open).toHaveBeenCalled();
  });

  it('DOMContentLoaded Listener setzt Standarddatum/-zeit', () => {
    const event = new Event('DOMContentLoaded');
    document.dispatchEvent(event);

    // setTimeout innerhalb DOMContentLoaded
    vi.runAllTimers();

    const d = document.getElementById("routeDate");
    const t = document.getElementById("routeTime");
    expect(d.value).not.toBe('');
    expect(t.value).not.toBe('');
  });
});