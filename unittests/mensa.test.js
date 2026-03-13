/**
 * @vitest-environment jsdom
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderInitialMenu } from '../scripts/mensa.js'; 

describe('Mensa Frontend Logic', () => {
    const FAKE_TODAY = new Date('2024-05-20T10:00:00Z');

    beforeEach(() => {
        document.body.innerHTML = `
            <h2 class="active-card-title">Kantine</h2>
            <button id="nextButton">Next</button>
            <button id="backButton">Back</button>
            <div class="mensa"></div>
        `;

        vi.useFakeTimers();
        vi.setSystemTime(FAKE_TODAY);

        // Fetch Mocking
        global.fetch = vi.fn(async (url) => {
            if (url === '/api/session') {
                return {
                    ok: true,
                    json: async () => ({ authenticated: true, faculty: 'FN' })
                };
            }
            if (url.includes('data/mensa_FN.json')) {
                return {
                    ok: true,
                    json: async () => [
                        {
                            datum: "20.05.",
                            gerichte: [{ kategorie: "Menü 1", name: "Pasta", preise: "3,00€", allergene: "A" }]
                        },
                        {
                            datum: "21.05.",
                            gerichte: [{ kategorie: "Menü 1", name: "Pizza", preise: "4,00€", allergene: "C" }]
                        }
                    ]
                };
            }
            return { ok: false };
        });
    });

    afterEach(() => {
        vi.clearAllMocks();
        vi.useRealTimers();
    });

    describe('Initial Rendering', () => {
        it('sollte das Menü für heute laden und anzeigen', async () => {
            await renderInitialMenu();
            
            // WICHTIG: Da renderMenu intern asynchron arbeitet (fetch), 
            // müssen wir kurz warten, bis die Microtasks verarbeitet sind.
            await new Promise(process.nextTick);

            const header = document.querySelector('.active-card-title');
            const container = document.querySelector('.mensa');

            expect(header.textContent).toContain('Montag');
            expect(header.textContent).toContain('20.05.');
            expect(container.innerHTML).toContain('Pasta');
        });
    });

    describe('Navigation Deep Dive', () => {
        it('should correctly navigate through multiple available days', async () => {
            await renderInitialMenu();
            await new Promise(process.nextTick);

            const nextBtn = document.getElementById('nextButton');
            const backBtn = document.getElementById('backButton');
            const header = document.querySelector('.active-card-title');

            // 1. Klick auf Next (von 20.05. -> 21.05.)
            nextBtn.click();
            await new Promise(process.nextTick);
            expect(header.textContent).toContain('21.05.');

            // 2. Klick auf Next am Ende der Liste (sollte am 21.05. bleiben)
            nextBtn.click();
            await new Promise(process.nextTick);
            expect(header.textContent).toContain('21.05.');

            // 3. Klick zurück auf 20.05.
            backBtn.click();
            await new Promise(process.nextTick);
            expect(header.textContent).toContain('20.05.');
        });

        it('should not navigate back before today', async () => {
            // Wir simulieren, dass wir bereits am 21.05. sind, aber heute der 21.05. ist
            vi.setSystemTime(new Date('2024-05-21'));
            await renderInitialMenu();
            await new Promise(process.nextTick);

            const backBtn = document.getElementById('backButton');
            backBtn.click(); // Sollte fehlschlagen, da kein Tag < targetDay UND >= today existiert
            
            const header = document.querySelector('.active-card-title');
            expect(header.textContent).toContain('21.05.'); 
        });
    });
    
    describe('Error Handling & Retry', () => {
        it('sollte eine Fehlermeldung anzeigen, wenn keine Daten gefunden werden', async () => {
            // Mock für leere Daten
            global.fetch.mockImplementation(async (url) => {
                if (url === '/api/session') return { ok: true, json: async () => ({ authenticated: true, faculty: 'FN' }) };
                return { ok: true, json: async () => [] };
            });

            await renderInitialMenu();
            await new Promise(process.nextTick);

            const container = document.querySelector('.mensa');
            expect(container.innerHTML).toContain('keine Essensdaten gefunden');
        });

        it('sollte nach 15 Sekunden einen Retry auslösen', async () => {
            let callCount = 0;
            global.fetch.mockImplementation(async (url) => {
                if (url === '/api/session') return { ok: true, json: async () => ({ authenticated: true, faculty: 'FN' }) };
                
                // Beim ersten Mal leer, danach mit Daten
                if (url.includes('mensa_FN.json')) {
                    callCount++;
                    if (callCount === 1) return { ok: true, json: async () => [] };
                    return { ok: true, json: async () => [
                        { datum: "20.05.", gerichte: [{ kategorie: "Retry", name: "Erfolg", preise: "0€", allergene: "keine" }] }
                    ]};
                }
            });

            await renderInitialMenu();
            await new Promise(process.nextTick);
            
            // Vorspulen
            vi.advanceTimersByTime(15000);
            
            // Warten auf den asynchronen renderMenu Aufruf nach dem Timeout
            await new Promise(process.nextTick);
            await new Promise(process.nextTick); // Zweiter Tick für verschachtelte Promises

            const container = document.querySelector('.mensa');
            expect(container.innerHTML).toContain('Erfolg');
        });
    });
});