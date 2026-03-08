//Globale Variablen
let targetDay = null;
let retryTimeout = null;
let retryScheduled = false;
let dayArrayCache = [];


//Die Buttons müssen nach dem auswählen einer anderen kachel und wieder zurückkommen neu gemacht werden
function bindNavButtons() {
const nextWeekButton = document.getElementById("nextButton");
const backWeekButton = document.getElementById("backButton");
nextWeekButton.addEventListener("click", () => {
    showNext();
});
backWeekButton.addEventListener("click", () => {
    showPrevious();
});
}

//Lädt die Kursinformation aus der Session API
async function loadfaculty() {
    const res = await fetch('/api/session');
    if (!res.ok) return null; // Fehler oder nicht eingeloggt
    const session = await res.json();
    if (!session.authenticated) {
        return null;
    }
    return `${session.faculty}` //FN-TIT24
}

//Holt alle Mensadaten (Standortspezifisch) aus der JSON Datei
//einen tag extrahieren: const day = dataArray[0]
//name des ersten gerichts: const name = dataArray[0].gerichte[0].name
async function fetchMensaData(faculty) {
    let dataArray = [];
    return fetch(`data/mensa_${faculty}.json`)
    .then(r => r.json())
    .then(days => {
        dataArray = Array.from(days);
        return dataArray;
    })
    .catch(err => {
        console.error("Fehler beim Laden der Stundenplandaten:", err);
        return [];
    });
}

//Hilfsfunktion, die aus dem datumsformat vom Scraper ein Date Objekt macht
function mensadateToDate(datumString){
    const match = datumString.match(/(\d{1,2})\.(\d{1,2})\./);
    if (!match) return null;
    const day = Number(match[1]);
    const month = Number(match[2]) - 1;
    const year = new Date().getFullYear();
    return new Date(year, month, day);
}


//Hilffunktion die aus dem dayArray den Tag heraussucht der das gegebene Datum hat
//gegebenes Datum braucht das Format:
function getDayDataByDate(dayArray, date){
    const target = new Date(date);
    target.setHours(0,0,0,0);

    return dayArray.find(day =>{
        const mensadate = mensadateToDate(day.datum);
        if(!mensadate) return false;
        mensadate.setHours(0,0,0,0);
        return mensadate.getTime() === target.getTime();
    })
}

//Funktion die sich den aktuellen Tag herausnimmt und damit dann die nächsten Tage berechnet und Anzeigt
//Nimmt nur Tage die auch in der mensa_<Standort>.json stehen, also nur die nächsten verfügbaren Daten

function showNext() {
    if (!dayArrayCache || dayArrayCache.length === 0) return

    // Finde den Index des ersten Tages, der >= targetDay ist
    const currentIndex = dayArrayCache.findIndex(day => {
        const d = mensadateToDate(day.datum)
        if (!d) return false
        d.setHours(0,0,0,0)
        const t = new Date(targetDay)
        t.setHours(0,0,0,0)
        return d.getTime() >= t.getTime()
    })

    if (currentIndex === -1) return
    if (currentIndex < dayArrayCache.length - 1) {
        targetDay = mensadateToDate(dayArrayCache[currentIndex + 1].datum)
        renderMenu()
    }
}



//Funktion die sich den aktuellen Tag herausnimmt und damit dann die vorherigen Tage berechnet und Anzeigt
//Springt nur zu Tagen vor targetDay, aber nicht vor heute.

function showPrevious() {
    if (!dayArrayCache || dayArrayCache.length === 0) return

    const today = new Date()
    today.setHours(0,0,0,0)

    const validDays = dayArrayCache
        .map(day => mensadateToDate(day.datum))
        .filter(d => d && d.getTime() < targetDay.getTime() && d.getTime() >= today.getTime())

    if (validDays.length === 0) return

    // Auf den letzten Tag vor targetDay setzen
    targetDay = validDays[validDays.length - 1]
    renderMenu()
}


export async function renderInitialMenu() {
    bindNavButtons();
    targetDay = new Date(); // heute als Start
    const faculty = await loadfaculty();
    const dayArray = await fetchMensaData(faculty);
    dayArrayCache = dayArray;
    renderMenu();
}


//Hilfsfunktion die nach 15s erneut rendert (falls der scraper noch nicht fertig war)
function scheduleRetry(){
    if (retryTimeout !== null) return;
    retryTimeout = setTimeout(async () => {
        retryTimeout = null;
        await renderMenu();
    }, 15000);
}

//Datumsformatierung in das Format: Wochentag, xx.xx
function formatTitleDate(date){
    return date.toLocaleDateString("de-DE", {
        weekday: "long",
        day: "2-digit",
        month: "2-digit"
    });
}

async function renderMenu(){
    const faculty = await loadfaculty();
    const dayArray = await fetchMensaData(faculty);
    dayArrayCache = dayArray;

    console.log(dayArray.map(d => mensadateToDate(d.datum)));
    console.log(" ");
    console.log(" ");
    console.log("dayArray: ");
    console.log(dayArray);

    const mensaHeader = document.querySelector(".active-card-title");
    mensaHeader.innerHTML = "Kantine: " + formatTitleDate(targetDay);

    const targetDayData = getDayDataByDate(dayArray, targetDay);
    console.log("DayData für Datum: " + targetDay);
    console.log(targetDayData);
    const mensaContainer = document.querySelector(".mensa");
    mensaContainer.innerHTML = "";
    if (targetDayData != undefined){
        mensaContainer.style.gridTemplateColumns = "repeat(3, 1fr)";

        if (faculty === "FN"){
            mensaContainer.style.height = "50%";
            mensaContainer.style.gridTemplateColumns = "repeat(2, 1fr)";
        }
        targetDayData.gerichte.forEach(gericht => {
            mensaContainer.innerHTML += `<div class="item">
                <p>${gericht.kategorie}<br>${gericht.name}</p>
                <p>Preise:<br>${gericht.preise}</p>
                <p>Allergene:<br>${gericht.allergene}</p>
                </div>`;
        });
    }else{
        const mensaContainer = document.querySelector(".mensa");
            mensaContainer.style.gridTemplateColumns = "repeat(1, 1fr)";
            mensaContainer.style.fontSize = "large";
            mensaContainer.style.fontWeight = "bold";
            mensaContainer.innerHTML += `<div>
                <p>Bitte Verzeihen Sie, es konnten keine Essensdaten gefunden werden</p>
                <p>Wir versuchen es in 15s erneut</p>
                <p>Alternativ versuchen sie es auf der Seite der Mensa: <a href="https://seezeit.com/en/food/menus/">Seezeit<a></p>
                </div>`;
                if(!retryScheduled){
                    scheduleRetry();
                    retryScheduled = true;
                }else{
                    mensaContainer.innerHTML = `<div>
                    <p>Bitte Verzeihen Sie, es konnten keine Essensdaten gefunden werden</p>
                    <p>Das Neuladen hat nicht geholfen</p>
                    <p>Versuchen sie es bitte auf der Seite der Mensa: <a href="https://seezeit.com/en/food/menus/">Seezeit<a></p>
                    </div>`;
                }
    }
}