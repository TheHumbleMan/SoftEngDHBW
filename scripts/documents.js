function normalizePath(pathValue) {
    // Eingaben werden vereinheitlicht dass Dateipfade unabhängig vom Ursprung gleich aussehen
    return String(pathValue || '').replace(/\\/g, '/').replace(/^\/+/, '');
}

function buildDownloadUrl(localPath) {
    // Lokale Pfade werden in eine URL unterhalb von data übersetzt
    const normalized = normalizePath(localPath);
    if (!normalized) {
        return '#';
    }

    // Jedes Segment wird separat kodiert dass Sonderzeichen gültig bleiben
    const encodedSegments = normalized
        .split('/')
        .filter(Boolean)
        .map(segment => encodeURIComponent(segment));

    return `/data/${encodedSegments.join('/')}`;
}

function createTree(documents) {
    // Die Dokumente werden in einen verschachtelten Kategorienbaum einsortiert
    const root = { children: new Map(), documents: [] };

    for (const doc of documents) {
        // Kategorien können mehrere Ebenen haben und werden deshalb aufgeteilt
        const categoryPath = String(doc.category || 'Allgemein')
            .split('/')
            .map(part => part.trim())
            .filter(Boolean);

        let current = root;
        for (const categoryName of categoryPath) {
            // Fehlende Zwischenknoten werden bei Bedarf neu angelegt
            if (!current.children.has(categoryName)) {
                current.children.set(categoryName, { children: new Map(), documents: [] });
            }
            current = current.children.get(categoryName);
        }

        // Die eigentliche Datei landet am Blatt des Baums
        current.documents.push(doc);
    }

    return root;
}

function filterDocuments(documents, rawQuery) {
    // Die Suche arbeitet fallunabhängig und toleriert leere Eingaben
    const query = String(rawQuery || '').trim().toLocaleLowerCase('de');
    if (!query) {
        return documents;
    }

    // Gesucht wird über mehrere Felder gleichzeitig dass Titel und Beschreibung Treffer liefern
    return documents.filter(documentData => {
        const haystack = [
            documentData.title,
            documentData.description,
            documentData.filename,
            documentData.category
        ]
            .map(value => String(value || '').toLocaleLowerCase('de'))
            .join(' ');

        return haystack.includes(query);
    });
}

function createDocumentItem(documentData) {
    // Ein Dokument wird als eigenständige Kachel mit Titel, Beschreibung und Link dargestellt
    const article = document.createElement('article');
    article.className = 'document-item';

    const title = document.createElement('h4');
    title.className = 'document-title';
    title.textContent = documentData.title || documentData.filename || 'Ohne Titel';

    const description = document.createElement('p');
    description.className = 'document-description';
    description.textContent = documentData.description || 'Keine Beschreibung verfügbar.';

    const link = document.createElement('a');
    link.className = 'document-download-link';
    link.href = buildDownloadUrl(documentData.local_path);
    link.textContent = 'Herunterladen';

    // Direkt-Download ist aktiv dass die Datei nicht erst im Browser geöffnet wird
    link.setAttribute('download', documentData.filename || 'dokument');

    // Variante 2 wäre ein normaler Link-Öffnen-Flow
    // link.target = '_blank';
    // link.rel = 'noopener noreferrer';

    article.append(title, description, link);
    return article;
}

function renderTreeNode(container, node, depth = 0) {
    // Kategorien werden alphabetisch sortiert dass die Darstellung stabil bleibt
    const sortedCategories = Array.from(node.children.entries()).sort(([left], [right]) =>
        left.localeCompare(right, 'de')
    );

    for (const [categoryName, childNode] of sortedCategories) {
        // Jeder Kategorienknoten wird als aufklappbarer Bereich gerendert
        const details = document.createElement('details');
        details.className = 'document-category';

        const summary = document.createElement('summary');
        summary.textContent = categoryName;

        const content = document.createElement('div');
        content.className = 'document-category-content';

        // Dokumente innerhalb einer Kategorie werden ebenfalls sortiert ausgegeben
        const sortedDocuments = [...childNode.documents].sort((a, b) =>
            String(a.title || a.filename || '').localeCompare(String(b.title || b.filename || ''), 'de')
        );

        for (const documentData of sortedDocuments) {
            content.appendChild(createDocumentItem(documentData));
        }

        // Unterkategorien werden rekursiv direkt in den Inhalt geschrieben
        renderTreeNode(content, childNode, depth + 1);

        details.append(summary, content);
        container.appendChild(details);
    }
}

export async function initDocuments(rootElement = document) {
    // Die Funktion initialisiert die Dokumentenansicht innerhalb eines beliebigen Root-Elements
    const container = rootElement.querySelector('[data-documents-root]');
    const searchInput = rootElement.querySelector('[data-documents-search]');
    const countLabel = rootElement.querySelector('[data-documents-count]');
    const toggleButton = rootElement.querySelector('[data-documents-toggle]');

    if (!container) {
        // Ohne Container gibt es nichts zu rendern
        return;
    }

    // Solange die Daten geladen werden wird ein Platzhalter angezeigt
    container.innerHTML = '<p class="documents-loading">Dokumente werden geladen...</p>';

    try {
        let categoriesExpanded = false;

        const updateToggleLabel = () => {
            if (!toggleButton) {
                return;
            }
            // Der Buttontext folgt dem aktuellen Gesamtzustand der Kategorien
            toggleButton.textContent = categoriesExpanded ? 'Alle einklappen' : 'Alle aufklappen';
        };

        const setAllCategoriesExpanded = (expanded) => {
            // Alle sichtbaren Kategorien werden gesammelt geöffnet oder geschlossen
            const categoryNodes = container.querySelectorAll('details.document-category');
            categoryNodes.forEach(node => {
                node.open = expanded;
            });
            categoriesExpanded = expanded;
            updateToggleLabel();
        };

        updateToggleLabel();

        // Die Metadaten werden direkt vom Backend geladen dass die Ansicht aktuell bleibt
        const response = await fetch('/api/documents', { cache: 'no-store' });
        if (!response.ok) {
            throw new Error('Dokument-Metadaten konnten nicht geladen werden.');
        }

        const payload = await response.json();
        const allDocuments = Array.isArray(payload.documents) ? payload.documents : [];

        if (allDocuments.length === 0) {
            // Leerer Bestand wird mit einer klaren Meldung dargestellt
            container.innerHTML = '<p>Keine Dokumente verfügbar.</p>';
            return;
        }

        const renderDocuments = (query = '') => {
            // Die angezeigte Liste wird bei jeder Suche vollständig neu aufgebaut
            const filteredDocuments = filterDocuments(allDocuments, query);

            if (countLabel) {
                countLabel.textContent = `${filteredDocuments.length} von ${allDocuments.length} Dokumenten`;
            }

            container.innerHTML = '';

            if (filteredDocuments.length === 0) {
                // Eine leere Suche liefert eine eigene Rückmeldung statt eines leeren Containers
                container.innerHTML = '<p>Keine Dokumente zur Suche gefunden.</p>';
                return;
            }

            // Der Filter treibt zuerst den Kategorienbaum und danach die eigentliche Darstellung an
            const treeRoot = createTree(filteredDocuments);
            renderTreeNode(container, treeRoot);
            setAllCategoriesExpanded(categoriesExpanded);
        };

        renderDocuments();

        if (searchInput) {
            // Jede Eingabe aktualisiert die Trefferliste sofort
            searchInput.addEventListener('input', () => {
                renderDocuments(searchInput.value);
            });
        }

        if (toggleButton) {
            // Der Toggle-Button schaltet alle Kategorien auf einen Schlag um
            toggleButton.addEventListener('click', () => {
                setAllCategoriesExpanded(!categoriesExpanded);
            });
        }
    } catch (error) {
        // Fehler werden in der UI sichtbar gemacht dass der Nutzer nicht nur eine leere Fläche sieht
        console.error('Fehler beim Laden der Dokumente:', error);
        container.innerHTML = '<p>Dokumente konnten nicht geladen werden.</p>';
        if (countLabel) {
            countLabel.textContent = '';
        }
    }
}
