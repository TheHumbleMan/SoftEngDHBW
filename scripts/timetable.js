//Globale Variablen
let selectedMonday;
let lastMonday;
let nextMonday;
let allDays = [];

//Zuordnung Wochentag zu Tageskürzel
const dayMap= {
    "Montag": "mon",
    "Dienstag": "tue",
    "Mittwoch": "wed",
    "Donnerstag": "thu",
    "Freitag": "fri"
};

//Die Buttons müssen nach dem auswählen einer anderen kachel und wieder zurückkommen neu gemacht werden
function bindWeekButtons() {
const nextWeekButton = document.getElementById("nextButton");
const backWeekButton = document.getElementById("backButton");
nextWeekButton.addEventListener("click", () => {
    showNextWeek();
});
backWeekButton.addEventListener("click", () => {
    showPreviousWeek();
});
}

//Umrechnen der Zeit in Minuten für einfache Stundenplan Logik
function timeToMinutes(timeStr) {
    const [hours, minutes] = timeStr.split('.').map(Number);
    return hours * 100 + minutes;
}

//Setzt einen Termin eines Tages in den Stundenplan
function placeAppointment(dayKey, appointment) {
    const startMin = timeToMinutes(appointment.startTime);
    const endMin   = timeToMinutes(appointment.endTime);
    const cells = [...document.querySelectorAll(`td[data-day="${dayKey}"]`)]
    .filter(td => td.dataset.time);

    const slots = cells.filter(td => {
    const m = timeToMinutes(td.dataset.time);
    return m >= startMin && m < endMin;
    });

    if (slots.length === 0) return;

    const first = slots[0];
    first.textContent = appointment.name;
    first.classList.add("course");
    first.rowSpan = slots.length;

    if (appointment.location) {
    first.title = appointment.location;
    }

    slots.slice(1).forEach(td => td.remove());

    console.log(`\n\n`)
}

//Berechnet das Datums des Montags der aktuellen Woche
function getCurrentMonday(){
    const today = new Date();
    const day = today.getDay();
    const diff = today.getDate() - day + (day === 0 ? -6 : 1);
    const monday = new Date(today.setDate(diff));
    return monday;
}

//Addition/Subtraktion von Wochen auf/von einem Datum
function addWeeks(date, weeks) {
    const d = new Date(date);
    d.setDate(d.getDate() + weeks * 7);
    return d;
}

//Addition von Tagen auf/von einem Datum
function addDays(date, days) {
    const d = new Date(date);
    d.setDate(d.getDate() + days);
    return d;
}

//Logik für wenn man die Nächste Woche anzeigen will
function showNextWeek(){
    lastMonday = new Date(selectedMonday);
    selectedMonday = new Date(nextMonday);
    nextMonday = addWeeks(selectedMonday, 1);
    renderSelectedWeek();
}

//Logik für wenn man die letzte Woche anzeigen will (weiter zurück als die aktuelle Woche geht nicht)
function showPreviousWeek(){
    nextMonday = new Date(selectedMonday);
    selectedMonday = new Date(lastMonday);
    lastMonday = addWeeks(selectedMonday, -1);
    if (lastMonday < getCurrentMonday()){
        lastMonday = new Date(selectedMonday);
    }
    renderSelectedWeek();
}

//Erstellt die Basis HTML Struktur des Stundenplans für eine Woche
function createEmptyTimetableHTML() {
    const days = [
        { label: "Montag", key: "mon" },
        { label: "Dienstag", key: "tue" },
        { label: "Mittwoch", key: "wed" },
        { label: "Donnerstag", key: "thu" },
        { label: "Freitag", key: "fri" }
    ];

    const startHour = 8;
    const endHour = 19;
    const stepMinutes = 15; // 15-Minuten-Slots
    const slotsPerHour = 60 / stepMinutes;

    let html = `<table ><thead><tr><th>Zeit</th>`;

    //Schreibt die Tag und Datum in die Spaltenbeschriftungen
    let dateIterator = new Date(selectedMonday);
    days.forEach(d => {
        html += `<th id="${d.key}-Head"> ${d.label} <br> ${dateIterator.getDate()}.${dateIterator.getMonth() + 1}. </th>`;
        dateIterator.setDate(dateIterator.getDate() + 1);
    });
    html += `</tr></thead><tbody>`;

    //Konkrete Zeiten und Zellen
    for (let hour = startHour; hour < endHour; hour++) {
        for (let slot = 0; slot < slotsPerHour; slot++) {
            const min = slot * stepMinutes;
            const displayTime = `${String(hour).padStart(2,"0")}.${String(min).padStart(2,"0")}`;
            html += `<tr>`;

            // Zeit-Zelle nur beim ersten Slot jeder Stunde
            if (slot === 0) {
                const nextHour = hour + 1;
                html += `<td class="time" rowspan="${slotsPerHour}">
                            ${String(hour).padStart(2,"0")}:00 - ${String(nextHour).padStart(2,"0")}:00
                        </td>`;
            }

            // Tages-Zellen
            days.forEach(d => {
                html += `<td data-day="${d.key}" data-time="${displayTime}"></td>`;
            });
            html += `</tr>`;
        }
    }
    html += `</tbody></table>`;
    return html;
}

//Hilfsfunktion um nach bestimmtem Datum suchen zu können
function formatDate(date) {
    const d = String(date.getDate()).padStart(2, "0");
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const y = date.getFullYear();
    return `${d}.${m}.${y}`;
}

//Holt alle Stundenplandaten aus der JSON Datei
function fetchTimetableData(course) {
    let dayArray = [];
    return fetch(`data/timetables/${course}.json`)
    .then(r => r.json())
    .then(days => {
        dayArray = days;
        console.log("Fetched timetable data:", dayArray);
        return dayArray;
    })
    .catch(err => {
        console.error("Fehler beim Laden der Stundenplandaten:", err);
        return [];
    });
}

//Sucht aus allesn Tagen den Tag mit dem gesuchten Datum heraus
function findDayData(allDays, targetDate) {
    const formattedDate = formatDate(targetDate);
    return allDays.find(d => d.date === formattedDate.trim());
}

//Initialisierung der Datumsvariablen und Binden der Buttons
export function initDates() {
    const currentMonday = getCurrentMonday();
    selectedMonday = new Date(currentMonday);
    lastMonday = new Date(currentMonday);
    nextMonday = addWeeks(selectedMonday, 1);
    bindWeekButtons()

    console.log("Initialisiere Datums");
}

export async function renderSelectedWeek() {
    const timetableContainer = document.getElementById("timetable-container");
    timetableContainer.innerHTML = createEmptyTimetableHTML();
    console.log("Rendere Stundenplan");
    
    //Alle Tage aus der JSON in Variable speichern
    allDays = await fetchTimetableData("FN-TIT24");
    
    //Spezifische Tage der ausgesuchten Woche finden
    const monday = findDayData(allDays, selectedMonday);
    const tuesday = findDayData(allDays, addDays(selectedMonday, 1));
    const wednesday = findDayData(allDays, addDays(selectedMonday, 2));
    const thursday = findDayData(allDays, addDays(selectedMonday, 3));
    const friday = findDayData(allDays, addDays(selectedMonday, 4));

    //Termine der spezifischen Tage in den Stundenplan setzen
    if (monday) {
        monday.appointments.forEach(app => placeAppointment("mon", app));
    }
    if (tuesday) {
        tuesday.appointments.forEach(app => placeAppointment("tue", app));
    }
    if (wednesday) {
        wednesday.appointments.forEach(app => placeAppointment("wed", app));
    }
    if (thursday) {
        thursday.appointments.forEach(app => placeAppointment("thu", app));
    }
    if (friday) {
        friday.appointments.forEach(app => placeAppointment("fri", app));
    }

    console.log("Stundenplan gerendert für Woche ab:", formatDate(selectedMonday));
}