/**
 * OPNV Module v3.0 - bwegt / EFA-BW Integration
 */

const CAMPUS_DATA = {
    ADRESSE: "Friedrichshafen, Hochschulen",
    POPUP: "width=1000,height=850,top=50,left=100,scrollbars=yes"
};

// EXPORT hinzufügen, damit das Kachel-Skript diese Funktion aufrufen kann
export const initDateTimeFields = () => {
    const dInput = document.getElementById("routeDate");
    const tInput = document.getElementById("routeTime");

    if (!dInput || !tInput) return;

    // Lokales ISO-Format berechnen
    const now = new Date();
    const localISO = new Date(now - now.getTimezoneOffset() * 60000).toISOString();

    if (!dInput.value) dInput.value = localISO.slice(0, 10); // YYYY-MM-DD
    if (!tInput.value) tInput.value = localISO.slice(11, 16); // HH:mm
};

const getRoute = (startInput, zielInput) => {
    if (!startInput?.trim()) return alert("Bitte Adresse eingeben.");

    const origin = startInput.trim();
    const destination = zielInput;
    const dateInput = document.getElementById("routeDate")?.value; 
    const timeInput = document.getElementById("routeTime")?.value; 

    let url = "https://www.efa-bw.de/nvbw/XSLT_TRIP_REQUEST2?language=de&command=trip&trip=multiModalitySelected=pt";
    url += `&name_origin=${encodeURIComponent(origin)}&type_origin=any`;
    url += `&name_destination=${encodeURIComponent(destination)}&type_destination=any`;

    if (dateInput && timeInput) {
        const dateStr = dateInput.replace(/-/g, "");
        const timeStr = timeInput.replace(":", "");
        url += `&itdDate=${dateStr}&itdTime=${timeStr}`;
    }

    const mode = document.getElementById("routeMode")?.value || "dep";
    url += `&itdTripDateTimeDepArr=${mode}`;

    window.open(url, 'RoutePopup', CAMPUS_DATA.POPUP);
};

// Globaler Event-Listener (Event Delegation)
// Dieser funktioniert immer, auch wenn das HTML nachträglich eingefügt wird
document.addEventListener("click", (e) => {
    const btn = e.target.closest('button');
    if (!btn) return;

    const address = document.getElementById("userAddress")?.value;

    if (btn.id === "btnToCampus") getRoute(address, CAMPUS_DATA.ADRESSE);
    if (btn.id === "btnFromCampus") getRoute(CAMPUS_DATA.ADRESSE, address);
});