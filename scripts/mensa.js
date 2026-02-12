//Globale Variablen
let targetDay = null;

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
    const match = datumString.match(/(\d{2})\.(\d{2})\./);
    if (!match) return null;
    const day = Number(match[1]);
    const month = Number(match[2])-1;
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

function showNext(){
    //TODO: Logik: targetday um 1 erhöhen, neu rendern
    return;
}

function showPrevious(){
    //TODO: Logik: targetday um 1 verrigern, neu rendern
    //aufpassen dass das Datum nicht in der Vergangenheit liegt, weil da haben wir eig. keine Daten zu
    return;
}

export async function renderInitialMenu() {
    bindNavButtons();

    targetDay = new Date();

    renderMenu();
}

async function renderMenu(){
    //TODO: anpassen dass wenn keine daten für ein datum vorhanden sind eine entsprechender Inhalt angezeigt wird
    const faculty = await loadfaculty();
    const dayArray = await fetchMensaData(faculty);
    console.log(dayArray.map(d => mensadateToDate(d.datum)));
    console.log(" ");
    console.log(" ");
    console.log("dayArray: ");
    console.log(dayArray);

    const targetDayData = getDayDataByDate(dayArray, targetDay);
    console.log("DayData für Datum: " + targetDay);
    console.log(targetDayData);

    if (faculty === "FN"){
        const mensaContainer = document.querySelector(".mensa");
        mensaContainer.style.height = "50%";
        mensaContainer.style.gridTemplateColumns = "repeat(2, 1fr)";
    }
    targetDayData.gerichte.forEach(gericht => {
        const mensaContainer = document.querySelector(".mensa");
        mensaContainer.innerHTML += `<div class="item">
            <p>${gericht.kategorie}<br>${gericht.name}</p>
            <p>Preise:<br>${gericht.preise}</p>
            <p>Allergene:<br>${gericht.allergene}</p>
            </div>`;
    });
}