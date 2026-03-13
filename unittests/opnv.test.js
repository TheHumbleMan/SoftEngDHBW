import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
// Wir importieren alles, um sicherzustellen, dass das Modul geladen ist
import * as OPNV from '../scripts/opnv.js'; 

describe('OPNV High Coverage Suite', () => {
    beforeEach(() => {
        // Komplettes DOM inkl. Wrapper für Event Delegation Tests
        document.body.innerHTML = `
            <div id="wrapper">
                <input id="userAddress" value="Konstanz">
                <input id="routeDate" value="2026-03-13">
                <input id="routeTime" value="12:00">
                <select id="routeMode"><option value="arr">Ankunft</option></select>
                <button id="btnToCampus">Hin</button>
                <button id="btnFromCampus">Zurück</button>
                <span id="notAButton">Kein Button</span>
            </div>
        `;

        vi.stubGlobal('open', vi.fn());
        vi.stubGlobal('alert', vi.fn());
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-03-13T10:00:00'));
    });

    afterEach(() => {
        vi.restoreAllMocks();
        vi.useRealTimers();
    });

    // --- SECTION: initDateTimeFields ---
    it('deckt initDateTimeFields Statements ab', () => {
        // 1. Pfad: Elemente fehlen (Early Return)
        document.getElementById("routeDate").remove();
        OPNV.initDateTimeFields(); 

        // 2. Pfad: Elemente existieren, sind aber gefüllt (Kein Überschreiben)
        document.body.innerHTML = '<input id="routeDate" value="fest"><input id="routeTime" value="fest">';
        OPNV.initDateTimeFields();
        expect(document.getElementById("routeDate").value).toBe("fest");

        // 3. Pfad: Elemente leer (Vollständige Initialisierung)
        document.body.innerHTML = '<input id="routeDate" value=""><input id="routeTime" value="">';
        OPNV.initDateTimeFields();
        expect(document.getElementById("routeDate").value).toBe('2026-03-13');
    });

    // --- SECTION: getRoute Statements ---
    it('deckt alle Zweige in getRoute ab', () => {
        // Testet: trim(), encodeURIComponent, window.open
        OPNV.getRoute("  Stuttgart  ", "Campus");
        
        const url = vi.mocked(window.open).mock.calls[0][0];
        expect(url).toContain("name_origin=Stuttgart");
        expect(url).toContain("itdDate=20260313"); // Datums-Formatierung Statement
        expect(url).toContain("itdTime=1200");     // Zeit-Formatierung Statement
    });

    // --- SECTION: Global Event Listener (The "Tricky" Part) ---
    it('deckt den globalen Click-Listener vollständig ab', () => {
        const toBtn = document.getElementById('btnToCampus');
        const fromBtn = document.getElementById('btnFromCampus');
        const span = document.getElementById('notAButton');

        // 1. Klick auf Nicht-Button (deckt "if (!btn) return" ab)
        span.click();
        expect(window.open).not.toHaveBeenCalled();

        // 2. Klick auf btnToCampus (deckt Zeile 60 ab)
        toBtn.click();
        expect(window.open).toHaveBeenCalledTimes(1);
        expect(vi.mocked(window.open).mock.calls[0][0]).toContain("name_destination=" + encodeURIComponent(OPNV.CAMPUS_DATA.ADRESSE));

        // 3. Klick auf btnFromCampus (deckt Zeile 61 ab)
        fromBtn.click();
        expect(window.open).toHaveBeenCalledTimes(2);
        expect(vi.mocked(window.open).mock.calls[1][0]).toContain("name_origin=" + encodeURIComponent(OPNV.CAMPUS_DATA.ADRESSE));
    });

    it('handhabt fehlendes userAddress Feld im Listener', () => {
        document.getElementById("userAddress").remove();
        document.getElementById('btnToCampus').click();
        
        // Deckt den Fall ab, dass address undefined ist -> getRoute zeigt Alert
        expect(alert).toHaveBeenCalledWith("Bitte Adresse eingeben.");
    });
});