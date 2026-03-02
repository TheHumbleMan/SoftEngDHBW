import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock global fetch
global.fetch = vi.fn();

// Mock dynamic imports von timetable.js und mensa.js
vi.mock('../scripts/timetable.js', async () => {
  return {
    initDates: vi.fn(),
    renderSelectedWeek: vi.fn()
  };
});

vi.mock('../scripts/mensa.js', async () => {
  return {
    renderInitialMenu: vi.fn()
  };
});

describe('Dashboard Test', () => {

  beforeEach(() => {
    // DOM aufbauen
    document.body.innerHTML = `
      <div class="dashboard-grid">
        <div class="dashboard-card" data-content="kacheln/timetable.html">
          <div class="detail-content"></div>
        </div>
        <div class="dashboard-card" data-content="kacheln/mensa.html">
          <div class="detail-content"></div>
        </div>
        <div class="dashboard-card">
          <div class="detail-content"></div>
        </div>
      </div>

      <!-- Für timetable.js -->
      <div id="timetable-container"></div>
      <button id="nextButton"></button>
      <button id="backButton"></button>
    `;

    // scrollIntoView mocken
    document.querySelectorAll('.dashboard-card').forEach(card => {
      card.scrollIntoView = vi.fn();
    });

    // Standard fetch mock für loadCourse
    fetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        authenticated: true,
        faculty: 'FN',
        course: 'TIT24'
      })
    });
  });

  it('lädt den Stundenplan bei Klick', async () => {
    fetch.mockResolvedValueOnce({
      ok: true,
      text: async () => '<main><p>Stundenplan Inhalt</p></main>'
    });

    await import('../scripts/dashboard.js');
    document.dispatchEvent(new Event('DOMContentLoaded'));

    const card = document.querySelector('[data-content="kacheln/timetable.html"]');
    card.click();

    await new Promise(resolve => setTimeout(resolve, 0));

    const detailContent = card.querySelector('.detail-content');
    expect(fetch).toHaveBeenCalledWith('kacheln/timetable.html');
    expect(detailContent.innerHTML).toContain('Stundenplan Inhalt');
  });

  it('lädt das Mensa-Menü bei Klick', async () => {
    fetch.mockResolvedValueOnce({
      ok: true,
      text: async () => '<main><p>Mensa Inhalt</p></main>'
    });

    await import('../scripts/dashboard.js');
    document.dispatchEvent(new Event('DOMContentLoaded'));

    const card = document.querySelector('[data-content="kacheln/mensa.html"]');
    card.click();

    await new Promise(resolve => setTimeout(resolve, 0));

    const detailContent = card.querySelector('.detail-content');
    expect(fetch).toHaveBeenCalledWith('kacheln/mensa.html');
    expect(detailContent.innerHTML).toContain('Mensa Inhalt');
  });

  it('macht nichts, wenn die Karte schon active ist', async () => {
    await import('../scripts/dashboard.js');
    document.dispatchEvent(new Event('DOMContentLoaded'));

    const card = document.querySelector('[data-content="kacheln/timetable.html"]');
    const grid = document.querySelector('.dashboard-grid');

    card.classList.add('active');
    grid.classList.add('detail-mode');

    card.click();

    expect(card.classList.contains('active')).toBe(true);
    expect(grid.classList.contains('detail-mode')).toBe(true);
  });

  it('zeigt dynamischen Inhalt, wenn data-content fehlt', async () => {
    await import('../scripts/dashboard.js');
    document.dispatchEvent(new Event('DOMContentLoaded'));

    const card = document.querySelectorAll('.dashboard-card')[2]; // ohne data-content
    card.click();

    expect(card.querySelector('.detail-content').innerText)
      .toContain('hier etwas dynamisch generiertes');
  });

  it('zeigt Fehlermeldung, wenn fetch HTML fehlschlägt', async () => {
    fetch.mockResolvedValueOnce({ ok: false, status: 500 });

    await import('../scripts/dashboard.js');
    document.dispatchEvent(new Event('DOMContentLoaded'));

    const card = document.querySelector('[data-content="kacheln/timetable.html"]');
    card.click();

    await new Promise(resolve => setTimeout(resolve, 0));

    expect(card.querySelector('.detail-content').innerHTML)
      .toContain('Inhalt konnte nicht geladen werden.');
  });

});