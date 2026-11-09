# FlatAudit: Listing Trust Analyzer & Buyhatke-Style Property Companion

<p align="center">
  <img src="docs/flataudit-banner.png" alt="FlatAudit Official Brand Identity" width="720" style="border-radius: 12px; box-shadow: 0 16px 40px rgba(0,0,0,0.4);" />
</p>

<p align="center">
  <a href="https://github.com/breathtaker-adi/FlatAudit/actions/workflows/ci-cd.yml"><img src="https://github.com/breathtaker-adi/FlatAudit/actions/workflows/ci-cd.yml/badge.svg" alt="CI/CD Status" /></a>
  <a href="https://breathtaker-adi.github.io/FlatAudit/"><img src="https://img.shields.io/badge/Live%20Showcase-breathtaker--adi.github.io%2FFlatAudit-0ea5e9.svg?style=flat" alt="Live Showcase" /></a>
  <a href="tests/"><img src="https://img.shields.io/badge/Unit%20Tests-272%2F272%20Passing-brightgreen.svg" alt="Unit Tests" /></a>
  <a href="backend/tests/"><img src="https://img.shields.io/badge/API%20Tests-30%2F30%20Passing-brightgreen.svg" alt="API Tests" /></a>
  <a href="tests/"><img src="https://img.shields.io/badge/Total%20Automated%20Tests-302%2F302%20Passing-brightgreen.svg" alt="Total Tests" /></a>
  <a href="tests/test_classifier_bulk.test.js"><img src="https://img.shields.io/badge/Intent%20Classifier-120%2F120%20(100%25)-brightgreen.svg" alt="Classifier" /></a>
  <a href="extension/icons/logo.svg"><img src="https://img.shields.io/badge/Design-Apple%20HIG%20%7C%20Verified%20Shield-38bdf8.svg" alt="Design" /></a>
  <a href="extension/manifest.json"><img src="https://img.shields.io/badge/Chrome%20Extension-Manifest%20V3-orange.svg" alt="Manifest" /></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-purple.svg" alt="License" /></a>
</p>

> 🌐 **Live Website & Interactive Studio**:  
> • **Showcase Experience**: [https://breathtaker-adi.github.io/FlatAudit/](https://breathtaker-adi.github.io/FlatAudit/)  
> • **Interactive Studio & Evaluation Lab**: [https://breathtaker-adi.github.io/FlatAudit/Demo](https://breathtaker-adi.github.io/FlatAudit/Demo)  

> **A privacy-preserving browser extension and explainable API that flags advance-fee scam signals on Indian rentals, features comprehensive Buyer Mode to evaluate the flat, project, and builder from official RERA records (Karnataka & Rajasthan pilots), projects 3Y/5Y/10Y capital appreciation, and acts as a "Buyhatke for property" — tracking price history sparklines, price-drop alerts, all-in closing costs, side-by-side comparisons, and printable advocate reports.**  
> Built as an advanced cybersecurity & consumer utility portfolio project, threat-modeled with STRIDE, and evaluated on benchmark listings with zero rule drift.

---

## 1. The Problem: Rental Fraud & Property Buying Opacity

Indian real estate portals (NoBroker, MagicBricks, 99acres, Housing.com) reward high listing volumes, allowing severe consumer risks to persist across major metros:
1. **Rental Advance-Fee Extortion**: Scammers post stolen photos of luxury apartments at 40%–70% below local market rent, claim to be an Indian Army/CISF/Air Force officer transferred on urgent duty (or an NRI landlord), and extort a "refundable visiting token", "gate pass fee", or "military registration slip" (₹1,500–₹3,500) via UPI QR code before in-person flat inspection.
2. **Rental Price Opacity & Fragmentation**: Landlords frequently post the exact same flat across 3 different portals with varying rent amounts, or drop rents quietly over weeks without notifying interested tenants. Renters lack a unified price history graph and cross-site comparison tool.
3. **Property Buying Risks & Area Ambiguity**: Homebuyers face ambiguous Super Built-up (SBUA) vs. Carpet Area loading (often 25%–35%), artificial price-per-sq.ft inflation, unverified RERA numbers, pressure to transfer heavy "hold tokens" before title diligence, and asking rates that diverge significantly from official Government Circle Rates (Guidance Values / DLC rates).

---

## 2. FlatAudit Solution Architecture

```
Listing Page (NoBroker / MagicBricks / 99acres / Housing DOM)
   │  Content script reads visible text only (strict DOM selectors, 0 innerHTML)
   │  Multi-Signal Intent Classifier: 'rent' | 'sale' (Crores, Lakhs, Sq.ft, Carpet vs SBUA)
   ▼
FlatAudit Extension (Manifest V3)
   │  OffscreenCanvas ─────────▶ 64-bit dHash (difference hash fingerprint, filtered CDN images)
   │  Local Rule Engine ───────▶ Price z-score, deposit ratio, advance-fee phrases
   │  Buyer Mode Engine ───────▶ Circle rate / DLC delta, official RERA link-outs, token checks
   │  Investment Engine ───────▶ 3Y / 5Y / 10Y Capital appreciation forecast & rental yield cash flow
   │  Fallback Ladder ─────────▶ Peer Page ➔ Area Cell ➔ District ➔ City ➔ Silence
   │  Local-First Tracker ─────▶ Price history snapshots, SVG sparkline, notes, EMI calculator
   ▼
FastAPI Backend (Port 8000 / Configurable) ──▶ SQLite Registry (flataudit.db)
   │  Stores ONLY: portal, listing_key, listing_type, locality, BHK, price/rent, deposit, area, floor, 16-hex image hash
   │  Cross-portal matching ───▶ Detects "Also listed on Portal B at ₹X (Save ₹Y)"
   │  Static Market Packs ─────▶ Aggregates trimmed medians with ETag caching (Zero PII)
   │  (Zero photos, zero names, zero phone numbers stored)
   ▼
Apple HIG Interface (Companion Drawer & Toolbar Popup)
   ├─ Verified Shield & Skyline Identity (Ultramarine #0B36FE, Crisp White, Dark Slate Navy)
   ├─ Tabular figures & non-clipping fluid flexbox (overflow-wrap: anywhere)
   ├─ Tab 1: Trust Signals (Observable facts only; positive verification points; safety tips)
   ├─ Buyer Mode: Guidance value reference, official RERA link-outs, Buyer Due Diligence checklist
   ├─ Investment Lab: 3Y / 5Y / 10Y appreciation milestones & net cash flow forecast
   ├─ Tab 2: Watchlist & Compare (Inline SVG sparklines, price drops, side-by-side comparison, CSV export)
   └─ Footer: "🚩 This looks wrong?" (Subtle anonymous diagnostic feedback to local storage)
```

---

## 3. Core Technical Features

### 🛡️ Trust & Safety Engine
- **64-bit Perceptual Difference Hash (`dHash`)**: Downscales photos to $9 \times 8$ grayscale and tracks horizontal pixel gradients to generate a 16-hex char fingerprint. Calculates Hamming distance to detect stolen/reused photos across listings with $\le 10$ bits tolerance.
- **CORS-Safe & Tracker-Filtered Image Processing**: Smart filtering excludes YouTube video covers, tracking pixels, ad networks, and SVGs before processing. Background service worker uses `OffscreenCanvas` with host permissions to eliminate canvas tainting.
- **Dynamic 5-Step Benchmark Fallback Ladder**: Replaces hardcoded rupee thresholds with non-parametric statistics (Median & Median Absolute Deviation) evaluated across:
  1. *Level 1: Peer Page* ($n \ge 6$ listings on active search/carousel — works on day one in any Indian city).
  2. *Level 2: Area Cell* (fine geohash ~1–5 km or fine locality pack, $n \ge 10$).
  3. *Level 3: District Cell* (parent geohash prefix ~20–40 km, $n \ge 8$).
  4. *Level 4: City Baseline* (metro aggregate, $n \ge 5$).
  5. *Level 5: Silence Mode* (suppresses false price alarms when local data is sparse).
- **Observable-Facts Explanations**: Adheres to strict anti-defamation principles. Badges state verifiable evidence (e.g. *"Rent is 77% below HSR Layout 3BHK median"*, *"Photo fingerprint appeared across 4 distinct listings"*) without defamatory accusations.
- **Positive Verification on Normal Listings**: Even when zero red flags fire, properties receive 4 verified points confirming price alignment, standard deposit ratio, and clean phrasing.

### 🏠 Buyer Mode: Evaluate the Flat, Project & Builder
- **Multi-Signal Intent Classifier (`classifier.js`)**: Evaluates 120+ real-world listing structures across NoBroker, MagicBricks, 99acres, and Housing with a 100% correct mode detection rate (0.0% wrong-mode rate). Automatically engages Buyer Mode on sale listings and Rent Mode on rental pages.
- **Price Per Sq Ft Intelligence Engine (Sale Mode)**:
  - Compares flat ₹/sq ft strictly on **like-for-like** area types (Carpet vs SBUA) and identical BHK.
  - Spatial neighbour inclusion: automatically resolves neighbor localities within a **3.0 km radius** using haversine math.
  - Robust sample gating: requires $n \ge 8$ listings combined across $\ge 2$ cells (or $n \ge 8$ in 1 cell); otherwise suppresses comparison and reports *"Not enough listings to compare."*
  - $N$-weighted median calculation: transparently states *"₹X/sq ft, Y% above/below the middle rate of ₹Z/sq ft (N listings, M localities within 3 km)"*.
- **Objective 4-Line Evaluation**: Replaces arbitrary score badges with factual observations with sources and dates:
  1. **Flat**: Rate per sq.ft vs peers and government circle rate on strict like-for-like area basis (Carpet vs SBUA).
  2. **Project**: Official Form B completion dates vs revised dates (`Dates revised in X of Y projects`), escrow bank, and State RERA status.
  3. **Builder**: Promoter disclosed past projects, revision denominator, and litigation field transcriptions.
  4. **Paperwork**: Explicit acknowledgment of what cannot be verified by browser code (title, encumbrances) and lawyer hand-off checklist.
- **Karnataka (K-RERA) & Rajasthan (Raj-RERA) Statutory Engines**:
  - *Bengaluru Kaveri 2.0 Circle Rates* & 20-project pilot registry.
  - *Rajasthan DLC Guidance Valuation & Surcharges* (Jaipur, Jodhpur, Udaipur, Kota) with female buyer duty concession (5% base vs 6%) and Section 47-A tax underreporting risk warnings.
  - *Raj-RERA Disclosure Auditing*: Checks Form R-1 (Architect), Form R-2 (Engineer), Form R-3 (Chartered Accountant Escrow), and quarterly progress reports (QPR) for overdrawn escrow or improbable completion velocity.
- **All-In Acquisition Cost Estimator (`closing_costs.json`)**: Statutory stamp duty, registration fees, GST (0% on OC ready-to-move vs 5% under-construction), BESCOM/BWSSB, and Khata transfer estimates.
- **Printable 1-Page Buyer Due Diligence Report**: One-click generation of a clean, printer-friendly dossier for buyers to hand directly to their advocate.

### 📍 Area Report & Neighborhood Intelligence (`extension/lib/area/`)
- **Five Graded Amenity Categories**: Evaluates **Emergency & Healthcare**, **Daily Supplies & Services**, **Commute & Transit**, **Safety & Environment** (*"Nearby map facts, not crime data."*), and **Lifestyle & Community**.
- **Pilot City Tiers**: Metro thresholds for **Bengaluru**; smaller-city thresholds for **Jaipur** and **Jodhpur**.
- **Privacy by Design Architecture**:
  - **Off by Default**: Requires explicit user opt-in in settings and requests Chrome's optional host permissions (`optional_host_permissions`).
  - **Location Rounding (~100m)**: Lat/lng are rounded to 3 decimal places before any network query is made or cached.
  - **Zero Data Transmission When Off**: The drawer and popup footer guarantee *"🔒 Zero personal data transmitted"*. Unit tests assert zero `fetch` calls occur when disabled.
  - **On-Device 14-Day LRU Cache**: Stores up to 50 locations locally via `StorageAdapter` to minimize external map queries.
  - **Density Gating**: Automatically flags `thin_map` (*"Not enough map data here."*) when fewer than 5 amenities exist within 1 km, and low confidence when fewer than 15 exist.
  - **OpenStreetMap Attribution**: Respects ODbL requirements: *"Map data © OpenStreetMap contributors"*.

### 📈 Capital Appreciation & Investment Engine (`investment.js`)
- **Multi-Year Capital Growth Forecast**: Evaluates compounding appreciation trajectories for 3-Year, 5-Year, and 10-Year horizons based on Indian metro infrastructure and historical CAGR tiers (Conservative 5.5%, Moderate 8.0%, High Growth 11.5%).
- **Gross & Net Rental Yield Cash Flow**: Calculates gross rental yield and net cash flow after maintenance, vacancy allowance, and property tax.
- **Dynamic Scenario Toggles**: Instantly recalculate projections based on down payment percentage and expected appreciation rate.

### 📊 Buyhatke-Style Property Companion
- **Price History Inline SVG Sparkline**: Pure mathematical SVG curve with gradient fill rendered directly in the DOM without external charting dependencies.
- **Local-First Watchlist**: Stores snapshots `{t, rent, deposit, price, pricePerSqft, listed}` in `chrome.storage.local`. Re-records snapshots only when price/rent changes or >24 hours pass.
- **Price-Drop Alerts**: Prominently highlights rent/price reductions upon revisit (e.g., *"🎉 Price dropped ₹5,00,000 (-4%) since first viewed"*).
- **Side-by-Side Comparison Matrix**: Select 2 to 4 listings to view an automated comparison of Price/Rent, Area (sq.ft), Price/sq.ft, Possession, RERA status, and Risk Flags with best values highlighted.
- **Cross-Portal Duplicate Matching**: Matches properties across portals using image dHash distance $\le 8$, same locality & BHK, price within 5%, and area within 3%.
- **Shortlist CSV Export**: One-click download of saved shortlist with user notes and market status.

---

## 4. Evaluation Benchmarks & Zero Rule Drift

FlatAudit maintains an automated single-source-of-truth evaluation bridge (`eval/evaluate.py` via `eval/run_signals.js`) that directly invokes production JavaScript (`extension/lib/signals.js`), guaranteeing **0.0% rule drift**.

### Evaluation Summary

| Suite | Scope | Pass Rate | Target |
| :--- | :--- | :--- | :--- |
| **JavaScript Unit Tests** | 265 tests (parsers, signals, math, buyer, price check, area report) | **265 / 265 (100%)** | 100% |
| **Python Backend Tests** | 30 tests (API, SQLite, duplicate matches, telemetry, spikes) | **30 / 30 (100%)** | 100% |
| **Intent Classifier Bulk** | 120 real-world page patterns (NoBroker, MagicBricks, 99acres) | **120 / 120 (100%)** | > 98% |
| **Synthetic Dataset A** | 250 synthetic edge cases across 4 cities (`eval/labels.csv`) | **97.3% Accuracy** | > 85% |
| **Real-World Dataset B** | 30 real listings across 5 metros (`eval/real_listings.csv`) | **100.0% Accuracy** | > 90% |

---

## 5. Quickstart Guide

### Step 1: Clone & Install Dependencies
```bash
git clone https://github.com/breathtaker-adi/FlatAudit.git
cd FlatAudit

# Install Node dependencies (test runner & demo)
npm install

# Install Python backend dependencies
python -m pip install -r backend/requirements.txt
```

### Step 2: Run Unit & Integration Tests
```bash
# Run 265 JavaScript unit, buyer mode, price check & area report tests
npm test

# Run 30 Python API, SQLite, duplicate matching & spike tests
python -m pytest backend/tests/ -v

# Run the single-source-of-truth evaluation pipelines
python eval/evaluate.py --dataset eval/labels.csv
python eval/evaluate.py --dataset eval/real_listings.csv
```

### Step 3: Start the FastAPI Backend
```bash
uvicorn backend.main:app --reload --port 8000
```
*API documentation is available at [http://127.0.0.1:8000/docs](http://127.0.0.1:8000/docs).*

### Step 4: Launch the Dual Web Surfaces (Showcase & Studio)
```bash
npm run demo
```
*The local demo server starts at `http://localhost:8080` (powered by `scripts/serve_demo.js` with ES module and JSON streaming support):*
- **Launch Showcase (`http://localhost:8080/index2.html` or `/`)**: Full cinematic narrative showcase featuring the 5-stage rental scam kill chain with GSAP smooth scroll pinning, 60% center pop-up solution card, live in-page trust audit interactive widget, Buyhatke price tracking sparkline, buyer mode diligence preview, and OpenStreetMap area report.
- **Interactive Studio (`http://localhost:8080/index.html`)**: Developer testbed and full property intelligence suite (Property Audit Dossier, Buyhatke-style Price History & Watchlist Comparison, Capital Appreciation Forecaster, and Research Lab with Hamming distance calculator).

### Step 5: Load the Chrome Extension
1. Open Google Chrome and navigate to `chrome://extensions/`.
2. Enable **Developer mode** (top-right toggle).
3. Click **Load unpacked** and select the `extension/` directory.
4. Open any fixture in `fixtures/` or a live portal listing on NoBroker, MagicBricks, 99acres, or Housing.com to view the trust badge and Buyhatke companion!

---

## 6. Configuring a Custom Backend API URL

By default, FlatAudit points to `http://127.0.0.1:8000/api/v1`. To connect to a deployed backend:
1. Click the FlatAudit extension icon in Chrome's toolbar.
2. In the popup header, click the **Connected** / **Offline** status badge.
3. Enter your deployed API base URL (e.g., `https://api.flataudit.org/api/v1`).
4. Alternatively, execute in Developer Console:
   ```javascript
   chrome.storage.local.set({ flataudit_api_url: "https://your-deployed-api.com/api/v1" });
   ```
*If the backend is unreachable, FlatAudit degrades gracefully to offline mode, relying on bundled static market packs.*

---

## 7. Project Directory Layout

```
FlatAudit/
├── extension/                 # Manifest V3 Chrome Extension
│   ├── manifest.json          # Minimal permissions & strict CSP
│   ├── background.js          # Service worker: OffscreenCanvas dHash & API proxy
│   ├── content.js             # Content script: safe DOM injection (0 innerHTML)
│   ├── styles.css             # Apple HIG glassmorphism drawer, buyer card & sparklines
│   ├── icons/                 # Official extension icons & vector Verified Shield logo
│   ├── popup/                 # Toolbar popup (Trust + Watchlist tabs)
│   └── lib/
│       ├── dhash.js           # 64-bit dHash & bitwise Hamming distance
│       ├── signals.js         # Single-source-of-truth signal engine
│       ├── benchmarks.js      # Dynamic 5-step fallback ladder, circle rates & RERA links
│       ├── buyer.js           # Buyer Mode: 4-line evaluation, cost estimator, checklists & report
│       ├── investment.js      # 3Y / 5Y / 10Y Capital appreciation & rental yield engine
│       ├── geohash.js         # Base32 geohash encoder & DOM coordinate extractor
│       ├── tracker.js         # Buyhatke watchlist, SVG sparklines, compare & EMI calculator
│       ├── data/
│       │   ├── market_packs.json    # Aggregated fallback market statistics
│       │   ├── guidance_values.json # Karnataka Kaveri 2.0 government circle rates
│       │   ├── pilot_projects.json  # Curated K-RERA Bengaluru projects dataset
│       │   └── closing_costs.json   # Karnataka Stamp Act, GST, and statutory rates
│       └── parsers/           # Multi-portal parsers with intent classifier & image sanitizers
├── backend/                   # FastAPI + SQLite Registry
│   ├── main.py                # REST endpoints: /observe, /seen, /matches, /packs
│   ├── db.py                  # SQLite storage & cross-portal duplicate matching
│   ├── build_packs.py         # Batch pack generator (trimmed stats, zero PII)
│   ├── models.py              # Pydantic data schemas (rent & sale listings)
│   └── tests/                 # Pytest test suite (30 tests)
├── fixtures/                  # Real-world HTML test fixtures (8 portal, sale & RERA formats)
├── eval/                      # Evaluation datasets & test runners
│   ├── labels.csv             # Synthetic Unit-Test Dataset (250 listings)
│   ├── real_listings.csv      # Real-World Multi-City Dataset (30 listings, 5 cities)
│   ├── labeling_template.csv  # Contributor annotation template
│   ├── evaluate.py            # Zero-drift evaluation runner
│   └── run_signals.js         # Node subprocess bridge to signals.js
├── docs/                      # Security & Engineering Documentation
│   ├── plans/                 # Product roadmaps, specifications & build plans
│   ├── zero_context_blueprint.md     # Architectural reconstruction blueprint
│   ├── buyer-mode-wording-guide.md   # Anti-defamation & editorial vocabulary standard
│   ├── threat-model.md        # Full STRIDE threat model
│   ├── privacy-policy.md      # Plain-language privacy commitments
│   ├── store-listing.md       # Chrome Web Store listing & asset specification
│   ├── engineering-retrospective-v1.md # Lessons learned & retrospective
│   ├── architecture.md        # Architecture diagrams
│   └── scam-taxonomy.md       # Rental fraud kill chain breakdown
├── tests/                     # Node.js test suite (272 tests across 100 suites)
├── scripts/                   # Tooling & local multi-surface demo server
│   └── serve_demo.js          # HTTP server with MIME type router for ES modules & JSON
├── web-demo/                  # Standalone interactive browser testbed & showcase
│   ├── index2.html            # Cinematic Showcase & Rental Scam Kill Chain
│   ├── index.html             # Interactive Intelligence Studio & Dossier
│   ├── app.js                 # Studio controller & DOM binding logic
│   ├── style.css              # Studio Apple HIG dark-mode theme
│   ├── logo.svg               # Keystone Shield emblem vector asset
│   ├── icon32.png             # 32x32 Favicon
│   └── icon128.png            # 128x128 Brand Touch Icon
└── package.json
```

---

## 8. Permissions & Privacy by Design

### Chrome Permissions Justification

| Permission | Justification | Privacy Safeguard |
| :--- | :--- | :--- |
| `storage` | Stores watchlist listings, price snapshots, and anonymous feedback. | Sandboxed strictly in `chrome.storage.local`. Nothing leaves the browser. |
| `host_permissions` | Content script on supported real estate portals and CDN image fetching for perceptual hash. | Only active on supported property pages. Excludes tracking, ads, and video embeds. |
| `http://127.0.0.1:8000/*` | Connects to local or custom API endpoint for cross-portal duplicate queries. | Configurable; extension operates 100% offline using bundled static packs. |

### Portal Terms of Service Statement
FlatAudit operates exclusively on the client-side as an assistive accessibility and privacy tool during normal user browsing. It does not perform automated scraping, spidering, or bulk data harvesting, fully respecting the load and integrity of underlying real estate portals. See [`docs/privacy-policy.md`](docs/privacy-policy.md) for full details.

---

## 9. Known Limitations & Boundaries

1. **New or Novel Scam Pretexts**: The rule engine flags established advance-fee and military impersonation patterns; novel or conversational fraud formats require periodic pattern updates.
2. **DOM Structure Fragility**: Significant portal redesigns may require updates to parser selectors. Automated health checks (`tests/test_parsers.test.js`) are in place to detect parser degradation immediately.
3. **Property Title Verification**: FlatAudit analyzes listing credibility and price anomalies; it does not authenticate government land records or verify property title deeds.

---

## 10. License

Distributed under the **MIT License**. See `LICENSE` for details.
