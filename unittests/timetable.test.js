/**
 * @vitest-environment jsdom
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { initDates, renderSelectedWeek } from '../scripts/timetable.js'; 

describe('Timetable Frontend Logic', () => {
    // Fake-Daten für unsere Tests
    const FAKE_MONDAY = new Date('2023-10-23T10:00:00Z'); 

    beforeEach(() => {
        // 1. DOM vorbereiten (WICHTIG: timetable-title hinzugefügt)
        document.body.innerHTML = `
            <h2 id="timetable-title"></h2>
            <button id="backButton">Back</button>
            <button id="nextButton">Next</button>
            <div id="timetable-container"></div>
        `;

        // 2. Damit offsetHeight im Test nicht 0 ist
        Object.defineProperty(HTMLElement.prototype, 'offsetHeight', { configurable: true, value: 50 });

        // 3. Zeit einfrieren
        vi.useFakeTimers();
        vi.setSystemTime(FAKE_MONDAY);

        // 4. Standard Fetch Mock
        global.fetch = vi.fn(async (url) => {
            if (url === '/api/session') {
                return {
                    ok: true,
                    json: async () => ({ authenticated: true, faculty: 'FN', course: 'TIT24' })
                };
            }
            if (url.includes('data/timetables/')) {
                return {
                    ok: true,
                    json: async () => [
                        {
                            date: '23.10.2023',
                            appointments: [
                                { name: "Single", location: "A1", startTime: "08.00", endTime: "09.30" }
                            ]
                        },
                        {
                            date: '24.10.2023',
                            appointments: [
                                { name: "Double1", location: "B1", startTime: "10.00", endTime: "11.30" },
                                { name: "Double2", location: "B2", startTime: "11.00", endTime: "12.30" }
                            ]
                        },
                        {
                            date: '25.10.2023',
                            appointments: [
                                { name: "Triple1", location: "C1", startTime: "13.00", endTime: "14.30" },
                                { name: "Triple2", location: "C2", startTime: "13.00", endTime: "15.00" },
                                { name: "Triple3", location: "C3", startTime: "14.00", endTime: "16.00" }
                            ]
                        }
                    ]
                };
            }
            return { ok: false };
        });
    });

    afterEach(() => {
        vi.clearAllTimers();
        vi.useRealTimers();
        vi.restoreAllMocks();
    });

    describe('Initialization & Button Bindings', () => {
        it('should initialize dates and bind buttons', () => {
            initDates();
            const nextBtn = document.getElementById('nextButton');
            const backBtn = document.getElementById('backButton');
            expect(nextBtn).not.toBeNull();
            expect(backBtn).not.toBeNull();
        });

        it('should trigger showNextWeek when Next is clicked', async () => {
            initDates();
            const nextBtn = document.getElementById('nextButton');
            nextBtn.click();
            
            await new Promise(process.nextTick); 
            expect(global.fetch).toHaveBeenCalledWith('/api/session');
        });

        it('should trigger showPreviousWeek and respect boundary', async () => {
            initDates();
            const backBtn = document.getElementById('backButton');
            backBtn.click();
            
            await new Promise(process.nextTick);
            expect(global.fetch).toHaveBeenCalledWith('/api/session');
        });
    });

    describe('Rendering & Appointment Logic', () => {
        it('should render the timetable with single, double and triple appointments', async () => {
            initDates(); 
            await renderSelectedWeek('FN-TIT24');

            const container = document.getElementById('timetable-container');
            const title = document.getElementById('timetable-title');
            
            expect(title.textContent).toContain('KW');
            expect(container.innerHTML).toContain('<table');
            expect(container.innerHTML).toContain('Montag');

            const singleApps = document.querySelectorAll('.singleApp');
            const doubleApps = document.querySelectorAll('.doubleApp');
            const tripleApps = document.querySelectorAll('.tripleApp');

            expect(singleApps.length).toBe(1);
            expect(doubleApps.length).toBe(2);
            expect(tripleApps.length).toBe(3);
        });

        it('should handle empty JSON gracefully', async () => {
            // Mock für leere Daten überschreiben
            global.fetch.mockImplementation(async (url) => {
                if (url.includes('data/timetables/')) return { ok: true, json: async () => [] };
                return { ok: true, json: async () => ({ authenticated: true, faculty: 'FN', course: 'TIT24' }) };
            });

            initDates();
            await renderSelectedWeek('FN-TIT24');

            const container = document.getElementById('timetable-container');
            // Hier prüfen wir einfach, ob der Render-Prozess ohne Crash durchlief
            expect(container).not.toBeNull();
        });
    });

    describe('Session Errors', () => {
        it('should handle api/session failure gracefully', async () => {
            // Erster Aufruf schlägt fehl
            global.fetch.mockImplementationOnce(async () => ({ ok: false }));

            initDates();
            const nextBtn = document.getElementById('nextButton');
            nextBtn.click(); 
            
            await new Promise(process.nextTick);
            
            // Verifizieren, dass der Session-Check versucht wurde
            expect(global.fetch).toHaveBeenCalledWith('/api/session');
        });
    });
});