import express from 'express';
import session from 'express-session';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import { scrapeDhbwApp } from './scripts/dhbwAPP_scraper.js';
import { scrapeSeezeitAll } from './scripts/seezeit_mensa_scraper.js';


const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Basic paths
const VIEWS_ROOT = __dirname; // We keep view files alongside original structure
const SESSION_TIMEOUT_SECONDS = Number(process.env.SESSION_TIMEOUT_SECONDS || 3600);

// Kursdaten laden
let fnCourses = [];
let rvCourses = [];
try {
    const fnData = JSON.parse(fs.readFileSync(path.join(__dirname, 'data/kurse_fn.json'), 'utf8'));
    fnCourses = fnData.courses || [];
    const rvData = JSON.parse(fs.readFileSync(path.join(__dirname, 'data/kurse_rv.json'), 'utf8'));
    rvCourses = rvData.courses || [];
} catch (err) {
    console.error('Fehler beim Laden der Kursdaten:', err);
}

// Express setup
const app = express();
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.set('views', VIEWS_ROOT);
app.engine('html', (viewPath, data, cb) => {
    return import('ejs')
        .then(({ default: ejs }) => ejs.renderFile(viewPath, data, {}, cb))
        .catch(err => cb(err));
});
app.set('view engine', 'html');

app.use(session({
    secret: process.env.SESSION_SECRET || 'shs-node-secret',
    resave: false,
    saveUninitialized: false,
    cookie: {
        httpOnly: true,
        sameSite: 'lax'
    }
}));

app.use('/assets', express.static(path.join(__dirname, 'assets')));
app.use('/scripts', express.static(path.join(__dirname, 'scripts')));
app.use('/data', express.static(path.join(__dirname, 'data')));
app.use('/favicon', express.static(path.join(__dirname, 'favicon'), {
    maxAge: '1d',
    immutable: true
}));
app.use('/pics', express.static(path.join(__dirname, 'pics'), {
    maxAge: '1d',
    immutable: true
}));

// No user persistence required; session keeps the lightweight role info.

function requireLogin(req, res, next) {
    const { authenticated, loginTime, sessionTimeout } = req.session;
    if (!authenticated) {
        return res.redirect('/auth/login?error=session');
    }
    if (sessionTimeout && loginTime && Date.now() - loginTime > sessionTimeout * 1000) {
        req.session.destroy(() => {
            res.redirect('/auth/login?error=session');
        });
        return;
    }
    next();
}

function requirePartner(req, res, next) {
    if (!req.session.authenticated || req.session.role !== 'partner') {
        return res.redirect('/auth/login?error=access');
    }
    next();
}

function getCurrentUserFromSession(req) {
    if (!req.session.authenticated) return null;
    return {
        id: req.session.userId,
        username: req.session.username,
        role: req.session.role,
        faculty: req.session.faculty,
        course: req.session.course
    };
}

function normalizeLocalPath(value) {
    return String(value || '').replace(/\\/g, '/').replace(/^\/+/, '');
}

function walkFiles(dir, allFiles = []) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            walkFiles(fullPath, allFiles);
        } else {
            allFiles.push(fullPath);
        }
    }
    return allFiles;
}

// Authentication routes
app.get('/', async (req, res) => {
    if (req.session.authenticated) {
        return res.redirect('/dashboard');
    }
    return res.redirect('/auth/login');
});

app.get('/auth/login', async (req, res) => {
    res.render('auth/login.html', {
        error: req.query.error,
        success: req.query.success
    });
});

app.post('/auth/login', async (req, res) => {
    const roleInput = (req.body.role || '').toLowerCase();
    const course = (req.body.course || '').trim();
    
    const allowedRoles = ['student', 'partner'];
    
    // Fehlerbehandlung
    if (!roleInput) {
        return res.status(400).json({ success: false, error: 'required', message: 'Bitte wählen Sie Student oder Dualer Partner.' });
    }
    if (!allowedRoles.includes(roleInput)) {
        return res.status(400).json({ success: false, error: 'invalid', message: 'Die ausgewählte Rolle ist ungültig.' });
    }
    
    // Kursauswahl validieren
    if (!course) {
        return res.status(400).json({ success: false, error: 'course-required', message: 'Bitte wählen Sie einen Kurs aus.' });
    }
    
    // Extrahiere Fakultät und Kurscode
    const [faculty, courseCode] = course.split('-');
    if (!['FN', 'RV'].includes(faculty)) {
        return res.status(400).json({ success: false, error: 'invalid', message: 'Ungültige Fakultät.' });
    }
        

    const friendlyName = roleInput === 'partner' ? 'Dualer Partner' : 'Student';
    const mappedRole = roleInput === 'partner' ? 'partner' : 'student';


    req.session.authenticated = true;
    req.session.userId = roleInput; // simple identifier for this lightweight flow
    req.session.username = friendlyName;
    req.session.role = mappedRole;
    req.session.loginTime = Date.now();
    req.session.sessionTimeout = SESSION_TIMEOUT_SECONDS;
    req.session.faculty = faculty;
    req.session.course = courseCode;


    // Scraper automatisch nach Login starten (non-blocking)

    scrapeDhbwApp({
        sessionCourse: courseCode,
        outputDir: path.join(__dirname, 'data/timetables')
    }).then(result => {
        console.log('Scraping nach Login abgeschlossen:', result.kurs);
    }).catch(err => {
        console.error('Scraping nach Login fehlgeschlagen:', err.message);
    });

    scrapeSeezeitAll().then(() => {
    console.log('Mensa-Update nach Login erfolgreich');
        }).catch(err => {
    console.error('Mensa-Update nach Login fehlgeschlagen:', err.message);  
    });

    return res.json({ success: true, redirect: '/dashboard' });
});

app.get('/api/session', (req, res) => {
    if (!req.session.authenticated) {
        return res.status(401).json({ authenticated: false });
    }

    res.json({
        authenticated: true,
        username: req.session.username,
        role: req.session.role,
        faculty: req.session.faculty,
        course: req.session.course
    });
});

app.get('/api/documents', requireLogin, (req, res) => {
    try {
        const metadataPath = path.join(__dirname, 'data', 'dokumente_metadata.json');
        const documentsRoot = path.join(__dirname, 'data', 'documents');

        const metadata = fs.existsSync(metadataPath)
            ? JSON.parse(fs.readFileSync(metadataPath, 'utf8'))
            : { documents: [] };

        const metadataDocuments = Array.isArray(metadata.documents) ? metadata.documents : [];
        const metadataByPath = new Map(
            metadataDocuments.map(doc => [normalizeLocalPath(doc.local_path), doc])
        );

        const filePaths = fs.existsSync(documentsRoot) ? walkFiles(documentsRoot) : [];

        const documents = filePaths.map(filePath => {
            const relativeFromDocumentsRoot = normalizeLocalPath(path.relative(documentsRoot, filePath));
            const localPath = normalizeLocalPath(path.join('documents', relativeFromDocumentsRoot));
            const matchingMetadata = metadataByPath.get(localPath);
            const categoryFromPath = normalizeLocalPath(path.dirname(relativeFromDocumentsRoot));

            return {
                category: matchingMetadata?.category || (categoryFromPath === '.' ? 'Allgemein' : categoryFromPath),
                filename: matchingMetadata?.filename || path.basename(filePath),
                title: matchingMetadata?.title || path.basename(filePath),
                description: matchingMetadata?.description || '',
                local_path: matchingMetadata?.local_path || localPath
            };
        });

        res.json({
            documents,
            total: documents.length,
            metadata_total: metadataDocuments.length
        });
    } catch (error) {
        console.error('Fehler beim Erstellen der Dokumentliste:', error);
        res.status(500).json({
            error: 'documents-load-failed',
            message: 'Dokumentliste konnte nicht erstellt werden.'
        });
    }
});

app.get('/auth/logout', (req, res) => {
    req.session.destroy(() => {
        res.redirect('/auth/login?success=logout');
    });
});

// Dashboard
app.get('/dashboard', requireLogin, async (req, res) => {
    const currentUser = getCurrentUserFromSession(req);
    
    // Fakultätsadresse basierend auf der Auswahl
    const facultyInfo = {
        'FN': {
            name: 'Technische Fakultät',
            address: 'Fallenbrunnen 2, 88045 Friedrichshafen'
        },
        'RV': {
            name: 'Wirtschaftliche Fakultät',
            address: 'Marienplatz 2, 88212 Ravensburg'
        }
    };
    
    const faculty = facultyInfo[currentUser?.faculty] || null;
    
    res.render('dashboard.html', {
        currentUser,
        isPartner: currentUser?.role === 'partner',
        faculty
    });
});

// Debug session page
app.get('/debug-session', requireLogin, async (req, res) => {
    if (req.query.action === 'clear_session') {
        req.session.destroy(() => {
            res.redirect('/debug-session');
        });
        return;
    }
    res.render('debug-session.html', {
        sessionData: req.session
    });
});

// Static fallback for html files
app.get('/dashboard.html', (req, res) => res.redirect('/dashboard'));

app.get('/auth/:page.html', (req, res, next) => {
    res.redirect(`/auth/${req.params.page}`);
});

app.get('/kacheln/dummy.html', (req, res) => {
    res.render('kacheln/dummy.html');
});

app.get('/kacheln/student.html', requireLogin, (req, res) => {
    res.render('kacheln/student.html');
});

app.get('/kacheln/partner.html', requireLogin, (req, res) => {
    res.render('kacheln/partner.html');
});

app.get('/kacheln/timetable.html', requireLogin, (req, res) => {
    res.render('kacheln/timetable.html');
});

app.get('/kacheln/mensa.html', requireLogin, (req, res) => {
    res.render('kacheln/mensa.html');
});

app.get('/kacheln/documents.html', requireLogin, (req, res) => {
    res.render('kacheln/documents.html');
});

app.get('/scrape-dhbw', requireLogin, async (req, res) => {
    try {
        console.log("/scrape-dhbw aufgerufen", {
            query: req.query,
            sessionCourse: req.session?.course,
            user: req.session?.username
        });
        const sessionCourse = (req.query?.course || req.session?.course || '').trim();
        if (!sessionCourse) {
            return res.status(400).json({
                success: false,
                error: 'course-missing',
                message: 'Kein Kurs vorhanden. SessionStorage ist im Server nicht verfügbar. Übergib den Kurs aus dem Browser (Query) oder nutze die Session.'
            });
        }
        await scrapeDhbwApp({
            sessionCourse,
            outputDir: path.join(__dirname, 'data/timetables')
        });
        res.json({ success: true, message: 'Scraping completed' });
    } catch (err) {
        console.error('Scraping error:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});
app.get('/scrape-mensa', requireLogin, async (req, res) => {
    try {
        console.log("Manueller Mensa-Scrape gestartet durch User:", req.session?.username);
        
        // Führt den Scraper für alle Standorte (FN & RV) aus
        const daten = await scrapeSeezeitAll();
        
        res.json({ 
            success: true, 
            message: 'Mensa-Pläne für Friedrichshafen und Ravensburg wurden aktualisiert!',
            data: daten 
        });
    } catch (err) {
        console.error('Mensa Scraping Fehler:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server läuft auf Port ${PORT}`);
});
