/*
Scraper für die Webseite dhbw.app

Zieht sich die Termine und Zeiten von der Seite www.dhbw.app und speichert sie in einer JSON im data Ordner ab.

Class für die einzelnen Tage:    "mt-3 divide-gray-500 divide-y w-11/12 sm:w-5/6 md:2-3/4 lg:w-3/6 mx-auto"
Class für die einzelnen Termine: "rounded-xl shadow-2xl py-2 px-4 mt-4 bg-opacity-85 bg-zinc"
Class für Termin Name:           "text-zinc-300 select-none text-lg md:text-xl" (ist ein span)
Class für die Zeit:              "flex-grow text-zinc-300 truncate" (ist ein span), gibt es dreimal pro termin (Datum: 26.01.2026, Uhrzeit:08.00 - 12.00, Raum: H213b,Hörsaal)
*/

import puppeteer from "puppeteer";

const browser = await puppeteer.launch();
const page = await browser.newPage();
await page.goto("https://dhbw.app/c/FN-TIT24", {
    waitUntil: "networkidle2"
});
await page.waitForSelector(".flex-grow.text-zinc-300.truncate"); // wartet auf die Terminzeiten
//await page.waitForTimeout(1000); // 1 Sekunde extra

const data = await page.evaluate(() => {
    const days = document.querySelectorAll(".mt-3.divide-gray-500");
    return Array.from(days).map(day => {
        const header = day.firstElementChild;
        const headerText = header.innerText.trim();
        const weekday = headerText.split(" - ")[0];

        const dayContent = header.nextElementSibling;
        const appointmentArray = Array.from(dayContent.querySelectorAll(".rounded-xl.shadow-2xl"));
        
        const appointments = appointmentArray.map(appointment => {
            const name = appointment.querySelector(".text-zinc-300.select-none")?.innerText.trim() || "Terminname nicht vorhanden";

            const appointmentData = appointment.querySelectorAll(".flex-grow.text-zinc-300.truncate");
            const time = appointmentData[1]?.innerText.trim() || "Zeit nicht vorhanden";
            const startTime = time.split(" - ")[0].replace(".", ":") || "Startzeit nicht vorhanden";
            const endTime = time.split(" - ")[1].replace(".", ":") || "Endzeit nicht vorhanden";
            const date = appointmentData[0]?.innerText.trim() || "datum nicht vorhanden";
            const location = appointmentData[2]?.innerText.trim() || "raum nicht vorhanden";
            
            return {name, date, startTime, endTime, location};
        });

        return {weekday, appointments};
    });
});

await browser.close();

import fs from "fs";
fs.writeFileSync("./data/dhbwAPP_data.json", JSON.stringify(data, null, 2), "utf-8");