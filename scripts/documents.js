function normalizePath(pathValue) {
    return String(pathValue || '').replace(/\\/g, '/').replace(/^\/+/, '');
}

function buildDownloadUrl(localPath) {
    const normalized = normalizePath(localPath);
    if (!normalized) {
        return '#';
    }

    const encodedSegments = normalized
        .split('/')
        .filter(Boolean)
        .map(segment => encodeURIComponent(segment));

    return `/data/${encodedSegments.join('/')}`;
}

function createTree(documents) {
    const root = { children: new Map(), documents: [] };

    for (const doc of documents) {
        const categoryPath = String(doc.category || 'Allgemein')
            .split('/')
            .map(part => part.trim())
            .filter(Boolean);

        let current = root;
        for (const categoryName of categoryPath) {
            if (!current.children.has(categoryName)) {
                current.children.set(categoryName, { children: new Map(), documents: [] });
            }
            current = current.children.get(categoryName);
        }

        current.documents.push(doc);
    }

    return root;
}

function filterDocuments(documents, rawQuery) {
    const query = String(rawQuery || '').trim().toLocaleLowerCase('de');
    if (!query) {
        return documents;
    }

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

    // Variante 1 (aktiv): Direkter Download
    link.setAttribute('download', documentData.filename || 'dokument');

    // Variante 2 (auskommentiert): In neuem Tab öffnen
    // link.target = '_blank';
    // link.rel = 'noopener noreferrer';

    article.append(title, description, link);
    return article;
}

function renderTreeNode(container, node, depth = 0) {
    const sortedCategories = Array.from(node.children.entries()).sort(([left], [right]) =>
        left.localeCompare(right, 'de')
    );

    for (const [categoryName, childNode] of sortedCategories) {
        const details = document.createElement('details');
        details.className = 'document-category';

        const summary = document.createElement('summary');
        summary.textContent = categoryName;

        const content = document.createElement('div');
        content.className = 'document-category-content';

        const sortedDocuments = [...childNode.documents].sort((a, b) =>
            String(a.title || a.filename || '').localeCompare(String(b.title || b.filename || ''), 'de')
        );

        for (const documentData of sortedDocuments) {
            content.appendChild(createDocumentItem(documentData));
        }

        renderTreeNode(content, childNode, depth + 1);

        details.append(summary, content);
        container.appendChild(details);
    }
}

export async function initDocuments(rootElement = document) {
    const container = rootElement.querySelector('[data-documents-root]');
    const searchInput = rootElement.querySelector('[data-documents-search]');
    const countLabel = rootElement.querySelector('[data-documents-count]');
    const toggleButton = rootElement.querySelector('[data-documents-toggle]');

    if (!container) {
        return;
    }

    container.innerHTML = '<p class="documents-loading">Dokumente werden geladen...</p>';

    try {
        let categoriesExpanded = false;

        const updateToggleLabel = () => {
            if (!toggleButton) {
                return;
            }
            toggleButton.textContent = categoriesExpanded ? 'Alle einklappen' : 'Alle aufklappen';
        };

        const setAllCategoriesExpanded = (expanded) => {
            const categoryNodes = container.querySelectorAll('details.document-category');
            categoryNodes.forEach(node => {
                node.open = expanded;
            });
            categoriesExpanded = expanded;
            updateToggleLabel();
        };

        updateToggleLabel();

        const response = await fetch('/api/documents', { cache: 'no-store' });
        if (!response.ok) {
            throw new Error('Dokument-Metadaten konnten nicht geladen werden.');
        }

        const payload = await response.json();
        const allDocuments = Array.isArray(payload.documents) ? payload.documents : [];

        if (allDocuments.length === 0) {
            container.innerHTML = '<p>Keine Dokumente verfügbar.</p>';
            return;
        }

        const renderDocuments = (query = '') => {
            const filteredDocuments = filterDocuments(allDocuments, query);

            if (countLabel) {
                countLabel.textContent = `${filteredDocuments.length} von ${allDocuments.length} Dokumenten`;
            }

            container.innerHTML = '';

            if (filteredDocuments.length === 0) {
                container.innerHTML = '<p>Keine Dokumente zur Suche gefunden.</p>';
                return;
            }

            const treeRoot = createTree(filteredDocuments);
            renderTreeNode(container, treeRoot);
            setAllCategoriesExpanded(categoriesExpanded);
        };

        renderDocuments();

        if (searchInput) {
            searchInput.addEventListener('input', () => {
                renderDocuments(searchInput.value);
            });
        }

        if (toggleButton) {
            toggleButton.addEventListener('click', () => {
                setAllCategoriesExpanded(!categoriesExpanded);
            });
        }
    } catch (error) {
        console.error('Fehler beim Laden der Dokumente:', error);
        container.innerHTML = '<p>Dokumente konnten nicht geladen werden.</p>';
        if (countLabel) {
            countLabel.textContent = '';
        }
    }
}
