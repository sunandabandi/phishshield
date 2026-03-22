# PhishShield - Chrome Extension for Phishing Detection

PhishShield is a Chrome extension designed to detect and highlight potentially malicious links in real time while browsing emails, particularly in Gmail. The extension analyzes links using a rule-based approach and provides users with clear visual indicators and a structured summary through a popup interface.

## Overview

Phishing attacks often rely on deceptive links embedded in emails. PhishShield helps mitigate this risk by scanning all links on a page, evaluating their characteristics, and categorizing them based on potential threat level. The extension operates entirely on the client side and provides immediate feedback without requiring external services.

## Features

- Real-time scanning of links using DOM monitoring
- Detection of suspicious URL patterns and domains
- Identification of hidden or mismatched links
- Keyword-based analysis of email content
- Risk classification into High, Medium, and Safe categories
- Visual highlighting of suspicious links directly on the page
- Popup dashboard displaying categorized links with interactive exploration

## How It Works

The extension scans all anchor elements on the page and evaluates each link using a scoring mechanism. The score is determined based on factors such as URL structure, presence of suspicious keywords, domain characteristics, and mismatches between displayed text and actual URLs. Based on this score, links are classified into risk categories.

The results are stored locally using Chrome's storage API and displayed in a popup interface, allowing users to review and interact with categorized links.

## Tech Stack

- JavaScript (ES6)
- HTML and CSS
- Chrome Extension APIs (Manifest V3)
- DOM manipulation and MutationObserver

## Project Structure

phishshield/
│── manifest.json
│── content.js
│── blacklist.js
│── popup.html
│── popup.js
│── style.css

## Installation

1. Clone the repository: git clone [https://github.com/yourusername/phishshield.git](https://github.com/sunandabandi/phishshield.git)

2. Open Chrome and navigate to: chrome://extensions/

3. Enable Developer Mode

4. Click on "Load unpacked"

5. Select the project folder

## Usage

- Open Gmail or any webpage containing links
- The extension will automatically scan and analyze links
- Suspicious links will be visually highlighted
- Click on the extension icon to view categorized results in the popup

## Future Improvements

- Integration of machine learning models for phishing detection
- Use of external phishing intelligence APIs
- Improved scoring algorithms and reduced false positives
- Enhanced user interface with more detailed insights
- Performance optimizations for large-scale scanning

## Author

Sunanda Bandi

## License

This project is for educational and demonstration purposes and is not currently licensed for external use.
