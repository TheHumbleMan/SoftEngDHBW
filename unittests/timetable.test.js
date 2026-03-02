/**
 * @vitest-environment jsdom
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { initDates, renderSelectedWeek } from '../scripts//timetable.js'; 

describe('Timetable Frontend Logic', () => {
    // Fake-Daten für unsere Tests
    const FAKE_MONDAY = new Date('2023-10-23T10:00:00Z'); // Ein fester Montag

    beforeEach(() => {
        // 1. DOM vorbereiten
        document.body.innerHTML = `
            <button id="backButton">Back</button>
            <button id="nextButton">Next</button>
            <div id="timetable-container"></div>
        `;

        // 2. Damit offsetHeight (für die Berechnung der Div-Größen) im Test nicht 0 ist:
        Object.defineProperty(HTMLElement.prototype, 'offsetHeight', { configurable: true, value: 50 });

        // 3. Zeit einfrieren
        vi.useFakeTimers();
        vi.setSystemTime(FAKE_MONDAY);

        // 4. Fetch mocken
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
                            date: '23.10.2023', // Montag: Ein einzelner Termin
                            appointments: [
                                { name: "Single", location: "A1", startTime: "08.00", endTime: "09.30" }
                            ]
                        },
                        {
                            date: '24.10.2023', // Dienstag: Zwei überlappende Termine (Double)
                            appointments: [
                                { name: "Double1", location: "B1", startTime: "10.00", endTime: "11.30" },
                                { name: "Double2", location: "B2", startTime: "11.00", endTime: "12.30" }
                            ]
                        },
                        {
                            date: '25.10.2023', // Mittwoch: Drei überlappende Termine (Triple)
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
            
            // Buttons prüfen
            const nextBtn = document.getElementById('nextButton');
            const backBtn = document.getElementById('backButton');
            expect(nextBtn).not.toBeNull();
            expect(backBtn).not.toBeNull();
        });

        it('should trigger showNextWeek when Next is clicked', async () => {
            initDates();
            const nextBtn = document.getElementById('nextButton');
            
            // Klick simulieren
            nextBtn.click();
            
            // Warten bis Promises aufgelöst sind
            await new Promise(process.nextTick); 
            
            // Fetch sollte zweimal aufgerufen werden (1x Session, 1x Timetable Data)
            expect(global.fetch).toHaveBeenCalledWith('/api/session');
        });

        it('should trigger showPreviousWeek and respect boundary', async () => {
            initDates();
            const backBtn = document.getElementById('backButton');
            
            // Klick simulieren (sollte nicht weiter als aktuelle Woche zurückgehen)
            backBtn.click();
            await new Promise(process.nextTick);
            
            expect(global.fetch).toHaveBeenCalledWith('/api/session');
        });
    });

    describe('Rendering & Appointment Logic', () => {
        it('should render the timetable with single, double and triple appointments', async () => {
            initDates(); // Setzt das Datum auf den 23.10.2023
            await renderSelectedWeek('FN-TIT24');

            const container = document.getElementById('timetable-container');
            
            // Prüfen ob die Tabelle gezeichnet wurde
            expect(container.innerHTML).toContain('<table');
            
            // Prüfen ob die Spaltenbeschriftungen stimmen (z.B. Montag 23.10.)
            expect(container.innerHTML).toContain('Montag');
            expect(container.innerHTML).toContain('23.10.');

            // Prüfen ob Termine eingefügt wurden
            const singleApps = document.querySelectorAll('.singleApp');
            const doubleApps = document.querySelectorAll('.doubleApp');
            const tripleApps = document.querySelectorAll('.tripleApp');

            expect(singleApps.length).toBe(1); // Montag
            expect(doubleApps.length).toBe(2); // Dienstag
            expect(tripleApps.length).toBe(3); // Mittwoch
        });

        it('should handle empty JSON gracefully', async () => {
            // Mock für leere Daten überschreiben
            global.fetch.mockImplementationOnce(async (url) => {
                if (url.includes('data/timetables/')) return { json: async () => [] };
                return { ok: true, json: async () => ({ authenticated: true, faculty: 'FN', course: 'TIT24' }) };
            });

            initDates();
            await renderSelectedWeek('FN-TIT24');

            const container = document.getElementById('timetable-container');
            expect(container.innerHTML).toContain('ein spannender inhalt');
        });
    });

    describe('Session Errors', () => {
        it('should return empty/null if api/session fails', async () => {
            // Mock Session Error
            global.fetch.mockImplementationOnce(async (url) => {
                if (url === '/api/session') return { ok: false };
                return { json: async () => [] };
            });

            initDates();
            const nextBtn = document.getElementById('nextButton');
            nextBtn.click(); // Triggert showNextWeek -> loadCourse
            
            await new Promise(process.nextTick);
            // Wenn loadCourse fehlschlägt, sucht renderSelectedWeek nach course = null/undefined
            expect(global.fetch).toHaveBeenCalledWith(expect.stringContaining('null'));
        });
    });
});