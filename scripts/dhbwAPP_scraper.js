/*
Scraper für die Webseite dhbw.app

Zieht sich die Termine und Zeiten von der Seite www.dhbw.app und speichert sie in einer JSON im timetables Ordner ab.

Solo-Testen des Scrapers:
    node dhbwAPP_scraper.js (geht nur wenn sessionCourse manuell gesetzt ist)

Class für die einzelnen Tage:    "mt-3 divide-gray-500 divide-y w-11/12 sm:w-5/6 md:2-3/4 lg:w-3/6 mx-auto"
Class für die einzelnen Termine: "rounded-xl shadow-2xl py-2 px-4 mt-4 bg-opacity-85 bg-zinc"
Class für Termin Name:           "text-zinc-300 select-none text-lg md:text-xl" (ist ein span)

Datum:
    Class Calender-Icon: "tabler-icon tabler-icon-calendar-event text-zinc-300 flex-none my-auto h-5 w-5"
    Inhalt: "flex-grow text-zinc-300 truncate" (ist das Span direkt dahinter)
    Format: XX.XX.XXXX

Uhrzeit:
    Class Zeit-Icon: "tabler-icon tabler-icon-clock-hour-8 text-zinc-300 flex-none my-auto h-5 w-5"
    Inhalt: "flex-grow text-zinc-300 truncate" (ist das Span direkt dahinter)
    Format: XX.XX - XX.XX (XX.XX %)

Raum:
    Class Raum-Icon: "tabler-icon tabler-icon-home text-zinc-300 flex-none my-auto h-5 w-5"
    Inhalt: "flex-grow text-zinc-300 truncate" (ist das Span direkt dahinter)
    Format: H213b,Hörsaal

EXTRAS:

DHBW Standort bei speziellen Events wie Blutspenden:
    Class Map-Pin-Icon: "tabler-icon tabler-icon-map-pin text-zinc-300 flex-none my-auto h-5 w-5"
    Inhalt: "flex-grow text-zinc-300 truncate" (ist das Span direkt dahinter)
    Format: FN

INFO:
    Class Info-Icon: "tabler-icon tabler-icon-info-square-rounded text-zinc-300 flex-none my-auto h-5 w-5"
    Inhalt: "flex-grow text-zinc-300 line-clamp-3" (ist das Span direkt dahinter)
    Format: Beliebiger Text
*/

import puppeteer from "puppeteer";
import fs from "fs";
import { fileURLToPath } from "url";

const resolveKurs = (sessionCourse) => {
    if (!sessionCourse) {
        throw new Error("Kein Kurs angegeben. Übergib sessionCourse oder setze window.sessionStorage('kurs').");
    }
    if (sessionCourse.startsWith("T")) {
        return `FN-${sessionCourse}`;
    }
    if (sessionCourse.startsWith("W")) {
        return `RV-${sessionCourse}`;
    }
    throw new Error(`Unbekanntes Kurs-Präfix: ${sessionCourse}`);
};

export const scrapeDhbwApp = async ({ sessionCourse, writeFile = true, outputDir = "./data/timetables" } = {}) => {
    //const resolvedSessionCourse = resolveSessionCourse(sessionCourse);
    //console.log("Ausgelesener Kurs: " + resolvedSessionCourse);

    //const kurs = resolveKurs(resolvedSessionCourse);
    const kurs = resolveKurs(sessionCourse);
    const url = `https://dhbw.app/c/${kurs}`;

    const browser = await puppeteer.launch();
    try {
        const page = await browser.newPage();
        await page.goto(url, {
            waitUntil: "networkidle2"
        });

        //Leitet alle console.logs aus der puppeteer seite an die Node Konsole weiter
        page.on("console", msg => {
            console.log("BROWSER LOG:", msg.text());
        });

        // wartet dass die Terminzeiten gerendert sind
        await page.waitForSelector(".flex-grow.text-zinc-300.truncate");

        const scrapingResult = await page.evaluate(() => {
            //Sucht sich alle Tage heraus und speichert sie als Array
            const days = document.querySelectorAll(".mt-3.divide-gray-500");

            //Jeder Tag wird einzeln verarbeitet
            return Array.from(days).map(day => {

                //Erstes Element im Tag ist der Ausgeschriebene Wochentag und Datum
                const header = day.firstElementChild;
                const weekday = header.innerText.trim().split(" - ")[0]; //Wochentag
                const date = header.innerText.trim().split(" - ")[1];    //Datum

                //Nach dem Header kommt ein Element das alle Termine enthält
                const dayContent = header.nextElementSibling;

                //Aus dem Tag werden alle Termine über die Klasse rausgesucht
                const appointmentArray = Array.from(dayContent.querySelectorAll(".rounded-xl.shadow-2xl"));


                //Jeder Termin wird einzeln verarbeitet
                const appointments = appointmentArray.map(appointment => {

                    //Holt sich den Namen des Termins
                    const name = appointment.querySelector(".text-zinc-300.select-none")?.innerText.trim() || "Termin ohne Name";

                    //Uhrzeiten des Termins
                    const timeIcon = appointment.querySelectorAll("[class*='tabler-icon-clock-hour-']")[0];
                    const timeElement = timeIcon ? timeIcon.nextElementSibling : null;
                    const time = timeElement?.innerText.trim() || "Zeit nicht vorhanden";
                    let startTime = "Startzeit nicht verfügbar";
                    let endTime = "Endzeit nicht verfügbar";
                    if (time !== "Zeit nicht vorhanden") {
                        const time_array = time.split(" - ");
                        startTime = time_array[0];
                        const endTime_dummy = time_array[1];
                        //Falls die Vorlesung gerade läuft muss die Prozentzahl abgeschnitten werden
                        const spaceIndex = endTime_dummy.indexOf(" ");
                        endTime = spaceIndex === -1 ? endTime_dummy : endTime_dummy.slice(0, spaceIndex);
                    }

                    //Raum des Termins
                    const locationIcon = appointment.querySelector(".tabler-icon-home");
                    const locationElemnt = locationIcon ? locationIcon.nextElementSibling : null;
                    const location = locationElemnt?.innerText.trim() || "Raum nicht angegeben";

                    //Spetialtermin Ort
                    const locationExtraIcon = appointment.querySelector(".tabler-icon-map-pin");
                    const locationExtraElemnt = locationExtraIcon ? locationExtraIcon.nextElementSibling : null;
                    const locationExtra = locationExtraElemnt?.innerText.trim() || null;

                    //Info Text
                    const infoIcon = appointment.querySelector(".tabler-icon-info-square-rounded");
                    const infoElement = infoIcon ? infoIcon.nextElementSibling : null;
                    const info = infoElement?.innerText.trim() || null;

                    return {name, startTime, endTime, location, locationExtra, info};
                });

                return {weekday, date, appointments};
            });
        });

        if (writeFile) {
            fs.mkdirSync(outputDir, { recursive: true });
            fs.writeFileSync(`${outputDir}/${kurs}.json`, JSON.stringify(scrapingResult, null, 2), "utf-8");
        }

        return { kurs, data: scrapingResult };
    } finally {
        await browser.close();
    }
};

const isDirectRun = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isDirectRun) {
    const sessionCourse = process.env.DHBW_KURS;
    scrapeDhbwApp({ sessionCourse })
        .then(result => {
            console.log("Scraping abgeschlossen:", result.kurs);
        })
        .catch(error => {
            console.error(error);
            process.exitCode = 1;
        });
}