import express from 'express';
import session from 'express-session';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
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

// Static files - Favicon must be BEFORE other routes to ensure /favicon.ico is served
app.use(express.static(path.join(__dirname, 'favicon')));
app.use('/assets', express.static(path.join(__dirname, 'assets')));
app.use('/scripts', express.static(path.join(__dirname, 'scripts')));
app.use('/favicon', express.static(path.join(__dirname, 'favicon')));

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
        success: req.query.success,
        fnCourses,
        rvCourses
    });
});

app.post('/auth/login', async (req, res) => {
    const roleInput = (req.body.role || '').toLowerCase();
    const course = (req.body.course || '').trim();
    
    const allowedRoles = ['student', 'partner'];
    if (!roleInput) {
        return res.redirect('/auth/login?error=required');
    }
    if (!allowedRoles.includes(roleInput)) {
        return res.redirect('/auth/login?error=invalid');
    }
    
    // Kursauswahl validieren
    if (!course) {
        return res.redirect('/auth/login?error=course-required');
    }
    
    // Extrahiere Fakultät und Kurscode
    const [faculty, courseCode] = course.split('-');
    if (!['FN', 'RV'].includes(faculty)) {
        return res.redirect('/auth/login?error=invalid');
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

    return res.redirect('/dashboard');
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

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server läuft auf Port ${PORT}`);
});
