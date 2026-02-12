/**
 * OPNV Module v2.0 - High Fidelity Integration
 */

const CAMPUS_DATA = {
    ADRESSE: "Friedrichshafen, Hochschulen",
    POPUP: "width=1000,height=850,top=50,left=100,scrollbars=yes"
};

const getRoute = (start, ziel) => {
    if (!start?.trim()) return alert("Bitte Adresse eingeben.");

    /**
     * KONZEPTIONELLER KERN:
     * Wir entfernen alle Zeit-Parameter.
     * Das "!4m2!4m1!3e3" ist der "Anker", der Google zwingt, 
     * immer im ÖPNV-Tab zu starten.
     */
    const url = `https://www.google.de/maps/dir/${encodeURIComponent(start)}/${encodeURIComponent(ziel)}/data=!4m2!4m1!3e3`;

    window.open(url, 'RoutePopup', CAMPUS_DATA.POPUP);
};

// Event-Delegation
document.addEventListener("click", (e) => {
    const btn = e.target.closest('button');
    if (!btn) return;

    const address = document.getElementById("userAddress")?.value;

    if (btn.id === "btnToCampus") getRoute(address, CAMPUS_DATA.ADRESSE);
    if (btn.id === "btnFromCampus") getRoute(CAMPUS_DATA.ADRESSE, address);
});

// Initialisierung: Setze heutiges Datum und aktuelle Uhrzeit als Default
document.addEventListener("DOMContentLoaded", () => {
    // Da das Widget nachgeladen wird, prüfen wir regelmäßig oder per Observer
    const initFields = () => {
        const d = document.getElementById("routeDate");
        const t = document.getElementById("routeTime");
        if(d && !d.value) d.value = new Date().toISOString().split('T')[0];
        if(t && !t.value) t.value = new Date().toLocaleTimeString('de-DE', {hour: '2-digit', minute:'2-digit'});
    };

    // Wir triggern die Initialisierung beim Klick ins Dokument oder nach Dashboard-Load
    setTimeout(initFields, 1000); 
});