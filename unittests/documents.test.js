/**
 * @vitest-environment jsdom
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { initDocuments } from '../scripts/documents.js';

describe('Documents Module - Maximum Branch Coverage', () => {
    const MOCK_DOCS = {
        documents: [
            {
                title: 'Dokument A',
                category: 'Lehre',
                local_path: 'lehre/a.pdf'
            }
        ]
    };

    beforeEach(() => {
        // Standard Setup
        document.body.innerHTML = `
            <input data-documents-search type="text">
            <button data-documents-toggle></button>
            <span data-documents-count></span>
            <div data-documents-root></div>
        `;

        global.fetch = vi.fn(async () => ({
            ok: true,
            json: async () => MOCK_DOCS
        }));
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    describe('Critical Branch Coverage (The Missing 25%)', () => {
        
        // Deckt Zeile 106 ab: Guard Clause
        it('sollte sofort abbrechen, wenn der Root-Container fehlt', async () => {
            document.body.innerHTML = ''; 
            await initDocuments();
            expect(global.fetch).not.toHaveBeenCalled();
        });

        // Deckt Zeile 162-163 ab: if (countLabel) existiert vs. existiert nicht
        it('sollte auch funktionieren, wenn countLabel im DOM fehlt', async () => {
            document.body.innerHTML = '<div data-documents-root></div>'; // Kein countLabel
            await initDocuments();
            await new Promise(process.nextTick);
            const container = document.querySelector('[data-documents-root]');
            expect(container.innerHTML).toContain('Dokument A');
        });

        // Deckt Zeile 176-177 ab: Fehlerfall UND countLabel Handling
        it('sollte im Fehlerfall das countLabel leeren, falls es existiert', async () => {
            global.fetch.mockImplementationOnce(async () => ({ ok: false }));
            
            const countLabel = document.querySelector('[data-documents-count]');
            countLabel.textContent = 'Vorheriger Text';

            await initDocuments();
            await new Promise(process.nextTick);

            expect(countLabel.textContent).toBe('');
            expect(document.body.innerHTML).toContain('Dokumente konnten nicht geladen werden');
        });

        // Deckt Zeile 127 & 137 ab: toggleButton Checks
        it('sollte keine Fehler werfen, wenn der toggleButton fehlt', async () => {
            document.body.innerHTML = '<div data-documents-root></div>'; // Kein Button
            await initDocuments();
            await new Promise(process.nextTick);
            // Wenn kein Fehler geworfen wurde, ist der Branch "if (!toggleButton) return" gedeckt
            expect(true).toBe(true);
        });

        // Deckt Zeile 8 ab: buildDownloadUrl Fallback
        it('sollte "#" als Link setzen, wenn local_path leer ist', async () => {
            global.fetch.mockImplementationOnce(async () => ({
                ok: true,
                json: async () => ({
                    documents: [{ title: 'NoPath', local_path: '', category: 'Test' }]
                })
            }));
            await initDocuments();
            await new Promise(process.nextTick);
            const link = document.querySelector('.document-download-link');
            expect(link.getAttribute('href')).toBe('#');
        });
    });

    describe('Search & Filter Branches', () => {
        it('sollte bei leerer Suche alle Dokumente zeigen (Line 50 Branch)', async () => {
            await initDocuments();
            await new Promise(process.nextTick);
            const searchInput = document.querySelector('[data-documents-search]');
            
            searchInput.value = ''; 
            searchInput.dispatchEvent(new Event('input'));
            
            const items = document.querySelectorAll('.document-item');
            expect(items.length).toBe(1);
        });

        it('sollte Nachricht zeigen, wenn Filter keine Ergebnisse liefert', async () => {
            await initDocuments();
            await new Promise(process.nextTick);
            const searchInput = document.querySelector('[data-documents-search]');
            
            searchInput.value = 'PhantasieBegriff';
            searchInput.dispatchEvent(new Event('input'));
            
            expect(document.body.innerHTML).toContain('Keine Dokumente zur Suche gefunden');
        });
    });

    describe('Tree Logic Branches', () => {
        it('sollte Fallback-Kategorie "Allgemein" nutzen', async () => {
            global.fetch.mockImplementationOnce(async () => ({
                ok: true,
                json: async () => ({
                    documents: [{ title: 'Ohne Kat', local_path: 'a.pdf' }] // category fehlt
                })
            }));
            await initDocuments();
            await new Promise(process.nextTick);
            expect(document.querySelector('summary').textContent).toBe('Allgemein');
        });
    });
    describe('Final Branch Gaps', () => {

    it('sollte Dokumente innerhalb einer Kategorie alphabetisch sortieren (Line 92)', async () => {
        global.fetch.mockImplementationOnce(async () => ({
            ok: true,
            json: async () => ({
                documents: [
                    { title: 'B-Dokument', local_path: 'b.pdf', category: 'Test' },
                    { title: 'A-Dokument', local_path: 'a.pdf', category: 'Test' }
                ]
            })
        }));

        await initDocuments();
        await new Promise(process.nextTick);

        const titles = Array.from(document.querySelectorAll('.document-title'))
            .map(el => el.textContent);
        
        // Prüft, ob A vor B kommt (Sortier-Branch in Zeile 92)
        expect(titles[0]).toBe('A-Dokument');
        expect(titles[1]).toBe('B-Dokument');
    });

    it('sollte das countLabel korrekt setzen (Line 162-163)', async () => {
        // Wir stellen sicher, dass das Label im DOM ist
        document.body.innerHTML = `
            <span data-documents-count></span>
            <div data-documents-root></div>
        `;
        
        await initDocuments();
        await new Promise(process.nextTick);

        const countLabel = document.querySelector('[data-documents-count]');
        // Wenn dieser Text erscheint, wurde der Branch "if (countLabel)" in Zeile 162 wahr
        expect(countLabel.textContent).toBe('1 von 1 Dokumenten');
    });

    it('sollte den Toggle-Button Event-Listener auslösen (Line 195)', async () => {
        // Sicherstellen, dass der Button da ist
        document.body.innerHTML = `
            <button data-documents-toggle></button>
            <div data-documents-root></div>
        `;
        
        await initDocuments();
        await new Promise(process.nextTick);

        const toggleBtn = document.querySelector('[data-documents-toggle]');
        
        // Simuliert den Klick, um den Listener in Zeile 195 zu triggern
        toggleBtn.click();
        
        // Prüft, ob die Funktion "setAllCategoriesExpanded" intern gefeuert hat
        expect(toggleBtn.textContent).toBe('Alle einklappen');
    });

    it('sollte bei fehlendem Filternamen auf filename zurückfallen (Line 92 Branch)', async () => {
        global.fetch.mockImplementationOnce(async () => ({
            ok: true,
            json: async () => ({
                documents: [
                    { title: null, filename: 'z.pdf', local_path: 'z.pdf', category: 'Test' },
                    { title: null, filename: 'a.pdf', local_path: 'a.pdf', category: 'Test' }
                ]
            })
        }));

        await initDocuments();
        await new Promise(process.nextTick);

        const titles = Array.from(document.querySelectorAll('.document-title'))
            .map(el => el.textContent);
        
        // Testet den Branch: String(a.title || a.filename || '')
        expect(titles[0]).toBe('a.pdf');
    });
});
});