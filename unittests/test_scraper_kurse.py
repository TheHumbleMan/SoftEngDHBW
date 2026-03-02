import sys
import os
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '../scripts')))

import pytest
from unittest.mock import patch, MagicMock, mock_open
import json

from scraper_kurse import scrape_course_names, save_to_txt, save_to_json, main

class TestScraper:
    
    # ---------------------------------------------------------
    # 1. Tests für das Web-Scraping (Selenium)
    # ---------------------------------------------------------
    @patch('scraper_kurse.webdriver.Chrome')
    @patch('scraper_kurse.WebDriverWait')
    def test_scrape_course_names_success(self, mock_wait, mock_chrome):
        # 1. Fake-Browser (Driver) erstellen
        mock_driver = MagicMock()
        mock_chrome.return_value = mock_driver
        
        # 2. Fake-HTML-Links (<a> Tags) erstellen
        link1 = MagicMock()
        link1.get_attribute.return_value = '/c/RV-TIT24'
        link1.text = 'TIT24'
        
        link2 = MagicMock()
        link2.get_attribute.return_value = '/c/RV-BWL21'
        link2.text = 'BWL21'
        
        link_invalid1 = MagicMock()
        link_invalid1.get_attribute.return_value = '/c/RV-Quatsch'
        link_invalid1.text = 'KeinKursName'
        
        link_invalid2 = MagicMock()
        link_invalid2.get_attribute.return_value = '/c/FN-TIT24' 
        link_invalid2.text = 'TIT24'

        mock_driver.find_elements.return_value = [link1, link2, link_invalid1, link_invalid2]
        
        # 3. Funktion aufrufen
        site_code, courses = scrape_course_names('https://dhbw.app/RV')
        
        # 4. Überprüfen
        assert site_code == 'RV'
        assert courses == ['BWL21', 'TIT24']
        mock_driver.quit.assert_called_once()

    @patch('scraper_kurse.webdriver.Chrome')
    def test_scrape_course_names_exception(self, mock_chrome):
        mock_chrome.side_effect = Exception("Browser kaputt")
        
        site_code, courses = scrape_course_names('https://dhbw.app/FN')
        
        assert site_code == 'FN'
        assert courses == []

   # ---------------------------------------------------------
    # 2. Tests für Datei-Speicherung (JSON & TXT)
    # ---------------------------------------------------------
    @patch('os.makedirs')
    @patch('builtins.open', new_callable=mock_open)
    def test_save_to_txt_success(self, mock_file, mock_makedirs):
        courses = ['BWL21', 'TIT24']
        
        result = save_to_txt(courses, 'test_dir/kurse.txt')
        
        assert result is True
        mock_makedirs.assert_called_once_with('test_dir', exist_ok=True)
        mock_file.assert_called_once_with('test_dir/kurse.txt', 'w', encoding='utf-8')
        
        handle = mock_file()
        handle.write.assert_any_call('BWL21\n')
        handle.write.assert_any_call('TIT24\n')

    @patch('os.makedirs')
    @patch('builtins.open', new_callable=mock_open)
    def test_save_to_txt_exception(self, mock_file, mock_makedirs):
        mock_makedirs.side_effect = PermissionError("Kein Zugriff")
        
        result = save_to_txt(['TIT24'], 'test_dir/kurse.txt')
        assert result is False

    @patch('os.makedirs')
    @patch('scraper_kurse.json.dump')
    @patch('builtins.open', new_callable=mock_open)
    def test_save_to_json_success(self, mock_file, mock_json_dump, mock_makedirs):
        courses = ['TIT24']
        
        result = save_to_json(courses, 'test.json', 'RV')
        
        assert result is True
        mock_file.assert_called_once_with('test.json', 'w', encoding='utf-8')
        mock_json_dump.assert_called_once()
        
    @patch('os.makedirs')
    @patch('builtins.open', new_callable=mock_open)
    def test_save_to_json_exception(self, mock_file, mock_makedirs):
        mock_makedirs.side_effect = Exception("Fehler")
        
        result = save_to_json(['TIT24'], 'test.json', 'RV')
        assert result is False

    # ---------------------------------------------------------
    # 3. Test für die Main-Funktion
    # ---------------------------------------------------------
    @patch('scraper_kurse.save_to_json')
    @patch('scraper_kurse.scrape_course_names')
    def test_main_success(self, mock_scrape, mock_save_json):
        mock_scrape.side_effect = [
            ('RV', ['BWL21', 'TIT24']),
            ('FN', ['TINF20'])
        ]
        
        main()
        
        assert mock_scrape.call_count == 2
        assert mock_save_json.call_count == 2
        mock_save_json.assert_any_call(['BWL21', 'TIT24'], '../data/kurse_rv.json', 'RV')
        mock_save_json.assert_any_call(['TINF20'], '../data/kurse_fn.json', 'FN')

    @patch('scraper_kurse.scrape_course_names')
    def test_main_no_courses_found(self, mock_scrape):
        mock_scrape.side_effect = [
            ('RV', []),
            ('FN', [])
        ]
        
        main()
        assert mock_scrape.call_count == 2