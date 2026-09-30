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

## Machine Learning Detection

PhishShield augments its real-time heuristic scanning with an on-device machine learning model:

- **Model Architecture**: Locally trained Logistic Regression model, selected for balanced generalization on apex domains and tracking URLs.
- **Dataset**: Trained on the [UCI PhiUSIIL Phishing URL Dataset](https://archive.ics.uci.edu/dataset/967/phiusiil+phishing+url+dataset), incorporating thousands of verified phishing and legitimate URLs.
- **Feature Extraction**: Evaluates 26 URL-based structural and lexical features (including URL lengths, dot/hyphen counts, IP address flags, suspicious ports, keyword flags, and suspicious TLDs).
- **Client-Side ONNX Inference**: Exported to ONNX and executed entirely in-browser using ONNX Runtime Web (`ort.min.js` and WebAssembly). Zero network latency for model evaluation.
- **Hybrid Scoring**: Combines rule-based heuristics and ML probabilities (`hybridScore = Math.round(ruleScore * 0.6 + mlScore * 0.4)`), while ensuring high-confidence rule detections and blacklisted domains are never downgraded.
- **Strict Privacy**: 100% of inference runs locally in the browser. No URLs, email bodies, or user metadata are ever sent to external servers, cloud APIs, or telemetry endpoints.

### Held-Out Evaluation Metrics

On the held-out test split, the deployment model achieved:
- **Accuracy**: 99.41%
- **Precision**: 99.95%
- **Recall**: 98.67%
- **F1-Score**: 99.31%

> **Note**: These metrics reflect empirical evaluation on the held-out dataset benchmark and do not represent a guarantee of 100% real-world accuracy across all novel or evolving phishing vectors. PhishShield combines ML with rule-based heuristics and blacklist matching for defense-in-depth.

## Tech Stack

- JavaScript (ES6+)
- ONNX Runtime Web (Client-side WebAssembly inference)
- Python & Scikit-learn (Offline ML training and ONNX export)
- HTML and CSS
- Chrome Extension APIs (Manifest V3)
- DOM manipulation and MutationObserver

## Project Structure

```text
phishshield/
│── manifest.json
│── content.js
│── blacklist.js
│── popup.html
│── popup.js
│── style.css
│── lib/
│   ├── ort.min.js
│   ├── phishshield_inference.js
│   ├── ort-wasm.wasm
│   └── ort-wasm-simd.wasm
│── models/
│   └── phishshield_model.onnx
│── ml/
│   ├── dataset/
│   │   ├── README.md
│   │   └── urls.csv
│   ├── prepare_dataset.py
│   ├── train_model.py
│   ├── export_onnx.py
│   ├── test_features.py
│   ├── phishshield_model.pkl
│   ├── phishshield_model.onnx
│   └── requirements.txt
```

## Installation

1. Clone the repository: git clone [https://github.com/yourusername/phishshield.git](https://github.com/sunandabandi/phishshield.git)

2. Open Chrome and navigate to: chrome://extensions/

3. Enable Developer Mode

4. Click on "Load unpacked"

5. Select the project folder

## Usage

- Open Gmail or any webpage containing links
- The extension will automatically scan and analyze links using hybrid rule + ML scoring
- Suspicious links will be visually highlighted (Red for High Risk, Orange for Medium Risk)
- Click on the extension icon to view categorized results in the popup

## Future Improvements

- Expanded feature set including domain age via offline pre-computed feeds
- Adaptive user whitelists for enterprise workflows
- Fine-grained explainability tags in popup showing top contributing ML feature weights

## Author

Sunanda Bandi

## License

This project is for educational and demonstration purposes and is not currently licensed for external use.
