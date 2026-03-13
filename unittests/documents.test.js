/**
 * @vitest-environment jsdom
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { initDocuments } from '../scripts/documents.js';

describe('Documents Module', () => {
    const MOCK_DOCS = {
        documents: [
            {
                title: 'Test Dokument A',
                description: 'Beschreibung A',
                filename: 'test_a.pdf',
                category: 'Lehre/Skripte',
                local_path: 'lehre\\skripte\\test_a.pdf'
            },
            {
                title: 'B-Dokument',
                description: 'Andere Info',
                filename: 'test_b.pdf',
                category: 'Allgemein',
                local_path: '/allgemein/test_b.pdf'
            }
        ]
    };

    beforeEach(() => {
        // DOM Setup
        document.body.innerHTML = `
            <input data-documents-search type="text">
            <button data-documents-toggle></button>
            <span data-documents-count></span>
            <div data-documents-root></div>
        `;

        // Fetch Mock
        global.fetch = vi.fn(async () => ({
            ok: true,
            json: async () => MOCK_DOCS
        }));
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    describe('Initialization & Rendering', () => {
        it('sollte Dokumente laden und als Baum rendern', async () => {
            await initDocuments();
            await new Promise(process.nextTick);

            const container = document.querySelector('[data-documents-root]');
            const categories = container.querySelectorAll('details.document-category');
            
            // "Lehre" ist die Top-Kategorie, "Allgemein" die andere
            expect(categories.length).toBeGreaterThan(0);
            expect(container.innerHTML).toContain('Test Dokument A');
            expect(container.innerHTML).toContain('B-Dokument');
        });

        it('sollte mit leeren Dokumenten-Listen umgehen', async () => {
            global.fetch.mockImplementationOnce(async () => ({
                ok: true,
                json: async () => ({ documents: [] })
            }));

            await initDocuments();
            await new Promise(process.nextTick);

            const container = document.querySelector('[data-documents-root]');
            expect(container.innerHTML).toContain('Keine Dokumente verfügbar');
        });

        it('sollte Fehlermeldung bei defekter API zeigen', async () => {
            global.fetch.mockImplementationOnce(async () => ({ ok: false }));

            await initDocuments();
            await new Promise(process.nextTick);

            const container = document.querySelector('[data-documents-root]');
            expect(container.innerHTML).toContain('Dokumente konnten nicht geladen werden');
        });
    });

describe('Path & URL Logic', () => {
        it('sollte Pfade korrekt normalisieren und encodieren', async () => {
            await initDocuments();
            await new Promise(process.nextTick);

            // Wir suchen gezielt den Link, der zu "Test Dokument A" gehört
            const links = Array.from(document.querySelectorAll('.document-item'));
            const docALink = links.find(item => 
                item.querySelector('.document-title').textContent === 'Test Dokument A'
            ).querySelector('.document-download-link');

            // Backslashes sollten zu Slashes werden
            // lehre\skripte\test_a.pdf -> /data/lehre/skripte/test_a.pdf
            expect(docALink.getAttribute('href')).toBe('/data/lehre/skripte/test_a.pdf');
        });

        it('sollte Sonderzeichen in Pfaden korrekt encodieren', async () => {
            global.fetch.mockImplementationOnce(async () => ({
                ok: true,
                json: async () => ({
                    documents: [{
                        title: 'Sonderzeichen',
                        local_path: 'ordner mit leerzeichen/test#1.pdf',
                        category: 'Test'
                    }]
                })
            }));

            await initDocuments();
            await new Promise(process.nextTick);

            const link = document.querySelector('.document-download-link');
            // Leerzeichen -> %20, # -> %23
            expect(link.getAttribute('href')).toBe('/data/ordner%20mit%20leerzeichen/test%231.pdf');
        });
    });

    describe('Search & Filter', () => {
        it('sollte die Liste filtern, wenn im Suchfeld getippt wird', async () => {
            await initDocuments();
            await new Promise(process.nextTick);

            const searchInput = document.querySelector('[data-documents-search]');
            const countLabel = document.querySelector('[data-documents-count]');

            // Suche nach "Skripte" (sollte nur Dokument A finden)
            searchInput.value = 'Skripte';
            searchInput.dispatchEvent(new Event('input'));

            expect(countLabel.textContent).toContain('1 von 2');
            const container = document.querySelector('[data-documents-root]');
            expect(container.innerHTML).toContain('Test Dokument A');
            expect(container.innerHTML).not.toContain('B-Dokument');
        });

        it('sollte eine Nachricht zeigen, wenn nichts gefunden wurde', async () => {
            await initDocuments();
            await new Promise(process.nextTick);

            const searchInput = document.querySelector('[data-documents-search]');
            searchInput.value = 'ExistiertNicht';
            searchInput.dispatchEvent(new Event('input'));

            expect(document.querySelector('[data-documents-root]').textContent)
                .toContain('Keine Dokumente zur Suche gefunden');
        });
    });

    describe('Toggle UI', () => {
        it('sollte alle Kategorien auf- und zuklappen', async () => {
            await initDocuments();
            await new Promise(process.nextTick);

            const toggleBtn = document.querySelector('[data-documents-toggle]');
            
            // Klick 1: Alle aufklappen
            toggleBtn.click();
            const detailsNodes = document.querySelectorAll('details.document-category');
            detailsNodes.forEach(node => expect(node.open).toBe(true));
            expect(toggleBtn.textContent).toBe('Alle einklappen');

            // Klick 2: Alle einklappen
            toggleBtn.click();
            detailsNodes.forEach(node => expect(node.open).toBe(false));
            expect(toggleBtn.textContent).toBe('Alle aufklappen');
        });
    });
});