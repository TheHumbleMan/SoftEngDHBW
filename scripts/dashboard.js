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
                
                // Hole den Detail-Content-Bereich der Karte
                const detailContent = card.querySelector(".detail-content");
                if (detailContent) { 
                    // Hole die URL des zu ladenden Inhalts aus dem data-content Attribut
                    const contentUrl = card.getAttribute('data-content');
                    if (contentUrl) {
                        // Lade den HTML-Inhalt von der angegebenen URL
                        fetch(contentUrl)
                            .then(response => {
                                // Prüfe ob die Anfrage erfolgreich war
                                if (!response.ok) throw new Error('Fehler beim Laden');
                                return response.text();
                            })
                            .then(html => {
                                // Parse die HTML-Antwort in ein DOM-Objekt
                                const parser = new DOMParser();
                                const doc = parser.parseFromString(html, 'text/html');
                                // Extrahiere den Inhalt vom <main> Tag oder wenn nicht vorhanden vom <body> Tag
                                const mainContent = doc.querySelector('main') || doc.body;
                                 // Setze den extrahierten Inhalt in den Detail-Bereich
                                detailContent.innerHTML = mainContent.innerHTML;
                            })
                            .catch(err => {
                                // Bei einem Fehler, zeige eine Fehlermeldung an
                                console.error('Fehler beim Laden:', err);
                                detailContent.innerHTML = '<p>Inhalt konnte nicht geladen werden.</p>';
                            });
                    } else {
                        detailContent.innerText = "hier etwas dynamisch generiertes";
                    }
                }
                // Nach oben scrollen, damit man den Anfang sieht
                card.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
        });
    });
});
