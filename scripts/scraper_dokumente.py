#!/usr/bin/env python3
"""
Scraper for DHBW Ravensburg documents and downloads.
Downloads all documents from https://www.ravensburg.dhbw.de/service-einrichtungen/dokumente-downloads
and its subcategories, tracking changes in files and descriptions.
"""

import os
import json
import requests
from bs4 import BeautifulSoup
from datetime import datetime
from urllib.parse import urljoin, urlparse
import time
import re


import pdb

# Base URL for the documents page
BASE_URL = "https://www.ravensburg.dhbw.de/service-einrichtungen/dokumente-downloads"
DATA_DIR = os.path.join(os.path.dirname(__file__), "..", "data")
DOCUMENTS_DIR = os.path.join(DATA_DIR, "documents")
METADATA_FILE = os.path.join(DATA_DIR, "dokumente_metadata.json")


def load_metadata():
    """Load existing metadata from JSON file."""
    if os.path.exists(METADATA_FILE):
        try:
            with open(METADATA_FILE, 'r', encoding='utf-8') as f:
                return json.load(f)
        except Exception as e:
            print(f"Error loading metadata: {e}")
            return None
    return None


def save_metadata(metadata):
    """Save metadata to JSON file."""
    try:
        os.makedirs(os.path.dirname(METADATA_FILE), exist_ok=True)
        with open(METADATA_FILE, 'w', encoding='utf-8') as f:
            json.dump(metadata, f, indent=2, ensure_ascii=False)
        print(f"Metadata saved to {METADATA_FILE}")
    except Exception as e:
        print(f"Error saving metadata: {e}")


def get_file_metadata(url):
    """Get file metadata from HTTP headers without downloading."""
    try:
        response = requests.head(url, timeout=10, allow_redirects=True)
        return {
            'size': response.headers.get('Content-Length', 0),
            'last_modified': response.headers.get('Last-Modified', ''),
            'content_type': response.headers.get('Content-Type', '')
        }
    except Exception as e:
        print(f"Error getting metadata for {url}: {e}")
        return None


def sanitize_filename(filename):
    """Sanitize filename to be filesystem-safe."""
    # Remove or replace invalid characters
    filename = re.sub(r'[<>:"/\\|?*]', '_', filename)
    # Remove control characters
    filename = re.sub(r'[\x00-\x1f\x7f]', '', filename)
    # Limit length
    name, ext = os.path.splitext(filename)
    if len(name) > 200:
        name = name[:200]
    return name + ext


def sanitize_category_name(category):
    """Sanitize category path for use as directory name(s)."""
    if not category:
        return "Allgemein"

    parts = [part.strip() for part in category.split('/') if part.strip()]
    sanitized_parts = []

    for part in parts:
        # Remove special characters per segment but keep spaces and common punctuation
        safe_part = re.sub(r'[<>:"\\|?*]', '_', part)
        safe_part = safe_part.strip()
        if safe_part:
            sanitized_parts.append(safe_part)

    if not sanitized_parts:
        return "Allgemein"

    return os.path.join(*sanitized_parts)


def normalize_top_category(heading_text):
    """Map site h2 section headings to the desired top-level folder names."""
    if not heading_text:
        return None
    
    text = heading_text.lower()
    
    # Section markers - these explicitly switch the top-level category
    # Be conservative - only clear section headers should trigger a category change
    
    if "dokumente für duale partner" in text:
        return "Duale Partner"
    
    # Technik sections - multiple patterns
    if any(pattern in text for pattern in ["studienbereich technik", "fakultät technik", 
                                             "technik in friedrichshafen", "praxisphasen technik"]):
        return "Dokumente der Fakultät Technik"
    
    # Wirtschaft sections - multiple patterns  
    if any(pattern in text for pattern in ["studienbereich wirtschaft", "fakultät wirtschaft"]):
        return "Dokumente der Fakultät Wirtschaft"
    
    # Sections that clearly belong to "Broschüren & Berichte"
    # These are full h2 sections about brochures/reports, not subsections
    if text in ["verein der förderer und alumni der dhbw ravensburg", 
                "flyer der dhbw ravensburg",
                "gesetzestexte zur hochschulwerdung"]:
        return "Broschüren & Berichte"
    
    # For subsections, check if they start with keywords that indicate brochures
    if text.startswith("dhbw ") and any(keyword in text for keyword in ["jahresbericht", "flyer", 
                                                                          "infobroschüre", "leitbild", 
                                                                          "struktur"]):
        return "Broschüren & Berichte"
    
    # Zulassung sections that are clearly about admissions (not under Duale Partner)
    if text in ["zulassung und immatrikulation studierender",
                "bewerbung und zulassung"]:
        return "Bewerbung & Zulassung"
    
    # Prüfungsordnung section
    if "studien- und prüfungsordnung" == text:
        return "Studien- und Prüfungsordnung"
    
    # Not a section marker - stay in current category
    return None


def download_file(url, save_path):
    """Download a file from URL to save_path."""
    try:
        os.makedirs(os.path.dirname(save_path), exist_ok=True)
        response = requests.get(url, timeout=30, stream=True)
        response.raise_for_status()
        
        with open(save_path, 'wb') as f:
            for chunk in response.iter_content(chunk_size=8192):
                f.write(chunk)
        
        print(f"Downloaded: {os.path.basename(save_path)}")
        return True
    except Exception as e:
        print(f"Error downloading {url}: {e}")
        return False


def extract_documents_from_page(url):
    """Extract all documents with their descriptions from the page."""
    try:
        print(f"Fetching page: {url}")
        response = requests.get(url, timeout=30)
        response.raise_for_status()
        soup = BeautifulSoup(response.content, 'html.parser')        
        documents = []
        file_extensions = (
            r'\.(pdf|doc|docx?|dotx|docm|xlsx?|xlsm|pptx?|pptm|odt|ods|odp|rtf|msg|'
            r'zip|rar|7z|txt|csv|png|jpg|jpe?g|gif|eps|tiff?)(\?|$)'
        )
        
        # Strategy: for each h2/h3 heading, collect links until the next heading
        # This creates a category->links mapping
        link_categories = {}  # link href -> category name
        
        # Find all headings (h2 and h3) in order
        all_elements = soup.find_all(['h2', 'h3', 'a'])
        current_category = "Dokumente"  # Default
        current_top = "Dokumente"
        current_h2 = None
        current_h3 = None
        #with open("output.txt", "w", encoding="utf-8") as f:
        #    f.write(str(soup))
        #exit()
        for element in all_elements:
            if element.name == 'h2':
                heading_text = element.get_text(strip=True)
                if heading_text and len(heading_text) >= 3:
                    # Check if this is a section marker that changes the top-level category
                    new_top = normalize_top_category(heading_text)
                    if new_top:
                        # This is a section marker - set new top-level category
                        current_top = new_top
                        current_h2 = None
                        current_h3 = None
                        current_category = current_top
                    else:
                        # This is a regular h2 subsection under the current top-level category
                        current_h2 = heading_text
                        current_h3 = None  # Reset h3 when we hit a new h2
                        current_category = f"{current_top}/{current_h2}"
            elif element.name == 'h3':
                heading_text = element.get_text(strip=True)
                if heading_text and len(heading_text) >= 3:
                    current_h3 = heading_text
                    if current_h2:
                        # We have both h2 and h3 - create three-level path
                        current_category = f"{current_top}/{current_h2}/{current_h3}"
                    else:
                        # Only h3 under top-level
                        current_category = f"{current_top}/{current_h3}"
            elif element.name == 'a':
                href = element.get('href', '')
                if not href:
                    continue

                href_lower = href.lower()
                if any(href_lower.startswith(prefix) for prefix in ('#', 'mailto:', 'tel:', 'javascript:')):
                    continue

                if 'fileadmin' not in href_lower:
                    continue

                if 'amtliche' in href_lower:
                    continue

                has_known_extension = re.search(file_extensions, href, re.IGNORECASE) is not None
                has_download_hint = any(token in href_lower for token in ('download', 'view', 'inline'))

                if has_known_extension or has_download_hint:
                    link_categories[href] = current_category
        
        print(f"Found {len(link_categories)} document links with categories")
        
        # Now extract document information
        for href, category_name in link_categories.items():
            # Find the actual link element again to extract description
            link = soup.find('a', href=href)
            if not link:
                continue
            
            # Make absolute URL
            file_url = urljoin(url, href)
            
            # Extract filename from URL
            parsed_url = urlparse(file_url)
            filename = os.path.basename(parsed_url.path)
            
            # If no filename in URL, try to get from link text
            if not filename or filename == '':
                filename = sanitize_filename(link.get_text(strip=True)) + '.pdf'
            
            # Get title (link text)
            title = link.get_text(strip=True)
            
            # Try to find description - usually in a sibling or parent element
            description = ""
            
            # Look for description in various common patterns
            # Pattern 1: Description in next sibling <p> or <div>
            next_sibling = link.find_next_sibling(['p', 'div', 'span'])
            if next_sibling and len(next_sibling.get_text(strip=True)) > 0:
                desc_text = next_sibling.get_text(strip=True)
                # Only use if it's not another link and is reasonable length
                if not next_sibling.find('a') and len(desc_text) < 500:
                    description = desc_text
            
            # Pattern 2: Description in parent's next sibling
            if not description:
                parent = link.find_parent(['li', 'div', 'p'])
                if parent:
                    next_elem = parent.find_next_sibling(['p', 'div', 'span'])
                    if next_elem and len(next_elem.get_text(strip=True)) > 0:
                        desc_text = next_elem.get_text(strip=True)
                        if not next_elem.find('a') and len(desc_text) < 500:
                            description = desc_text
            
            # Pattern 3: Description after link in same parent
            if not description:
                parent = link.find_parent(['p', 'div', 'li'])
                if parent:
                    # Get all text after the link within the parent
                    link_text = link.get_text()
                    parent_text = parent.get_text(strip=True)
                    if link_text in parent_text:
                        after_link = parent_text.split(link_text, 1)
                        if len(after_link) > 1:
                            desc_text = after_link[1].strip()
                            if len(desc_text) > 10 and len(desc_text) < 500:
                                description = desc_text
            
            # Exclude documents from 'Amtliche Dokumente' category
            # Skip if URL contains 'Amtliche' or category contains 'Amtliche'
            if 'amtliche' in file_url.lower() or 'amtliche' in category_name.lower():
                continue
            
            documents.append({
                'url': file_url,
                'filename': filename,
                'title': title if title else filename,
                'category': category_name,
                'description': description
            })
        
        print(f"Found {len(documents)} documents")
        return documents
        
    except Exception as e:
        print(f"Error extracting documents from {url}: {e}")
        return []


def has_file_changed(doc, old_doc):
    """Check if file has changed by comparing HTTP metadata."""
    if not old_doc:
        return True  # New document
    
    # Get current file metadata from HTTP headers
    current_metadata = get_file_metadata(doc['url'])
    if not current_metadata:
        return True  # Can't get metadata, assume changed
    
    # Compare size and last modified
    old_size = old_doc.get('file_size', '')
    old_modified = old_doc.get('last_modified', '')
    
    size_changed = str(current_metadata['size']) != str(old_size)
    modified_changed = current_metadata['last_modified'] != old_modified
    
    return size_changed or modified_changed


def has_description_changed(doc, old_doc):
    """Check if description has changed."""
    if not old_doc:
        return True  # New document
    
    old_description = old_doc.get('description', '')
    new_description = doc.get('description', '')
    
    return old_description != new_description


def main():
    """Main scraper function."""
    print("=" * 60)
    print("DHBW Ravensburg Document Scraper")
    print("=" * 60)
    print(f"Started at: {datetime.now().isoformat()}")
    print()
    
    # Load existing metadata
    old_metadata = load_metadata()
    old_documents = {}
    if old_metadata and 'documents' in old_metadata:
        # Create a lookup dictionary by URL
        for doc in old_metadata['documents']:
            old_documents[doc['url']] = doc
        print(f"Loaded {len(old_documents)} documents from previous run")
    else:
        print("No previous metadata found, starting fresh")
    
    print()
    
    # Extract all documents from the page
    current_documents = extract_documents_from_page(BASE_URL)
    
    if not current_documents:
        print("No documents found! Exiting.")
        return
    
    print()
    print("-" * 60)
    print("Processing documents...")
    print("-" * 60)
    
    # Process each document
    new_metadata = {
        'timestamp': datetime.now().isoformat(),
        'source': BASE_URL,
        'categories': list(set(doc['category'] for doc in current_documents)),
        'documents': []
    }
    
    stats = {
        'total': len(current_documents),
        'new': 0,
        'file_changed': 0,
        'description_changed': 0,
        'unchanged': 0,
        'downloaded': 0
    }
    
    for doc in current_documents:
        url = doc['url']
        old_doc = old_documents.get(url)
        
        # Determine what changed
        is_new = old_doc is None
        file_changed = has_file_changed(doc, old_doc)
        description_changed = has_description_changed(doc, old_doc)
        
        # Prepare file path
        category_dir = sanitize_category_name(doc['category'])
        safe_filename = sanitize_filename(doc['filename'])
        local_path = os.path.join(DOCUMENTS_DIR, category_dir, safe_filename)
        relative_path = os.path.join("documents", category_dir, safe_filename)
        
        # Get HTTP metadata
        http_metadata = get_file_metadata(url)
        
        # Build document metadata
        doc_metadata = {
            'category': doc['category'],
            'filename': safe_filename,
            'url': url,
            'title': doc['title'],
            'description': doc['description'],
            'local_path': relative_path
        }
        
        if http_metadata:
            doc_metadata['file_size'] = http_metadata['size']
            doc_metadata['last_modified'] = http_metadata['last_modified']
            doc_metadata['content_type'] = http_metadata['content_type']
        
        # Handle download and metadata updates
        if is_new:
            print(f"\n[NEW] {doc['title']}")
            print(f"  Category: {doc['category']}")
            print(f"  URL: {url}")
            if doc['description']:
                print(f"  Description: {doc['description'][:100]}...")
            
            # Download file
            if download_file(url, local_path):
                doc_metadata['downloaded_at'] = datetime.now().isoformat()
                doc_metadata['description_updated_at'] = datetime.now().isoformat()
                stats['new'] += 1
                stats['downloaded'] += 1
            
        elif file_changed or description_changed:
            changes = []
            if file_changed:
                changes.append("file")
            if description_changed:
                changes.append("description")
            
            print(f"\n[UPDATED] {doc['title']}")
            print(f"  Changed: {', '.join(changes)}")
            print(f"  Category: {doc['category']}")
            
            # Re-download if file changed
            if file_changed:
                if download_file(url, local_path):
                    doc_metadata['downloaded_at'] = datetime.now().isoformat()
                    stats['file_changed'] += 1
                    stats['downloaded'] += 1
            else:
                # Keep old download timestamp
                doc_metadata['downloaded_at'] = old_doc.get('downloaded_at', '')
            
            # Update description timestamp if changed
            if description_changed:
                print(f"  Old description: {old_doc.get('description', 'None')[:100]}")
                print(f"  New description: {doc['description'][:100]}")
                doc_metadata['description_updated_at'] = datetime.now().isoformat()
                stats['description_changed'] += 1
            else:
                doc_metadata['description_updated_at'] = old_doc.get('description_updated_at', '')
        
        else:
            # No changes
            print(f"[UNCHANGED] {doc['title']}")
            doc_metadata['downloaded_at'] = old_doc.get('downloaded_at', '')
            doc_metadata['description_updated_at'] = old_doc.get('description_updated_at', '')
            stats['unchanged'] += 1
        
        new_metadata['documents'].append(doc_metadata)
        
        # Small delay to be polite to the server
        time.sleep(0.2)
    
    # Save updated metadata
    save_metadata(new_metadata)
    
    # Print summary
    print()
    print("=" * 60)
    print("Summary")
    print("=" * 60)
    print(f"Total documents: {stats['total']}")
    print(f"New documents: {stats['new']}")
    print(f"Files changed: {stats['file_changed']}")
    print(f"Descriptions changed: {stats['description_changed']}")
    print(f"Unchanged: {stats['unchanged']}")
    print(f"Files downloaded: {stats['downloaded']}")
    print()
    print(f"Documents saved to: {DOCUMENTS_DIR}")
    print(f"Metadata saved to: {METADATA_FILE}")
    print(f"Completed at: {datetime.now().isoformat()}")
    print("=" * 60)


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("\n\nScraper interrupted by user")
    except Exception as e:
        print(f"\n\nError: {e}")
        import traceback
        traceback.print_exc()

