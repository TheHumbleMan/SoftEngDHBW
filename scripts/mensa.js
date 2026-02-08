//Globale Variablen
//const faculty = loadfaculty().lower();

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
    return;
}

export async function renderMenu() { //maybe targetday an die renderMenu funktion übergeben oder so, rendern auslagern => renderMenu wird zu renderInitialMenu
    bindNavButtons();
    const faculty = await loadfaculty();
    const dayArray = await fetchMensaData(faculty);
    console.log(dayArray.map(d => mensadateToDate(d.datum)));
    console.log(" ");
    console.log(" ");
    console.log("dayArray: ");
    console.log(dayArray);
    //TODO: anpassen dass wenn keine daten für ein datum vorhanden sind eine entsprechende nachricht angezeigt wird

    const targetDay = new Date(2026, 1, 2); // gerade ist der 02.02. hardgecodet, klammer leer machen für aktuelles datum
    const targetDayData = getDayDataByDate(dayArray, targetDay);

    console.log("DayData für Datum: " + targetDay);
    console.log(targetDayData);

    targetDayData.gerichte.forEach(gericht => {
        const mensaContainer = document.querySelector(".mensa");
        mensaContainer.innerHTML += `<div class="item">${gericht.kategorie}\n\n ${gericht.name}</div>`;
    });
}