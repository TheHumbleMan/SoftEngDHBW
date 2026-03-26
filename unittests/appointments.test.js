/**
 * @vitest-environment jsdom
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderPhases } from '../scripts/appointments.js'; 

describe('Phases Logic', () => {
    beforeEach(() => {
        // DOM-Elemente vorbereiten, die von renderPhases erwartet werden
        document.body.innerHTML = `
            <h2 id="appointment-title"></h2>
            <div id="appointment-container"></div>
        `;
        
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('sollte das korrekte Studienjahr für einen Kurs berechnen (Beispiel TIT24 im Jahr 2024)', async () => {
        // Setze das Datum auf November 2024 (Studienjahr 1)
        vi.setSystemTime(new Date('2024-11-15'));
        
        await renderPhases('TIT24');

        const title = document.getElementById('appointment-title');
        expect(title.textContent).toContain('1. Studienjahr');
    });

    it('sollte das 2. Studienjahr für TIT23 im Jahr 2024 erkennen', async () => {
        // November 2024: TIT23 ist im 2. Jahr
        vi.setSystemTime(new Date('2024-11-15'));
        
        await renderPhases('TIT23');

        const title = document.getElementById('appointment-title');
        expect(title.textContent).toContain('2. Studienjahr');
    });

    it('sollte die Klasse "current" der aktuellen Phase zuweisen', async () => {
        // 15. Januar 2025: KW 3 -> Theoriephase 1 (1. Studienjahr)
        vi.setSystemTime(new Date('2025-01-15'));
        
        await renderPhases('TIT24');

        const currentPhase = document.querySelector('.phase.current');
        expect(currentPhase).not.toBeNull();
        expect(currentPhase.innerHTML).toContain('Theoriephase 1');
    });

    it('sollte die Phasen für das 3. Studienjahr korrekt rendern', async () => {
        // Mai 2026: Ein TIT23 Kurs ist im 3. Studienjahr (nach Sept 2025)
        vi.setSystemTime(new Date('2026-05-10'));
        
        await renderPhases('TIT23');

        const container = document.getElementById('appointment-container');
        const phases = container.querySelectorAll('.phase');
        
        // Das 3. Jahr hat laut Objekt 7 Phasen
        expect(phases.length).toBe(7);
        expect(container.innerHTML).toContain('Bachelorarbeit');
    });

    it('sollte Datumsbereiche korrekt berechnen (Jahreswechsel KW 52 -> 1)', async () => {
        vi.setSystemTime(new Date('2024-12-28'));
        
        await renderPhases('TIT24');
        
        // Praxisphase 1 im 1. Jahr geht von KW 40 bis KW 1
        const phases = document.querySelectorAll('.phase');
        const praxisPhase1 = Array.from(phases).find(p => p.textContent.includes('Praxisphase 1'));
        
        // Da KW 40 in 2024 liegt und KW 1 in 2025:
        expect(praxisPhase1.innerHTML).toContain('2024');
        expect(praxisPhase1.innerHTML).toContain('2025');
    });
});