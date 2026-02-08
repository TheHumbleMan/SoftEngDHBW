//Globale Variablen
let selectedMonday;
let lastMonday;
let nextMonday;
let allDays = [];
const startHour = 8;
const endHour = 19;
const stepMinutes = 15;
const slotsPerHour = 60 / stepMinutes;
const quarterHours = [];



/*
//Zuordnung Wochentag zu Tageskürzel
const dayMap= {
    "Montag": "mon",
    "Dienstag": "tue",
    "Mittwoch": "wed",
    "Donnerstag": "thu",
    "Freitag": "fri"
};*/

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
/*
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
}*/

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

export async function renderSelectedWeek(course) {
    const timetableContainer = document.getElementById("timetable-container");
    timetableContainer.innerHTML = createEmptyTimetableHTML();
    console.log("Rendere Stundenplan");
    
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
        if (monday) {
            //monday.appointments.forEach(app => placeAppointment("mon", app));
            //overlapFinder(monday.appointments);
            //cellFormatter("mon");
            //appointmentAdder(monday.appointments, "mon");

            renderDayAppointments("mon", monday.appointments);
        }
        if (tuesday) {
            //tuesday.appointments.forEach(app => placeAppointment("tue", app));
            //overlapFinder(tuesday.appointments);
            //cellFormatter("tue");
            //appointmentAdder(tuesday.appointments, "tue");
        }
        if (wednesday) {
            //wednesday.appointments.forEach(app => placeAppointment("wed", app));
            //overlapFinder(wednesday.appointments);
        }
        if (thursday) {
            //thursday.appointments.forEach(app => placeAppointment("thu", app));
            //overlapFinder(thursday.appointments);
        }
        if (friday) {
            //friday.appointments.forEach(app => placeAppointment("fri", app));
            //overlapFinder(friday.appointments);
        }
        console.log("Stundenplan gerendert für Woche ab:", formatDate(selectedMonday));

    } else{
        timetableContainer.innerHTML = "ein spannender inhalt";
    }
}

//---------------------------Sandbox----------------------------------------------------------
/*
function timeToQuarterIndex(timeStr) {
    const [hours, minutes] = timeStr.split(".").map(Number);
    let trueHours = hours - startHour;
    return trueHours * 4 + Math.floor(minutes / 15);
}*/
/*
//Schreibt in quarterhours für jeden 15min Slot ob 1, 2 oder 3 termine gleichzeitig passieren
function overlapFinder(appointments){
    // erstellt das objekt indem pro viertelstunde die anzahl an parallelen terminen gespeichert wird
    // slots sind 0,2,3,4,5,6..., und stellen jeweils eine viertelstunde dar
    let minute = 0;
    for (let i = 0; i < (slotsPerHour*(endHour-startHour)); i++) {
        quarterHours[i] = 0;
    }
    //console.log("OverlapFinder: Viertelstundenarray erstellt: " + JSON.stringify(quarterHours));

    //schreibt für jeden slot rein wiveiele termine laufen
    const baseMinutes = timeToMinutes(String(startHour).padStart(2, '0') + ".00");
    appointments.forEach(appointment => {
        const startTimeIndex = (timeToMinutes(appointment.startTime) - baseMinutes) / 15;
        const endTimeIndex = (timeToMinutes(appointment.endTime) - baseMinutes) / 15;

        for (let i = startTimeIndex; i < endTimeIndex; i++) {
            quarterHours[i]++;
        }
    });

    //Für alle zeiten die mehr als 1 haben: suche die appointments, zähle sie, und schreib in den bereich von anfang des ersten bis ende des letzten die anzahl
    for (let i = 0; i<quarterHours.length; i++){
        if (quarterHours[i]>1){
            
        }
    }

    //console.log("ViertelStundenListe mit angabe wieviele Termine pro block: " + JSON.stringify(quarterHours))
}*/

/*
//Fügt in die 15min Slots je nach parallelen Terminen 1, 2 oder 3 Slots ein
function cellFormatter(dayKey){
    //console.log("CellFormatter wurde für den tag aufgerufen: " + dayKey);
    const cells = document.querySelectorAll(`td.timetableCell[data-day='${dayKey}']`);
    
    //console.log("Zellen: ");
    //console.log(cells);

    const cellOptions = []
    //kein Termin Blocker
    cellOptions[0] = `<div class="blocker"></div>`;
    //Ein termin, 2 Spacer
    cellOptions[1] = `<div class="singleApp"></div>`;
    //Zwei termine, 3 Spacer
    cellOptions[2] = `  <div class="doubleApp" style="left:3%"></div>
                        <div class="doubleApp" style="left:48%"></div>`;
    //Drei termine, 4 Spacer
    cellOptions[3] = `  <div class="tripleApp" style="left:3%></div>
                        <div class="tripleApp" style="left:34%></div>
                        <div class="tripleApp" style="left:67%></div>`;

    const cellsArray = Array.from(cells);

    //console.log("Starte For schleife");
    for (let i = 0; i < quarterHours.length; i++) {
        const optionIndex = quarterHours[i];
        if (optionIndex >= 0 && optionIndex < cellOptions.length) {
            //console.log("Zelle " + i + " wird mit dem cellOption index " + optionIndex + " befüllt");
            cells[i].firstElementChild.innerHTML = cellOptions[optionIndex];
        } else {
            //console.log("Zelle " + i + " wird leergelassen");
            cells[i].firstElementChild.innerHTML = "";
        }
    }
}
*/

/*Setzt Die Termine in den Stundenplan:
check ob 1,2,3 Termine: über quarterhours bei der app.StartTime
falls 1: fülle innerHTML
falls 2: check ob der erste Slot belegt ist, wenn ja dann schreib in den zweiten, sonst in den ersten
falls 3: ditto zu fall 2
*/
/*
function appointmentAdder(appointments, dayKey){
    console.log("appointmentAdder aufgerufen für " + dayKey);

        const timetableCells = Array.from(document.querySelectorAll(`td.timetableCell[data-day='${dayKey}']`));
        console.log("timetableCells:");
        console.log(timetableCells);
    
    appointments.forEach(app =>{
        console.log("forEach aufgerufen für" + app.name);
        const startIndex = timeToQuarterIndex(app.startTime);
        console.log("Startindex: " + startIndex);
        const endIndex = timeToQuarterIndex(app.endTime);
        console.log("Endindex: " + endIndex);

        const durationSlots = endIndex - startIndex;
        console.log("Durationslots: " + durationSlots);

        const cellHeight = timetableCells[0].offsetHeight;
        console.log("Cellheight: " + cellHeight);

        const startCell = timetableCells[startIndex].querySelector(`.singleApp`);
        console.log("Startzelle : ");
        console.log(startCell);

        if(timetableCells[startIndex].querySelector(".singleApp")){
            console.log("Logik für einen Termin wird gemacht")
            //Logik für nur einen Termin
            let singleCell = timetableCells[startIndex].querySelector(".singleApp");
            singleCell.innerHTML = app.name;
            singleCell.style.height = `${durationSlots * cellHeight}px`;

        }else if (timetableCells[startIndex].querySelector(".doubleApp")){
            //Logik für zwei parallele termine
        }else {
            //Logik für drei parallele termine
        }

        }
    )
}*/

//----------------------------- Sandbox 2

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
    const appointmentHeight = (timeToMinutes(app.endTime)-timeToMinutes(app.startTime))/15; //Endzeit-Startzeit- Uhrzeit wo plan beginnt

    innerTimetableCell.innerHTML = `<div class="singleApp" style="height: ${appointmentHeight * cellHeight}px;">${app.name}\n\n ${app.location}</div>`;
}

function renderDouble(appointment){
    const timetableCell = Array.from(document.querySelectorAll(`td.timetableCell[data-day='${dayKey}' data-time='${app.startTime}']`));
    //linker slot: left = 3% rechter slot: left=48%

    //falls in den zellen vor der eigenen startTime schon ein doubleAPP container ist dann in den linken slot schreiben
    //bevorzugt in den rechten slot schreiben


}

function renderTriple(appointment){
    //was für penner macht drei simultane termine=???????
    //so wie oben nur einfach zählen wieviele 
}