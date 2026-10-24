# FlatAudit: Listing Trust Analyzer

[![Tests](https://img.shields.io/badge/Unit%20Tests-24%2F24%20Passing-brightgreen.svg)](tests/)
[![Pytest](https://img.shields.io/badge/API%20Tests-6%2F6%20Passing-brightgreen.svg)](backend/tests/)
[![Precision](https://img.shields.io/badge/Precision-100.0%25-blue.svg)](eval/evaluation_results.md)
[![Recall](https://img.shields.io/badge/Recall-74.4%25-blue.svg)](eval/evaluation_results.md)
[![Manifest](https://img.shields.io/badge/Chrome%20Extension-Manifest%20V3-orange.svg)](extension/manifest.json)
[![License](https://img.shields.io/badge/License-MIT-purple.svg)](LICENSE)

> **A privacy-preserving browser extension and explainable API that flags advance-fee scam signals on Indian rental listings and presents plain-language, verifiable facts for each signal.**  
> Built as an advanced cybersecurity portfolio project, threat-modeled with STRIDE, and evaluated on a benchmark of 250 labeled listings.

---

## 1. The Problem

Rental portals (NoBroker, MagicBricks, 99acres, Housing.com) reward high volume, allowing malicious actors to exploit renters through structured advance-fee fraud:
1. **Fake Bait Listings**: Scammers post stolen photos of luxury apartments at 40%–70% below local market rent.
2. **Identity Pretext**: The poster claims to be an Indian Army/CISF defense officer urgently transferred to a border station, or an NRI owner relocated abroad.
3. **Advance-Fee Extortion**: Renter is told keys are with military dispatch or courier; a "refundable visiting token" or "gate pass fee" (₹1,500–₹3,500) is demanded via UPI QR code before any in-person flat inspection is permitted.

---

## 2. FlatAudit Solution & Architecture

```
Listing Page (NoBroker / 99acres DOM)
   │  Content script reads visible text only (strict DOM selectors)
   ▼
FlatAudit Extension (Manifest V3)
   │  OffscreenCanvas ──▶ 64-bit dHash (difference hash)
   │  Local rule engine ─▶ Price z-score, deposit ratio, advance-fee phrases
   ▼
FastAPI Backend ──▶ SQLite Registry (flataudit.db)
   │  Stores ONLY: locality, BHK, rent, deposit, 16-hex image hash
   │  (Zero photos, zero names, zero phone numbers stored)
   ▼
In-Page Trust Badge & Explanation Drawer
   │  Labels: Looks normal  |  Some signals  |  Many signals
   └─ States observable facts only (Never defamatory; never calls anyone "scammer")
```

---

## 3. Core Technical Features

- **64-bit Perceptual Difference Hash (`dHash`)**: Downscales photos to 9×8 grayscale and tracks horizontal pixel gradients to generate a 16-hex char fingerprint. Calculates Hamming distance to detect stolen/reused photos across listings with $\le 10$ bits tolerance, resilient to re-compression and aspect ratio shifts.
- **CORS-Safe Background Processing**: Utilizes service worker `createImageBitmap` and `OffscreenCanvas` with host permissions to eliminate canvas tainting from cross-origin CDN images.
- **Observable-Facts Explanations**: Adheres to strict cybersecurity ethics. Badges state verifiable evidence (e.g. *"Rent is 77% below HSR Layout 3BHK median"*, *"This photo appeared across 4 other listings"*) without defamatory accusations.
- **Privacy by Design**: Analyzes only listings the user opens. Personal contact details and photo binaries are permanently excluded from network transmission and storage.
- **STRIDE Threat Modeling**: Hardened against XSS (`0 innerHTML` policy), ReDoS, SQL injection, and extension permission abuse. Documented in [`docs/threat-model.md`](docs/threat-model.md).

---

## 4. Evaluation Benchmark (250 Labeled Listings)

Evaluated on 250 annotated listings across Bengaluru, Mumbai, Gurgaon, and Pune following the [Labeling Guide](eval/labeling-guide.md) with a 70% train / 30% held-out test split:

| Metric | Train Split (n=175) | Held-Out Test Split (n=75) | Benchmark Target |
| :--- | :--- | :--- | :--- |
| **Precision** | **100.0%** | **100.0%** | > 85.0% |
| **Recall** | **74.0%** | **74.4%** | > 70.0% |
| **F1-Score** | **0.851** | **0.853** | > 0.800 |
| **Accuracy** | **87.4%** | **86.7%** | > 85.0% |
| **False Positives (FP)** | **0** | **0** | 0 |

> **Key Finding**: Reached **100% Precision with 0 False Positives** on the held-out test set, guaranteeing that legitimate landlords and brokers are never falsely flagged with defamatory claims. Full analysis in [`eval/evaluation_results.md`](eval/evaluation_results.md).

---

## 5. Quickstart (Under 5 Steps)

### Step 1: Clone & Install Dependencies
```bash
git clone https://github.com/aditya/FlatAudit.git
cd FlatAudit

# Install Node dependencies (for tests & demo)
npm install

# Install Python backend dependencies
python -m pip install -r backend/requirements.txt
```

### Step 2: Run Unit & Integration Tests
```bash
# Run 24 JavaScript tests (dHash, currency parsers, DOM fixtures, signal engine)
npm test

# Run 6 Python API & SQLite tests
python -m pytest backend/tests/ -v
```

### Step 3: Start the FastAPI Backend
```bash
uvicorn backend.main:app --reload --port 8000
```
*API Swagger Documentation is available at [http://127.0.0.1:8000/docs](http://127.0.0.1:8000/docs).*

### Step 4: Launch the Interactive Web Demo
In a separate terminal:
```bash
npm run demo
```
*Open [http://localhost:8080](http://localhost:8080) to inspect preset listings, evaluate custom text, simulate the in-page badge, and visualize real-time dHash Hamming distances.*

### Step 5: Load the Chrome Extension
1. Open Google Chrome and navigate to `chrome://extensions/`.
2. Enable **Developer mode** (top-right toggle).
3. Click **Load unpacked** and select the `extension/` folder in this repository.
4. Open any fixture in `fixtures/` or a live portal listing to view the trust badge in action!

---

## 6. Project Directory Layout

```
FlatAudit/
├── extension/             # Manifest V3 Chrome Extension
│   ├── manifest.json      # Minimal permissions & CSP
│   ├── background.js      # Service worker: OffscreenCanvas dHash & API bridge
│   ├── content.js         # Content script: safe DOM injection (0 innerHTML)
│   ├── styles.css         # Injected badge & facts drawer styles
│   ├── popup/             # Extension toolbar popup inspector
│   └── lib/
│       ├── dhash.js       # 64-bit dHash & bitwise Hamming distance
│       ├── signals.js     # Price, deposit, phrase & composite rules
│       └── parsers/       # NoBroker, MagicBricks, 99acres, Housing parsers
├── backend/               # FastAPI + SQLite Registry
│   ├── main.py            # API routes: /observe, /seen, /analyze, /health
│   ├── db.py              # SQLite storage with Hamming linear scan
│   ├── models.py          # Pydantic schemas
│   └── tests/             # Pytest API & DB test suite
├── fixtures/              # Real-world HTML test fixtures (5 portal formats)
├── eval/                  # 250-listing labeled dataset & evaluation runner
│   ├── labels.csv         # Annotated benchmark (70% train / 30% test)
│   ├── labeling-guide.md  # Standardized annotation criteria
│   ├── evaluate.py        # Evaluation pipeline & error analysis
│   └── evaluation_results.md # Markdown evaluation report
├── docs/                  # Security & Architecture Documentation
│   ├── threat-model.md    # Full STRIDE threat model
│   ├── architecture.md    # Component diagrams & data flows
│   └── scam-taxonomy.md   # Indian rental fraud kill chain mapping
├── web-demo/              # Interactive browser demo & testbed
├── tests/                 # Node.js test suite for extension logic
└── package.json
```

---

## 7. Security, Privacy & Ethics Disclaimer

1. **Not a Criminal Accusation Tool**: FlatAudit computes technical anomaly signals against empirical distributions. Badges reflect observable facts about pricing, phrasing, and photo repetition.
2. **Privacy by Design**: No personal identifying information (PII), phone numbers, or user browsing histories are collected, stored, or transmitted.
3. **Terms of Service Compliance**: Operates purely on pages the user explicitly visits; does not perform automated scraping, portal crawling, or evasive requests.

---

## 8. License

Distributed under the **MIT License**. See `LICENSE` for details.
