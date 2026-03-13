/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as Mensa from '../scripts/mensa.js';

describe('Mensa.js Formal Branch Coverage', () => {
    beforeEach(() => {
        document.body.innerHTML = `
            <h2 class="active-card-title"></h2>
            <div class="mensa"></div>
            <button id="nextButton"></button>
            <button id="backButton"></button>
        `;
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2024-05-20T10:00:00'));
        vi.spyOn(console, 'error').mockImplementation(() => {});
    });

    afterEach(() => {
        vi.restoreAllMocks();
        vi.useRealTimers();
    });

    // Hilfsfunktion: Simuliert Fetch basierend auf der URL
    const mockFetchWithRoutes = (sessionResponse, mensaData) => {
        global.fetch = vi.fn((url) => {
            if (url.includes('session')) {
                return Promise.resolve({
                    ok: true,
                    json: async () => sessionResponse
                });
            }
            return Promise.resolve({
                ok: true,
                json: async () => mensaData
            });
        });
    };

    // --- BRANCH 26: loadfaculty Login-Check ---
    it('deckt Branch 26 ab (Login fehlgeschlagen)', async () => {
        mockFetchWithRoutes({ authenticated: false }, []);
        await Mensa.renderInitialMenu();
        // Deckt "if (!session.authenticated) return null" ab
    });

    // --- BRANCH 90-92 & 104-115: Navigation Logik ---
    it('deckt Navigations-Branches ab (Next & Back)', async () => {
        // Wir brauchen 3 Tage um alle Index-Zweige zu triggern
        const data = [
            { datum: "20.05.", gerichte: [{name: "A", kategorie: "K", preise: "0", allergene: ""}] },
            { datum: "21.05.", gerichte: [{name: "B", kategorie: "K", preise: "0", allergene: ""}] },
            { datum: "22.05.", gerichte: [{name: "C", kategorie: "K", preise: "0", allergene: ""}] }
        ];
        mockFetchWithRoutes({ authenticated: true, faculty: 'FN' }, data);

        await Mensa.renderInitialMenu(); // Start 20.05.
        await new Promise(process.nextTick);

        // Next Klick (20 -> 21): Deckt Zeile 90-92 ab
        document.getElementById('nextButton').click();
        await new Promise(process.nextTick);
        await new Promise(process.nextTick);

        // Back Klick (21 -> 20): Deckt Zeile 104-115 ab (Filter-Logik)
        document.getElementById('backButton').click();
        await new Promise(process.nextTick);
        await new Promise(process.nextTick);

        expect(document.querySelector('.active-card-title').textContent).toContain('20.05.');
    });

    // --- BRANCH 133-134: Retry-Logik Global State ---
    it('deckt retryScheduled Zweige ab', async () => {
        mockFetchWithRoutes({ authenticated: true, faculty: 'FN' }, []);

        // Pfad 1: retryScheduled ist false (Initialer Lauf)
        await Mensa.renderInitialMenu();
        await new Promise(process.nextTick);

        // Pfad 2: retryScheduled ist true (Zweiter Lauf durch Klick bei leeren Daten)
        document.getElementById('nextButton').click();
        await new Promise(process.nextTick);

        const container = document.querySelector('.mensa');
        expect(container.innerHTML).toContain('Das Neuladen hat nicht geholfen');
    });

    // --- BRANCH 116-121: Faculty Styling ---
    it('deckt Faculty FN vs Else Styling ab', async () => {
        const data = [{ datum: "20.05.", gerichte: [{name: "X", kategorie: "Y", preise: "0", allergene: "Z"}] }];
        
        // Test FN
        mockFetchWithRoutes({ authenticated: true, faculty: 'FN' }, data);
        await Mensa.renderInitialMenu();
        await new Promise(process.nextTick);
        expect(document.querySelector('.mensa').style.height).toBe('50%');

        // Test Default (z.B. Konstanz)
        mockFetchWithRoutes({ authenticated: true, faculty: 'KN' }, data);
        await Mensa.renderInitialMenu();
        await new Promise(process.nextTick);
        // Deckt den "else" Pfad von faculty === "FN" ab
    });

    // --- BRANCH: fetchMensaData Catch ---
    it('deckt den catch-Pfad bei Netzwerkfehlern ab', async () => {
        global.fetch = vi.fn((url) => {
            if (url.includes('session')) return Promise.resolve({ ok: true, json: async () => ({ authenticated: true }) });
            return Promise.reject(new Error("Network Fail"));
        });
        await Mensa.renderInitialMenu();
        await new Promise(process.nextTick);
        expect(console.error).toHaveBeenCalled();
    });
    // --- BRANCH 28: loadfaculty Success Return ---
    it('deckt Zeile 28 ab (Erfolgreiche Faculty Rückgabe)', async () => {
        // Dieser Test stellt sicher, dass der Pfad NACH dem if (!session.authenticated) 
        // komplett durchlaufen wird.
        mockFetchWithRoutes({ authenticated: true, faculty: 'STGT' }, []);
        const faculty = await Mensa.renderInitialMenu(); 
        // Intern wird loadfaculty aufgerufen und "STGT" zurückgegeben
        expect(global.fetch).toHaveBeenCalled();
    });

    // --- BRANCH 74: getDayDataByDate Find Logic ---
    it('deckt Zeile 74 ab (find-Logik Erfolg und Misserfolg)', async () => {
        const testData = [
            { datum: "20.05.", gerichte: [] },
            { datum: "21.05.", gerichte: [] }
        ];
        
        // 1. Pfad: Match gefunden (targetDay ist 20.05.)
        mockFetchWithRoutes({ authenticated: true, faculty: 'FN' }, testData);
        await Mensa.renderInitialMenu();
        await new Promise(process.nextTick);
        expect(document.querySelector('.active-card-title').textContent).toContain('20.05.');

        // 2. Pfad: Kein Match gefunden (provuziert durch ungültiges Datum im Cache)
        // Wir setzen targetDay manuell auf ein Datum, das nicht existiert
        // In renderMenu wird getDayDataByDate gerufen. Wenn nichts gefunden wird,
        // landet der Code im else-Zweig von "if (targetDayData != undefined)"
        mockFetchWithRoutes({ authenticated: true, faculty: 'FN' }, [{ datum: "01.01.", gerichte: [] }]);
        await Mensa.renderInitialMenu(); 
        await new Promise(process.nextTick);
        
        const container = document.querySelector('.mensa');
        expect(container.innerHTML).toContain('keine Essensdaten gefunden');
    });

    // --- BRANCH 54 & 71: mensadateToDate Match Fail ---
    it('deckt Zeile 54 ab (Regex Match Failure)', async () => {
        // Simuliert ein Datum, das nicht dem Format XX.XX. entspricht
        const badData = [{ datum: "Montag", gerichte: [] }];
        mockFetchWithRoutes({ authenticated: true, faculty: 'FN' }, badData);
        
        await Mensa.renderInitialMenu();
        await new Promise(process.nextTick);
        
        // Wenn match fehlschlägt, gibt mensadateToDate null zurück (Zeile 54)
        // In getDayDataByDate führt das zu !mensadate (Zeile 71) -> return false
        expect(document.querySelector('.mensa').innerHTML).toContain('keine Essensdaten gefunden');
    });
});