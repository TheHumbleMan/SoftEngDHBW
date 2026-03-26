document.body.innerHTML += '<div style="position:fixed;top:0;left:0;background:red;color:white;z-index:9999;padding:10px;">SCRIPT IST AKTIV!</div>';
const JSON_URL = '/data/kontakte/kontakte.json';

async function loadContacts() {
    const statusText = document.getElementById('status-text');
    const loadingArea = document.getElementById('loading-area');
    const container = document.getElementById('contact-container');

    try {
        const response = await fetch(JSON_URL);
        
        if (!response.ok) {
            throw new Error(`Datei nicht gefunden (Status ${response.status}). Läuft der Scraper schon?`);
        }

        const data = await response.json();

        if (!data || data.length === 0) {
            statusText.innerHTML = "Die Liste ist noch leer. Starte bitte zuerst den Scraper!";
            return;
        }

        renderCards(data);
        
        // Erfolg: Loader verstecken, Container zeigen
        loadingArea.classList.add('hidden');
        container.classList.remove('hidden');

    } catch (error) {
        statusText.innerHTML = "<b>FEHLER:</b> " + error.message;
        console.error("Fetch-Fehler:", error);
    }
}

function renderCards(data) {
    const container = document.getElementById('contact-container');
    container.innerHTML = '';
    
    data.forEach(p => {
        // Nur anzeigen, wenn mindestens ein Name oder eine Mail vorhanden ist
        if(!p.name && !p.email) return; 
        
        const cardHTML = `
            <div class="card">
                <div class="p-3">
                    <div class="name">${p.name || 'Mitarbeiter/in'}</div>
                    <div class="info"><b>Funktion:</b> ${p.funktion || '-'}</div>
                    <div class="info"><b>Tel:</b> ${p.telefon || 'Keine Angabe'}</div>
                    <div class="info"><b>Email:</b> <a href="mailto:${p.email}">${p.email || '-'}</a></div>
                    <div class="info"><b>Raum:</b> ${p.adresse || '-'}</div>
                </div>
            </div>
        `;
        container.insertAdjacentHTML('beforeend', cardHTML);
    });
}

// Start der App
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', loadContacts);
} else {
    loadContacts();
}