
const phasesByYear = {
  1: [ // 1. Studienjahr
    { name: "Praxisphase 1", startKW: 40, endKW: 1 },
    { name: "Theoriephase 1", startKW: 2, endKW: 12 },
    { name: "Prüfungsphase 1", startKW: 13, endKW: 13 },
    { name: "Urlaub/Praxis", startKW: 14, endKW: 14 },
    { name: "Theoriephase 2", startKW: 15, endKW: 25 },
    { name: "Prüfungsphase 2", startKW: 26, endKW: 26 },
    { name: "Praxisphase 2", startKW: 27, endKW: 39 }
  ],
  2: [ // 2. Studienjahr
    { name: "Theoriephase 3", startKW: 40, endKW: 50 },
    { name: "Prüfungsphase 3", startKW: 51, endKW: 51 },
    { name: "Urlaub/Praxis", startKW: 52, endKW: 1 },
    { name: "Theoriephase 4", startKW: 2, endKW: 12 },
    { name: "Prüfungsphase 4", startKW: 13, endKW: 13 },
    { name: "Praxisphase 3 & 4", startKW: 14, endKW: 39 }
  ],
  3: [ // 3. Studienjahr
    { name: "Theoriephase 5", startKW: 40, endKW: 50 },
    { name: "Prüfungsphase 5", startKW: 51, endKW: 51 },
    { name: "Praxisphase 5", startKW: 52, endKW: 14 },
    { name: "Theoriephase 6", startKW: 15, endKW: 25 },
    { name: "Prüfungsphase 6", startKW: 26, endKW: 26 },
    { name: "Praxisphase 6 - Bachelorarbeit", startKW: 27, endKW: 38 },
    { name: "Mündliche Prüfung", startKW: 39, endKW: 39 }
  ]
};

function getStudyYear(courseCode) {
  // extrahiere Jahr aus Code, z.B. Tit24 -> 24 -> 2024
  const startYear = 2000 + parseInt(courseCode.match(/\d+/)[0], 10);

  const today = new Date();
  let yearOffset = today.getFullYear() - startYear;

  // Wenn es vor September ist, ist man noch im "alten" Studienjahr
  if (today.getMonth() < 8) yearOffset--;

  return yearOffset + 1; // Studienjahr 1-basiert
}

function getDateOfISOWeek(week, year) {
  const simple = new Date(year, 0, 1 + (week - 1) * 7);
  const dow = simple.getDay();
  const ISOweekStart = new Date(simple);

  if (dow <= 4)
    ISOweekStart.setDate(simple.getDate() - simple.getDay() + 1);
  else
    ISOweekStart.setDate(simple.getDate() + 8 - simple.getDay());

  return ISOweekStart;
}

export async function renderPhases(courseCode) {
  const studyYear = getStudyYear(courseCode);
  const phases = phasesByYear[studyYear];

  const appointmentTitle = document.getElementById("appointment-title");
  appointmentTitle.textContent = `Studienverlauf für das ${studyYear}. Studienjahr`;

  const container = document.getElementById("appointment-container");
  container.innerHTML = "";

  // Startjahr des Studienjahres berechnen
  // Studienjahr beginnt immer im September
  const currentYear = new Date().getFullYear();
  const month = new Date().getMonth();

  // Studienjahr: wenn heute vor September ist, dann beginnt aktuelles Studienjahr letzten September
  let yearOfFirstSeptember = currentYear;
  if (month < 8) yearOfFirstSeptember--; // Monate 0-7 -> Jan-Aug

  // Jahr für das aktuelle Studienjahr
  const studyYearStart = yearOfFirstSeptember;
  const studyYearEnd = studyYearStart + 1;

  phases.forEach(p => {
    const phaseDiv = document.createElement("div");
    phaseDiv.className = "phase";

    // KW ≥ 40 → StudienjahrStart, KW < 40 → StudienjahrEnd
    const yearStartUse = p.startKW >= 40 ? studyYearStart : studyYearEnd;
    const yearEndUse   = p.endKW >= 40 ? studyYearStart : studyYearEnd;

    const startDate = getDateOfISOWeek(p.startKW, yearStartUse);
    const endDate = getDateOfISOWeek(p.endKW, yearEndUse);
    endDate.setDate(endDate.getDate() + 6); // Sonntag

    // Prüfen, ob die aktuelle Woche in der Phase liegt
    const today = new Date();
    if (today >= startDate && today <= endDate) {
      phaseDiv.classList.add("current");
    }

    phaseDiv.innerHTML = `
      <strong>${p.name}</strong><br>
      ${startDate.toLocaleDateString()} - ${endDate.toLocaleDateString()}
    `;

    container.appendChild(phaseDiv);
  });
}