/**
 * OPNV Module v3.0 - bwegt / EFA-BW Integration (Bodensee-Region)
 */

const CAMPUS_DATA = {
    // bwegt versteht "Fallenbrunnen, Friedrichshafen" besser als komplexe Campus-Namen
    ADRESSE: "Friedrichshafen, Hochschulen", 
    POPUP: "width=1000,height=850,top=50,left=100,scrollbars=yes"
};

const getRoute = (startInput, zielInput) => {
    if (!startInput?.trim()) return alert("Bitte Adresse eingeben.");

    // 1. Inputs reinigen & Defaults setzen
    let origin = startInput.trim();
    let destination = zielInput;

    // 2. Datum & Zeit holen
    const dateInput = document.getElementById("routeDate")?.value; // YYYY-MM-DD
    const timeInput = document.getElementById("routeTime")?.value; // HH:MM

    // 3. Den Link bauen
    // Wir nutzen hier direkt die EFA-Schnittstelle von bwegt.
    // Diese akzeptiert TEXT (name_origin) statt IDs.
    let url = "https://www.efa-bw.de/nvbw/XSLT_TRIP_REQUEST2";
    
    // Parameter anhängen
    url += "?language=de";
    url += "&command=trip"; // WICHTIG: Erzwingt die Berechnung
    url += "&trip=multiModalitySelected=pt"; // Nur Öffis

    // Start (Text statt ID)
    url += `&name_origin=${encodeURIComponent(origin)}`;
    url += `&type_origin=any`; // any = Adresse oder Haltestelle

    // Ziel (Text statt ID)
    url += `&name_destination=${encodeURIComponent(destination)}`;
    url += `&type_destination=any`;

    // Zeit
    if (dateInput && timeInput) {
        // bwegt will YYYYMMDD und HHMM
        const dateStr = dateInput.replace(/-/g, "");
        const timeStr = timeInput.replace(":", "");
        url += `&itdDate=${dateStr}&itdTime=${timeStr}`;
    }
    // ob anfahrt oder abfahrt, abfahrt ist standard
    const mode = document.getElementById("routeMode")?.value || "dep";
    url += `&itdTripDateTimeDepArr=${mode}`;

    window.open(url, 'RoutePopup', "width=1000,height=850");
};

// --- Event Listener (bleiben gleich) ---
document.addEventListener("click", (e) => {
    const btn = e.target.closest('button');
    if (!btn) return;

    const address = document.getElementById("userAddress")?.value;

    if (btn.id === "btnToCampus") getRoute(address, CAMPUS_DATA.ADRESSE);
    if (btn.id === "btnFromCampus") getRoute(CAMPUS_DATA.ADRESSE, address);
});

// --- Initialisierung (bleibt gleich) ---
document.addEventListener("DOMContentLoaded", () => {
    setTimeout(() => {
        const d = document.getElementById("routeDate");
        const t = document.getElementById("routeTime");
        // Setze Standardwerte nur wenn leer
        if(d && !d.value) d.value = new Date().toISOString().split('T')[0];
        if(t && !t.value) t.value = new Date().toLocaleTimeString('de-DE', {hour: '2-digit', minute:'2-digit'});
    }, 500); 
});