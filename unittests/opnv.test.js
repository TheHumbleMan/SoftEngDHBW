import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { getRoute, CAMPUS_DATA, initDateTimeFields } from '../scripts/opnv.js';

describe('OPNV Module', () => {
  beforeEach(() => {
    // DOM-Aufbau inkl. aller benötigten IDs
    document.body.innerHTML = `
      <input id="userAddress" value="Bahnhof, Friedrichshafen">
      <input id="routeDate" value="">
      <input id="routeTime" value="">
      <select id="routeMode"><option value="dep" selected>Abfahrt</option></select>
      <button id="btnToCampus"></button>
      <button id="btnFromCampus"></button>
    `;

    // Globale Browser-Mocks
    vi.stubGlobal('open', vi.fn());
    vi.stubGlobal('alert', vi.fn());
    
    // Fake Timers für konsistente Datumsprüfung
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-13T10:00:00'));
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
    document.body.innerHTML = '';
  });

  it('öffnet Fenster mit korrekter URL für Hinroute', () => {
    getRoute("Bahnhof, Friedrichshafen", CAMPUS_DATA.ADRESSE);
    const urlCalled = window.open.mock.calls[0][0];
    expect(urlCalled).toContain(encodeURIComponent("Bahnhof, Friedrichshafen"));
    expect(urlCalled).toContain(encodeURIComponent(CAMPUS_DATA.ADRESSE));
  });

  it('warnt, wenn Startadresse leer ist', () => {
    getRoute("   ", CAMPUS_DATA.ADRESSE);
    expect(alert).toHaveBeenCalledWith("Bitte Adresse eingeben.");
  });

  it('click auf btnToCampus ruft getRoute auf via Delegation', () => {
    const btn = document.getElementById('btnToCampus');
    btn.click(); // Triggert den Listener auf document
    expect(window.open).toHaveBeenCalled();
  });

  it('initDateTimeFields setzt Standarddatum/-zeit korrekt', () => {
    // Funktion direkt aufrufen
    initDateTimeFields();

    const d = document.getElementById("routeDate");
    const t = document.getElementById("routeTime");
    
    // Prüft auf das Datum von vi.setSystemTime
    expect(d.value).toBe('2026-03-13');
    expect(t.value).toBe('10:00');
  });
});