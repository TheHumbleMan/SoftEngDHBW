import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import { app } from '../server.js'; // Passe den Pfad an, falls deine Datei anders heißt

// 1. Scraper-Funktionen mocken, damit keine echten Web-Requests passieren
vi.mock('../scripts/dhbwAPP_scraper.js', () => ({
    scrapeDhbwApp: vi.fn().mockResolvedValue({ kurs: 'MockKurs' })
}));

vi.mock('../scripts/seezeit_mensa_scraper.js', () => ({
    scrapeSeezeitAll: vi.fn().mockResolvedValue({ success: true, daten: 'MockMensa' })
}));

describe('Express Server API & Routes', () => {
    let sessionCookie = '';

    beforeEach(() => {
        vi.clearAllMocks();
    });

    afterEach(() => {
        vi.useRealTimers(); // Falls Time-Mocks verwendet wurden, zurücksetzen
    });

    describe('Unauthenticated Routes', () => {
        it('should redirect / to /auth/login when not authenticated', async () => {
            const res = await request(app).get('/');
            expect(res.status).toBe(302);
            expect(res.header.location).toBe('/auth/login');
        });

        it('should render the login page on GET /auth/login', async () => {
            // Hinweis: Da wir views mocken müssten oder ejs parsen, prüfen wir nur auf Status 200.
            const res = await request(app).get('/auth/login');
            expect(res.status).toBe(200);
            expect(res.text).toContain('<html'); // Annahme, dass HTML gerendert wird
        });

        it('should redirect protected routes (e.g., /dashboard) to login', async () => {
            const res = await request(app).get('/dashboard');
            expect(res.status).toBe(302);
            expect(res.header.location).toBe('/auth/login?error=session');
        });

        it('should return 401 for /api/session when not logged in', async () => {
            const res = await request(app).get('/api/session');
            expect(res.status).toBe(401);
            expect(res.body.authenticated).toBe(false);
        });
    });

    describe('Login Validations (POST /auth/login)', () => {
        it('should return 400 if role is missing', async () => {
            const res = await request(app).post('/auth/login').send({ course: 'FN-123' });
            expect(res.status).toBe(400);
            expect(res.body.error).toBe('required');
        });

        it('should return 400 if role is invalid', async () => {
            const res = await request(app).post('/auth/login').send({ role: 'admin', course: 'FN-123' });
            expect(res.status).toBe(400);
            expect(res.body.error).toBe('invalid');
        });

        it('should return 400 if course is missing', async () => {
            const res = await request(app).post('/auth/login').send({ role: 'student' });
            expect(res.status).toBe(400);
            expect(res.body.error).toBe('course-required');
        });

        it('should return 400 if faculty in course is invalid', async () => {
            const res = await request(app).post('/auth/login').send({ role: 'student', course: 'XX-123' });
            expect(res.status).toBe(400);
            expect(res.body.error).toBe('invalid');
        });
    });

    describe('Authenticated Flow', () => {
        it('should login successfully, set cookie, and trigger scrapers', async () => {
            const res = await request(app)
                .post('/auth/login')
                .send({ role: 'student', course: 'FN-TINF20' });

            expect(res.status).toBe(200);
            expect(res.body.success).toBe(true);
            expect(res.body.redirect).toBe('/dashboard');

            // Session-Cookie speichern für Folge-Requests
            sessionCookie = res.headers['set-cookie'];

            // Überprüfen, ob Scraper im Hintergrund angestoßen wurden
            const { scrapeDhbwApp } = await import('../scripts/dhbwAPP_scraper.js');
            const { scrapeSeezeitAll } = await import('../scripts/seezeit_mensa_scraper.js');
            
            expect(scrapeDhbwApp).toHaveBeenCalledWith(expect.objectContaining({
                sessionCourse: 'TINF20'
            }));
            expect(scrapeSeezeitAll).toHaveBeenCalled();
        });

        it('should redirect / to /dashboard when authenticated', async () => {
            const res = await request(app)
                .get('/')
                .set('Cookie', sessionCookie);
            expect(res.status).toBe(302);
            expect(res.header.location).toBe('/dashboard');
        });

        it('should fetch user session data via /api/session', async () => {
            const res = await request(app)
                .get('/api/session')
                .set('Cookie', sessionCookie);
            
            expect(res.status).toBe(200);
            expect(res.body.authenticated).toBe(true);
            expect(res.body.role).toBe('student');
            expect(res.body.faculty).toBe('FN');
            expect(res.body.course).toBe('TINF20');
        });

        it('should run manual dhbw scraper successfully', async () => {
            const res = await request(app)
                .get('/scrape-dhbw')
                .set('Cookie', sessionCookie);
            
            expect(res.status).toBe(200);
            expect(res.body.success).toBe(true);
        });

        it('should run manual mensa scraper successfully', async () => {
            const res = await request(app)
                .get('/scrape-mensa')
                .set('Cookie', sessionCookie);
            
            expect(res.status).toBe(200);
            expect(res.body.success).toBe(true);
            expect(res.body.data).toBeDefined();
        });

       it('should clear session on logout and redirect', async () => {
            // 1. Logout durchführen
            const res = await request(app)
                .get('/auth/logout')
                .set('Cookie', sessionCookie);
            
            expect(res.status).toBe(302);
            expect(res.header.location).toBe('/auth/login?success=logout');

            // 2. Testen, ob wir mit dem alten Cookie noch reinkommen
            const verifyRes = await request(app)
                .get('/dashboard')
                .set('Cookie', sessionCookie); // Wir nutzen hier das alte Cookie
            
            // 3. Da die Session serverseitig gelöscht ist, sollten wir zum Login fliegen
            expect(verifyRes.status).toBe(302);
            expect(verifyRes.header.location).toBe('/auth/login?error=session');
        });
    });

    describe('Session Timeout Logic', () => {
        it('should destroy session if timeout is exceeded', async () => {
            // Login
            const loginRes = await request(app)
                .post('/auth/login')
                .send({ role: 'student', course: 'RV-BWL21' });
            const cookie = loginRes.headers['set-cookie'];

            // Zeit in die Zukunft verschieben (Mock `Date.now`)
            const FUTURE_TIME = Date.now() + (3600 * 1000) + 10000; // 1 Stunde + 10 Sekunden
            vi.useFakeTimers();
            vi.setSystemTime(FUTURE_TIME);

            // Access protected route
            const res = await request(app)
                .get('/dashboard')
                .set('Cookie', cookie);
            
            expect(res.status).toBe(302);
            expect(res.header.location).toBe('/auth/login?error=session');
            
            vi.useRealTimers();
        });
    });

    describe('Additional Routes & Error Catching (Coverage Boost)', () => {
        // 1. Partner Login Test
        it('should login as partner successfully', async () => {
            const res = await request(app)
                .post('/auth/login')
                .send({ role: 'partner', course: 'RV-BWL21' });
            expect(res.status).toBe(200);
            expect(res.body.success).toBe(true);
        });

        // 2. Fallback-Routen (Weiterleitungen)
        it('should redirect static HTML fallbacks', async () => {
            let res = await request(app).get('/dashboard.html');
            expect(res.status).toBe(302);
            expect(res.header.location).toBe('/dashboard');

            res = await request(app).get('/auth/login.html');
            expect(res.status).toBe(302);
            expect(res.header.location).toBe('/auth/login');
        });

        // 3. Kacheln (geschützt und ungeschützt)
        it('should render unprotected kacheln', async () => {
            const res = await request(app).get('/kacheln/dummy.html');
            expect(res.status).toBe(200);
        });

        it('should render protected kacheln when authenticated', async () => {
            const loginRes = await request(app)
                .post('/auth/login')
                .send({ role: 'student', course: 'FN-TINF20' });
            const cookie = loginRes.headers['set-cookie'];

            const protectedRoutes = ['student.html', 'partner.html', 'timetable.html', 'opnv.html'];
            for (const route of protectedRoutes) {
                const res = await request(app).get(`/kacheln/${route}`).set('Cookie', cookie);
                expect(res.status).toBe(200);
            }
        });

        // 4. Debug Session Seite (nur Clear-Action testen, um Template-Fehler zu vermeiden)
        it('should handle /debug-session clear action', async () => {
            const loginRes = await request(app)
                .post('/auth/login')
                .send({ role: 'student', course: 'FN-TINF20' });
            const cookie = loginRes.headers['set-cookie'];

            const res = await request(app).get('/debug-session?action=clear_session').set('Cookie', cookie);
            expect(res.status).toBe(302);
            expect(res.header.location).toBe('/debug-session');
        });

        // 5. Catch-Blöcke (Fehlersimulation beim Scraping)
        it('should return 500 when dhbw scraper fails', async () => {
            // ERST einloggen (löst den normalen Hintergrund-Scrape aus)
            const loginRes = await request(app).post('/auth/login').send({ role: 'student', course: 'FN-TINF20' });
            
            // DANN erst den Fehler für den manuellen Aufruf vorbereiten
            const { scrapeDhbwApp } = await import('../scripts/dhbwAPP_scraper.js');
            scrapeDhbwApp.mockRejectedValueOnce(new Error('Mocked Scrape Error'));

            // JETZT manuell scrapen
            const res = await request(app).get('/scrape-dhbw').set('Cookie', loginRes.headers['set-cookie']);
            
            expect(res.status).toBe(500);
            expect(res.body.error).toBe('Mocked Scrape Error');
        });

        it('should return 500 when mensa scraper fails', async () => {
            // ERST einloggen
            const loginRes = await request(app).post('/auth/login').send({ role: 'student', course: 'FN-TINF20' });
            
            // DANN den Fehler simulieren
            const { scrapeSeezeitAll } = await import('../scripts/seezeit_mensa_scraper.js');
            scrapeSeezeitAll.mockRejectedValueOnce(new Error('Mocked Mensa Error'));

            // JETZT manuell scrapen
            const res = await request(app).get('/scrape-mensa').set('Cookie', loginRes.headers['set-cookie']);
            
            expect(res.status).toBe(500);
            expect(res.body.error).toBe('Mocked Mensa Error');
        });
    });
});