//Globale Variablen
let selectedMonday;
let lastMonday;
let nextMonday;
let allDays = [];
const startHour = 8;
const endHour = 19;
const stepMinutes = 15;
const slotsPerHour = 60 / stepMinutes;

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

//Lädt die Kursinformation aus der Session API
async function loadCourse() {
    const res = await fetch('/api/session');
    if (!res.ok) return null; // Fehler oder nicht eingeloggt

    const session = await res.json();

    if (!session.authenticated || !session.course) {
        return null;
    }

    return `${session.faculty}-${session.course}` //FN-TIT24
}

//Umrechnen der Zeit in Minuten für einfache Stundenplan Logik
function timeToMinutes(timeStr) {
    const [hours, minutes] = timeStr.split('.').map(Number);
    return hours * 60 + minutes;
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
async function showNextWeek(){
    lastMonday = new Date(selectedMonday);
    selectedMonday = new Date(nextMonday);
    nextMonday = addWeeks(selectedMonday, 1);
    renderSelectedWeek(await loadCourse());
}

//Logik für wenn man die letzte Woche anzeigen will (weiter zurück als die aktuelle Woche geht nicht)
async function showPreviousWeek(){
    nextMonday = new Date(selectedMonday);
    selectedMonday = new Date(lastMonday);
    lastMonday = addWeeks(selectedMonday, -1);
    if (lastMonday < getCurrentMonday()){
        lastMonday = new Date(selectedMonday);
    }
    renderSelectedWeek(await loadCourse());
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
                html += `<td data-day="${d.key}" data-time="${displayTime}" class="timetableCell">
                <div class="innerTimetableCell"></div>
                </td>`;
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
}

export async function renderSelectedWeek(course) {
    const timetableContainer = document.getElementById("timetable-container");
    timetableContainer.innerHTML = createEmptyTimetableHTML();
    
    //Alle Tage aus der JSON in Variable speichern
    allDays = await fetchTimetableData(course);
    if (allDays.length !== 0){
        //Spezifische Tage der ausgesuchten Woche finden
        const monday = findDayData(allDays, selectedMonday);
        const tuesday = findDayData(allDays, addDays(selectedMonday, 1));
        const wednesday = findDayData(allDays, addDays(selectedMonday, 2));
        const thursday = findDayData(allDays, addDays(selectedMonday, 3));
        const friday = findDayData(allDays, addDays(selectedMonday, 4));

        //Termine der spezifischen Tage in den Stundenplan setzen
        if (monday) {renderDayAppointments("mon", monday.appointments);}

        if (tuesday) {renderDayAppointments("tue", tuesday.appointments);}

        if (wednesday) {renderDayAppointments("wed", wednesday.appointments);}

        if (thursday) {renderDayAppointments("thu", thursday.appointments);}

        if (friday) {renderDayAppointments("fri", friday.appointments);}

    } else{
        timetableContainer.innerHTML = "ein spannender inhalt";
    }
}

//---------------------------Sandbox----------------------------------------------------------

function timeToQuarterIndex(timeStr) {
    const [hours, minutes] = timeStr.split(".").map(Number);
    let trueHours = hours - startHour;
    return trueHours * 4 + Math.floor(minutes / 15);
}

function maxSimultaneousOverlaps(target, appointments) {
    const slots = {};

    const start = timeToMinutes(target.startTime);
    const end   = timeToMinutes(target.endTime);

    for (const app of appointments) {
        const s = timeToMinutes(app.startTime);
        const e = timeToMinutes(app.endTime);

        if (app === target) continue;
        if (!(start < e && end > s)) continue;

        const from = Math.max(start, s);
        const to   = Math.min(end, e);

        for (let t = from; t < to; t += 15) {
            slots[t] = (slots[t] || 0) + 1;
        }
    }

    return Math.max(0, ...Object.values(slots)) + 1;
}

function renderDayAppointments(dayKey, appointments){
    appointments.forEach(app => {
        const columns = maxSimultaneousOverlaps(app, appointments);

        if (columns === 1) renderSingle(dayKey, app);
        if (columns === 2) renderDouble(dayKey, app);
        if (columns >= 3) renderTriple(dayKey, app);
    });
}

function renderSingle(dayKey, app){
    const timetableCell = document.querySelector(`td.timetableCell[data-day="${dayKey}"][data-time="${app.startTime}"]`);
    const innerTimetableCell = timetableCell.querySelector('.innerTimetableCell');
    const cellHeight = timetableCell.offsetHeight;
    const appointmentSlots = (timeToMinutes(app.endTime)-timeToMinutes(app.startTime))/15; //Endzeit-Startzeit

    innerTimetableCell.innerHTML = `<div class="singleApp" style="height: ${appointmentSlots * cellHeight}px;">${app.name}\n\n ${app.location}</div>`;
}

function renderDouble(dayKey, app){
    console.log("Starte renderDouble für Termin: " + app.name);
    const timetableCells = Array.from(document.querySelectorAll(`td.timetableCell[data-day='${dayKey}']`));
    const timetableCell = document.querySelector(`td.timetableCell[data-day="${dayKey}"][data-time="${app.startTime}"]`);

    const innerTimetableCell = timetableCell.querySelector('.innerTimetableCell');
    const cellHeight = timetableCell.offsetHeight;
    const appointmentSlots = (timeToMinutes(app.endTime)-timeToMinutes(app.startTime))/15;
    let column = 2;
    let leftOffset = 52; // abstand nach links in prozent
    const appStartSlot = timeToQuarterIndex(app.startTime);

    for (let i = -1; i < appStartSlot; i++) {
        //Fake-Slot um gleichzeitiges starten von mehreren terminen abzudecken
        if(i === -1){
            const firstCell = timetableCells[appStartSlot].querySelector('.innerTimetableCell');
            const firstRunningApp = firstCell.querySelector('.doubleApp');
            if (firstRunningApp) {
                // Falls Termin mit gleich wie anderer Startet
                leftOffset = 3;
                column = 1;
            }
        continue; // weiter zu den normalen Slots
        }else{
            const currentCell = timetableCells[i].querySelector('.innerTimetableCell');
            const runningApp = currentCell.querySelector('.doubleApp');
            if (!runningApp) continue;
            const usedColumn = Number(runningApp.dataset.column);
            if (usedColumn === 2){
                const slots = Number(runningApp.dataset.slots);
                const runningAppEndSlot = i + slots;

                if (runningAppEndSlot > appStartSlot) { //Check ob schon laufender Termin schon vorbei ist, sonst in den linken slot
                    leftOffset = 3;
                    column = 1;
                    break;
                }
            }
        }
    }

    innerTimetableCell.innerHTML +=`<div class="doubleApp" style="height: ${appointmentSlots * cellHeight}px; left: ${leftOffset}%">${app.name}\n\n ${app.location}</div>`;
    const allDoubleApps = innerTimetableCell.querySelectorAll(".doubleApp");
    const doubleAPP = Array.from(allDoubleApps).find(app => {
        // liest den linken Abstand aus dem Inline-Style
        const leftValue = parseFloat(app.style.left); // z.B. 3 aus "3%"
        return leftValue === leftOffset; // match mit deinem Offset
    });
    doubleAPP.dataset.slots = appointmentSlots;
    doubleAPP.dataset.column = column;
}

function renderTriple(dayKey, app) {
    const timetableCells = Array.from(document.querySelectorAll(`td.timetableCell[data-day="${dayKey}"]`));
    const timetableCell = document.querySelector(`td.timetableCell[data-day="${dayKey}"][data-time="${app.startTime}"]`);
    const innerTimetableCell = timetableCell.querySelector('.innerTimetableCell');
    const cellHeight = timetableCell.offsetHeight;
    const appointmentSlots = (timeToMinutes(app.endTime) - timeToMinutes(app.startTime)) / 15;
    const appStartSlot = timeToQuarterIndex(app.startTime);

    // Spalten: 0 = links, 1 = mitte, 2 = rechts
    const columnLeftOffsets = [3, 35, 67];
    const columnOccupied = [false, false, false];

    //Laufende termine
    for (let i = 0; i < appStartSlot; i++) {
        const currentCell = timetableCells[i].querySelector('.innerTimetableCell');
        const runningApps = currentCell.querySelectorAll('.tripleApp');

        runningApps.forEach(runningApp => {
            const slots = Number(runningApp.dataset.slots);
            const runningEndSlot = i + slots;
            if (runningEndSlot > appStartSlot) {
                const col = Number(runningApp.dataset.column);
                columnOccupied[col] = true;
            }
        });
    }

    //Freie Spalte suchen
    const columnIndex = columnOccupied.lastIndexOf(false);
    if (columnIndex === -1) {
        //console.warn("   Keine freie Spalte gefunden!");
        return;
    }

    //Rendern des Termins
    const leftOffset = columnLeftOffsets[columnIndex];
    innerTimetableCell.innerHTML += `<div class="tripleApp" style="height: ${appointmentSlots * cellHeight}px; left: ${leftOffset}%"> ${app.name}<br>${app.location} </div>`;
    const tripleApp = innerTimetableCell.querySelector('.tripleApp:last-child');
    tripleApp.dataset.slots = appointmentSlots;
    tripleApp.dataset.column = columnIndex;
}