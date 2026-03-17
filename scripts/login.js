// login.js

// State
export function createCourseStore() {
    return { FN: [], RV: [] };
}

// --- API ---
export async function loadCourses(store, fetchFn = fetch) {
    try {
        const [fnResponse, rvResponse] = await Promise.all([
            fetchFn('/data/kurse_fn.json'),
            fetchFn('/data/kurse_rv.json')
        ]);

        const fnData = await fnResponse.json();
        const rvData = await rvResponse.json();

        store.FN = fnData.courses || [];
        store.RV = rvData.courses || [];
    } catch (error) {
        console.error('Fehler beim Laden der Kursdaten:', error);
    }
}

// --- UI ---
export function showMessage(doc, message, type = 'error') {
    const container = doc.getElementById('messageContainer');
    container.innerHTML = `<div class="${type}-message">${message}</div>`;
}

export function clearMessage(doc) {
    doc.getElementById('messageContainer').innerHTML = '';
}

export function selectRole(doc, store, role) {
    clearMessage(doc);

    doc.getElementById('roleInput').value = role;
    doc.getElementById('roleSelectionStep').style.display = 'none';
    doc.getElementById('courseSelectionStep').style.display = 'block';

    const courseSelect = doc.getElementById('courseSelect');
    courseSelect.innerHTML = '<option value="">-- Kurs auswählen --</option>';

    // FN
    const fnOptgroup = doc.createElement('optgroup');
    fnOptgroup.label = 'Technische Fakultät Friedrichshafen';

    store.FN.forEach(course => {
        const option = doc.createElement('option');
        option.value = 'FN-' + course;
        option.textContent = course;
        fnOptgroup.appendChild(option);
    });

    courseSelect.appendChild(fnOptgroup);

    // RV
    const rvOptgroup = doc.createElement('optgroup');
    rvOptgroup.label = 'Wirtschaftliche Fakultät Ravensburg';

    store.RV.forEach(course => {
        const option = doc.createElement('option');
        option.value = 'RV-' + course;
        option.textContent = course;
        rvOptgroup.appendChild(option);
    });

    courseSelect.appendChild(rvOptgroup);
}

export function backToRole(doc) {
    clearMessage(doc);

    doc.getElementById('roleInput').value = '';
    doc.getElementById('courseSelect').value = '';
    doc.getElementById('courseSelectionStep').style.display = 'none';
    doc.getElementById('roleSelectionStep').style.display = 'block';
}

// --- Login Logic ---
export async function handleLoginSubmit({
    event,
    doc,
    fetchFn = fetch,
    showMessageFn = showMessage,
    locationObj = window.location
}) {
    event.preventDefault();

    const course = doc.getElementById('courseSelect').value;
    const role = doc.getElementById('roleInput').value;

    if (!course) {
        showMessageFn(doc, 'Bitte wählen Sie einen Kurs aus.');
        return;
    }

    const submitBtn = event.target.querySelector('button[type="submit"]');
    const originalText = submitBtn.textContent;

    submitBtn.disabled = true;
    submitBtn.textContent = 'Anmeldung läuft...';

    try {
        const response = await fetchFn('/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ role, course })
        });

        const data = await response.json();

        if (data.success) {
            locationObj.href = data.redirect;
        } else {
            showMessageFn(doc, data.message || 'Ein Fehler ist aufgetreten.');
            submitBtn.disabled = false;
            submitBtn.textContent = originalText;
        }
    } catch (error) {
        console.error('Login-Fehler:', error);
        showMessageFn(doc, 'Netzwerkfehler. Bitte versuchen Sie es erneut.');
        submitBtn.disabled = false;
        submitBtn.textContent = originalText;
    }
}

// --- Init (nur für Browser) ---
export function initLogin({
    doc = document,
    fetchFn = fetch,
    locationObj = window.location
} = {}) {
    const store = createCourseStore();

    // Form Listener
    const form = doc.getElementById('loginForm');
    if (form) {
        form.addEventListener('submit', (e) =>
            handleLoginSubmit({
                event: e,
                doc,
                fetchFn,
                locationObj
            })
        );
    }

    // On Load
    doc.addEventListener('DOMContentLoaded', async () => {
        await loadCourses(store, fetchFn);

        const params = new URLSearchParams(locationObj.search);
        const error = params.get('error');
        const success = params.get('success');

        if (success === 'logout') {
            showMessage(doc, 'Sie wurden erfolgreich abgemeldet.', 'success');
        } else if (error) {
            const errorMessages = {
                'required': 'Bitte wählen Sie Student oder Dualer Partner.',
                'invalid': 'Die ausgewählte Rolle ist ungültig.',
                'course-required': 'Bitte wählen Sie einen Kurs aus.',
                'session': 'Ihre Sitzung ist abgelaufen. Bitte melden Sie sich erneut an.',
                'access': 'Sie haben keine Berechtigung für diese Seite.'
            };

            showMessage(doc, errorMessages[error] || 'Ein Fehler ist aufgetreten.');
        }
    });

    return store;
}

const store = initLogin();

window.selectRole = (role) => selectRole(document, store, role);
window.backToRole = () => backToRole(document);