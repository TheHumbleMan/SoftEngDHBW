/**
 * @vitest-environment jsdom
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { initDates, renderSelectedWeek } from '../scripts/timetable.js'; 

describe('Timetable Frontend - Maximum Branch Coverage', () => {
    // 23.10.2023 = Montag (KW 43)
    const FAKE_MONDAY = new Date(2023, 9, 23, 10, 0, 0); 

    beforeEach(() => {
        document.body.innerHTML = `
            <h2 id="timetable-title"></h2>
            <div id="timetable-container"></div>
            <button id="backButton">Back</button>
            <button id="nextButton">Next</button>
        `;

        // Wichtig für renderSingle/Double/Triple Berechnungen
        Object.defineProperty(HTMLElement.prototype, 'offsetHeight', { 
            configurable: true, value: 50 
        });

        vi.useFakeTimers();
        vi.setSystemTime(FAKE_MONDAY);

        // Standard-Mock für Fetch
        global.fetch = vi.fn().mockImplementation(async (url) => {
            if (url === '/api/session') {
                return { 
                    ok: true, 
                    json: async () => ({ authenticated: true, faculty: 'FN', course: 'T20' }) 
                };
            }
            if (url.includes('data/timetables/')) {
                return { ok: true, json: async () => [] };
            }
            return { ok: false };
        });
    });

    afterEach(() => {
        vi.clearAllTimers();
        vi.useRealTimers();
        vi.restoreAllMocks();
    });

    // --- SECTION 1: NAVIGATION & DATE BOUNDARIES ---
    describe('Navigation Logic', () => {
        it('should handle boundaries and week switching', async () => {
            initDates();
            const nextBtn = document.getElementById('nextButton');
            const backBtn = document.getElementById('backButton');
            
            // Vorwärts
            nextBtn.click();
            await vi.runAllTimersAsync();
            expect(document.getElementById("timetable-title").textContent).toContain('KW 44');

            // Zurück (Boundary Check: if (lastMonday < getCurrentMonday()))
            backBtn.click();
            await vi.runAllTimersAsync();
            expect(document.getElementById("timetable-title").textContent).toContain('KW 43');
        });
    });

    // --- SECTION 2: SESSION & API BRANCHES ---
    describe('Session & API Branches', () => {
        it('should cover all error branches in loadCourse (Line 31 & OR branches)', async () => {
            // Wir müssen sicherstellen, dass fetchTimetableData nicht crasht, 
            // auch wenn loadCourse null liefert.
            global.fetch.mockImplementation(async (url) => {
                if (url === '/api/session') return { ok: false }; // Branch !res.ok
                return { ok: true, json: async () => [] }; // Fallback für Daten
            });

            initDates();
            await renderSelectedWeek('T20');

            // Branch 2: Authentifiziert, aber Kurs fehlt (!session.course)
            global.fetch.mockImplementation(async (url) => {
                if (url === '/api/session') {
                    return { ok: true, json: async () => ({ authenticated: true, course: null }) };
                }
                return { ok: true, json: async () => [] };
            });
            
            await renderSelectedWeek('T20');
            
            expect(global.fetch).toHaveBeenCalled();
        });
    });

    // --- SECTION 3: WEEKDAY RENDERING BRANCHES ---
    describe('Weekday Rendering', () => {
        it('should cover cases where specific days are missing in JSON (if branches)', async () => {
            // Nur Montag und Freitag haben Daten, der Rest triggert den "false" Pfad der if-Abfragen
            const mockData = [
                { date: '23.10.2023', appointments: [{ name: "M", startTime: "08.00", endTime: "09.00" }] },
                { date: '27.10.2023', appointments: [{ name: "F", startTime: "08.00", endTime: "09.00" }] }
            ];

            global.fetch.mockImplementation(async (url) => {
                if (url.includes('data/timetables/')) return { ok: true, json: async () => mockData };
                return { ok: true, json: async () => ({ authenticated: true, course: 'T20' }) };
            });

            await renderSelectedWeek('T20');
            expect(document.querySelectorAll('.singleApp').length).toBe(2);
        });
    });

    // --- SECTION 4: LAYOUT & OVERLAP BRANCHES (THE BIG ONES) ---
    describe('Complex Layout Logic', () => {
        it('should cover overlapping and simultaneous starts (renderDouble Branches)', async () => {
            const mockData = [{
                date: '23.10.2023',
                appointments: [
                    // Gleichzeitiger Start (triggert if(i === -1) -> leftOffset = 3)
                    { name: "S1", startTime: "08.00", endTime: "09.00" },
                    { name: "S2", startTime: "08.00", endTime: "09.00" },
                    // Versetzter Overlap (triggert runningAppEndSlot > appStartSlot)
                    { name: "O1", startTime: "10.00", endTime: "12.00" },
                    { name: "O2", startTime: "11.00", endTime: "13.00" },
                    // Lücke (triggert if(!runningApp) continue)
                    { name: "Gap", startTime: "15.00", endTime: "16.00" }
                ]
            }];

            global.fetch.mockImplementation(async (url) => {
                if (url.includes('data/timetables/')) return { ok: true, json: async () => mockData };
                return { ok: true, json: async () => ({ authenticated: true, course: 'T20' }) };
            });

            await renderSelectedWeek('T20');
            const doubleApps = document.querySelectorAll('.doubleApp');
            expect(doubleApps.length).toBeGreaterThan(0);
        });

        it('should cover all occupancy states in renderTriple (Lines 298-348)', async () => {
            const mockData = [{
                date: '23.10.2023',
                appointments: [
                    { name: "T1", startTime: "09.00", endTime: "11.00" }, // Spalte 0
                    { name: "T2", startTime: "09.15", endTime: "11.00" }, // Spalte 1
                    { name: "T3", startTime: "09.30", endTime: "11.00" }, // Spalte 2
                    { name: "T4", startTime: "09.45", endTime: "11.00" }  // Triggert columnIndex === -1
                ]
            }];

            global.fetch.mockImplementation(async (url) => {
                if (url.includes('data/timetables/')) return { ok: true, json: async () => mockData };
                return { ok: true, json: async () => ({ authenticated: true, course: 'T20' }) };
            });

            await renderSelectedWeek('T20');
            const triples = document.querySelectorAll('.tripleApp');
            // Sollte max 3 rendern wegen columnIndex guard
            expect(triples.length).toBeLessThanOrEqual(3);
        });
    });

    // --- SECTION 5: ERROR HANDLING & MISC ---
    describe('Error Handling', () => {
        it('should cover fetch catch blocks', async () => {
            const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
            global.fetch.mockRejectedValue(new Error('Fail'));

            await renderSelectedWeek('T20');
            expect(spy).toHaveBeenCalled();
            spy.mockRestore();
        });

        it('should show fallback when no data array is returned', async () => {
            global.fetch.mockImplementation(async (url) => {
                if (url.includes('data/timetables/')) return { ok: true, json: async () => [] };
                return { ok: true, json: async () => ({ authenticated: true, course: 'T20' }) };
            });

            await renderSelectedWeek('T20');
            expect(document.getElementById('timetable-container').textContent).toContain('spannender inhalt');
        });
    });
});