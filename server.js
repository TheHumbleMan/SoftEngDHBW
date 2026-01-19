import express from 'express';
import session from 'express-session';
import path from 'path';
import { fileURLToPath } from 'url';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Basic paths
const VIEWS_ROOT = __dirname; // We keep view files alongside original structure
const SESSION_TIMEOUT_SECONDS = Number(process.env.SESSION_TIMEOUT_SECONDS || 3600);

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
app.use('/logs', express.static(path.join(__dirname, 'logs')));
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

function requireAdmin(req, res, next) {
    if (!req.session.authenticated || req.session.role !== 'admin') {
        return res.redirect('/auth/login?error=access');
    }
    next();
}

function getCurrentUserFromSession(req) {
    if (!req.session.authenticated) return null;
    return {
        id: req.session.userId,
        username: req.session.username,
        role: req.session.role
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
        success: req.query.success
    });
});

app.post('/auth/login', async (req, res) => {
    const roleInput = (req.body.role || '').toLowerCase();
    const allowedRoles = ['student', 'partner'];
    if (!roleInput) {
        return res.redirect('/auth/login?error=required');
    }
    if (!allowedRoles.includes(roleInput)) {
        return res.redirect('/auth/login?error=invalid');
    }

    const friendlyName = roleInput === 'partner' ? 'Dualer Partner' : 'Student';
    const mappedRole = roleInput === 'partner' ? 'admin' : 'user';

    req.session.authenticated = true;
    req.session.userId = roleInput; // simple identifier for this lightweight flow
    req.session.username = friendlyName;
    req.session.role = mappedRole;
    req.session.loginTime = Date.now();
    req.session.sessionTimeout = SESSION_TIMEOUT_SECONDS;

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
    res.render('dashboard.html', {
        currentUser,
        isAdmin: currentUser?.role === 'admin'
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

// User management
// Benutzerverwaltungs-Routen entfernt, da keine Benutzer-Persistenz mehr genutzt wird.

// Pi-hole admin convenience redirect
app.get(['/admin', '/admin/index.lp', '/admin/index.php'], requireAdmin, (req, res) => {
    // Default with trailing slash to avoid nginx 404s on relative assets
    const target = process.env.PIHOLE_URL || 'http://127.0.0.1/admin/';
    res.redirect(target);
});

// Static fallback for html files
app.get('/dashboard.html', (req, res) => res.redirect('/dashboard'));
app.get('/management/:page.html', (req, res, next) => {
    const target = `/management/${req.params.page}`;
    res.redirect(target);
});
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
