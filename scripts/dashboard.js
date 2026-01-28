document.addEventListener('DOMContentLoaded', () => {
    
    const grid = document.querySelector('.dashboard-grid');
    const cards = document.querySelectorAll('.dashboard-card');

    if (!grid) return; // Sicherheitscheck

    cards.forEach(card => {
        card.addEventListener('click', (e) => {
            
            // verhindert dass trotz links die logik ausgeführt wird. aktuell noch nicht wirklich nützlich
            // DOM macht aus html immer großbuchstaben, deswegen groß, closest basiert auf css, css braucht klein
            if (e.target.tagName === 'A' || e.target.closest('a')) return;

            // merkt sich tile das active ist
            const isActive = card.classList.contains('active');

            // macht alle unactive,
            cards.forEach(c => c.classList.remove('active'));
            grid.classList.remove('detail-mode');

            // macht das richtige active
            if (!isActive) {
                grid.classList.add('detail-mode');
                card.classList.add('active');
                
                beispieltext = card.querySelector(".detail-content");
                if (beispieltext) { 
                    beispieltext.innerText = "hier etwas dynamisch generiertes";
                }
                // Nach oben scrollen, damit man den Anfang sieht
                card.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
        });
    });
});
