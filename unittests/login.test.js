import { describe, it, expect, vi, beforeEach } from 'vitest';
import { 
    createCourseStore, 
    loadCourses, 
    showMessage, 
    selectRole, 
    handleLoginSubmit,
    backToRole,
    initLogin
} from '../scripts/login.js'; // Pfad anpassen

describe('Login Module Comprehensive Tests', () => {
    let mockDoc;

    beforeEach(() => {
        // Frisches DOM für jeden Testlauf
        document.body.innerHTML = `
            <div id="messageContainer"></div>
            <div id="roleSelectionStep" style="display: block;"></div>
            <div id="courseSelectionStep" style="display: none;"></div>
            <input id="roleInput" value="" />
            <select id="courseSelect"><option value="">--</option></select>
            <form id="loginForm">
                <button type="submit">Login</button>
            </form>
        `;
        mockDoc = document;
        vi.clearAllMocks();
        vi.spyOn(console, 'error').mockImplementation(() => {});
    });

    //1. API & Store Tests (Inkl. Fehlerbehandlung)
    it('sollte den Store befüllen, wenn die API erfolgreich ist', async () => {
        const store = createCourseStore();
        const mockFetch = vi.fn().mockResolvedValue({
            json: () => Promise.resolve({ courses: ['Kurs1'] })
        });
        await loadCourses(store, mockFetch);
        expect(store.FN).toContain('Kurs1');
    });

    it('sollte einen Fehler loggen, wenn der API-Aufruf fehlschlägt (Zeile 22)', async () => {
        const store = createCourseStore();
        const mockFetch = vi.fn().mockRejectedValue(new Error('Network Error'));
        const consoleSpy = vi.spyOn(console, 'error');
        
        await loadCourses(store, mockFetch);
        
        expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Fehler beim Laden'), expect.any(Error));
    });

    //2. UI & Interaction Tests
    it('sollte UI-Elemente korrekt umschalten (selectRole / backToRole)', () => {
        const store = { FN: ['A'], RV: ['B'] };
        selectRole(mockDoc, store, 'student');
        expect(mockDoc.getElementById('courseSelectionStep').style.display).toBe('block');
        
        backToRole(mockDoc);
        expect(mockDoc.getElementById('roleSelectionStep').style.display).toBe('block');
        expect(mockDoc.getElementById('roleInput').value).toBe('');
    });

    //3. Login Logic (Inkl. Netzwerkfehlern Zeile 141-142)
    it('sollte bei technischem Fehler beim Submit eine Meldung zeigen', async () => {
        mockDoc.getElementById('courseSelect').innerHTML = '<option value="FN-X">X</option>';
        mockDoc.getElementById('courseSelect').value = 'FN-X';
        
        const showMessageSpy = vi.fn();
        const mockFetch = vi.fn().mockRejectedValue(new Error('Server Down'));

        await handleLoginSubmit({
            event: { preventDefault: vi.fn(), target: mockDoc.getElementById('loginForm') },
            doc: mockDoc,
            fetchFn: mockFetch,
            showMessageFn: showMessageSpy
        });

        expect(showMessageSpy).toHaveBeenCalledWith(expect.anything(), expect.stringContaining('Netzwerkfehler'));
    });

    //4. URL Parameter & Init (Zeilen 153-170)
    it('sollte Logout-Erfolg aus URL-Parametern anzeigen', async () => {
        const mockLoc = { search: '?success=logout', href: '' };
        
        // initLogin registriert den Listener
        initLogin({ doc: mockDoc, locationObj: mockLoc, fetchFn: vi.fn().mockResolvedValue({ json: () => ({ courses: [] }) }) });

        // Event auslösen
        mockDoc.dispatchEvent(new Event('DOMContentLoaded'));

        // Ein winziger Moment warten, damit der async-Block im Listener fertig wird
        await new Promise(resolve => setTimeout(resolve, 0));

        const msg = mockDoc.getElementById('messageContainer').textContent;
        expect(msg).toContain('erfolgreich abgemeldet');
    });

    it('sollte verschiedene Fehlermeldungen aus der URL mappen', async () => {
        const errors = [
            { code: 'session', expected: 'Sitzung ist abgelaufen' },
            { code: 'access', expected: 'keine Berechtigung' },
            { code: 'required', expected: 'Partner' }
        ];

        for (const err of errors) {
            mockDoc.getElementById('messageContainer').innerHTML = ''; 
            const mockLoc = { search: `?error=${err.code}`, href: '' };
            
            initLogin({ doc: mockDoc, locationObj: mockLoc, fetchFn: vi.fn().mockResolvedValue({ json: () => ({ courses: [] }) }) });
            
            mockDoc.dispatchEvent(new Event('DOMContentLoaded'));
            
            // Warten auf async-Verarbeitung im Listener
            await new Promise(resolve => setTimeout(resolve, 0));
            
            const msg = mockDoc.getElementById('messageContainer').textContent;
            expect(msg).toContain(err.expected);
        }
    });

    it('sollte den Submit-Listener korrekt an das Formular binden', () => {
        const mockLoc = { search: '', href: '' };
        const form = mockDoc.getElementById('loginForm');
        const addSpy = vi.spyOn(form, 'addEventListener');

        initLogin({ doc: mockDoc, locationObj: mockLoc });

        expect(addSpy).toHaveBeenCalledWith('submit', expect.any(Function));
    });
});