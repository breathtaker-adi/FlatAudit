# FlatAudit: Listing Trust Analyzer & Buyhatke-Style Property Companion

[![Tests](https://img.shields.io/badge/Unit%20Tests-69%2F69%20Passing-brightgreen.svg)](tests/)
[![Pytest](https://img.shields.io/badge/API%20Tests-11%2F11%20Passing-brightgreen.svg)](backend/tests/)
[![Synthetic Eval](https://img.shields.io/badge/Synthetic%20Baseline-97.3%25-blue.svg)](eval/evaluation_results.md)
[![Real-World Eval](https://img.shields.io/badge/Real--World%20Eval-100%25%20(5%20Cities)-brightgreen.svg)](eval/evaluation_real_results.md)
[![Manifest](https://img.shields.io/badge/Chrome%20Extension-Manifest%20V3-orange.svg)](extension/manifest.json)
[![License](https://img.shields.io/badge/License-MIT-purple.svg)](LICENSE)

> **A privacy-preserving browser extension and explainable API that flags advance-fee scam signals on Indian rentals, evaluates resale property buying (Crore parsing, price/sq.ft, government circle rates, official RERA link-outs, EMI calculations), and acts as a "Buyhatke for property" — tracking price history sparklines, price-drop alerts, side-by-side comparison tables, and cross-portal duplicate listings.**  
> Built as an advanced cybersecurity & consumer utility portfolio project, threat-modeled with STRIDE, and evaluated on benchmark listings with zero rule drift.

---

## 1. The Problem: Rental Fraud & Property Buying Opacity

Indian real estate portals (NoBroker, MagicBricks, 99acres, Housing.com) reward high listing volumes, allowing severe consumer risks to persist across major metros:
1. **Rental Advance-Fee Extortion**: Scammers post stolen photos of luxury apartments at 40%–70% below local market rent, claim to be an Indian Army/CISF/Air Force officer transferred on urgent duty (or an NRI landlord), and extort a "refundable visiting token", "gate pass fee", or "military registration slip" (₹1,500–₹3,500) via UPI QR code before in-person flat inspection.
2. **Rental Price Opacity & Fragmentation**: Landlords frequently post the exact same flat across 3 different portals with varying rent amounts, or drop rents quietly over weeks without notifying interested tenants. Renters lack a unified price history graph and cross-site comparison tool.
3. **Property Buying Risks & Area Ambiguity**: Homebuyers face ambiguous Super Built-up (SBUA) vs. Carpet Area loading (often 25%–35%), artificial price-per-sq.ft inflation, unverified RERA numbers, pressure to transfer heavy "hold tokens" before title diligence, and asking rates that diverge significantly from official Government Circle Rates (Guidance Values).

---

## 2. FlatAudit Solution Architecture

```
Listing Page (NoBroker / MagicBricks / 99acres / Housing DOM)
   │  Content script reads visible text only (strict DOM selectors, 0 innerHTML)
   │  Detects listingType: 'rent' | 'sale' (Crores, Lakhs, Sq.ft, Carpet vs SBUA)
   ▼
FlatAudit Extension (Manifest V3)
   │  OffscreenCanvas ─────────▶ 64-bit dHash (difference hash fingerprint)
   │  Local Rule Engine ───────▶ Price z-score, deposit ratio, advance-fee phrases
   │  Buying Evaluator ────────▶ Circle rate (Guidance Value) delta, RERA link-out, token checks
   │  Fallback Ladder ─────────▶ Peer Page ➔ Area Cell ➔ District ➔ City ➔ Silence
   │  Local-First Tracker ─────▶ Price history snapshots, SVG sparkline, notes, EMI calculator
   ▼
FastAPI Backend (Port 8000 / Configurable) ──▶ SQLite Registry (flataudit.db)
   │  Stores ONLY: portal, listing_key, listing_type, locality, BHK, price/rent, deposit, area, floor, 16-hex image hash
   │  Cross-portal matching ───▶ Detects "Also listed on Portal B at ₹X (Save ₹Y)"
   │  Static Market Packs ─────▶ Aggregates trimmed medians with ETag caching (Zero PII)
   │  (Zero photos, zero names, zero phone numbers stored)
   ▼
In-Page Floating Badge & Toolbar Popup
   ├─ Tab 1: Trust Signals (Observable facts only; positive verification points; safety tips)
   ├─ Buying View: Guidance value reference, official RERA link-outs, Buyer Due Diligence checklist
   ├─ Tab 2: Watchlist & Compare (Inline SVG sparklines, price drops, side-by-side comparison, CSV export)
   └─ Footer: "🚩 This looks wrong?" (Subtle anonymous diagnostic feedback to local storage)
```

---

## 3. Core Technical Features

### 🛡️ Trust & Safety Engine
- **64-bit Perceptual Difference Hash (`dHash`)**: Downscales photos to $9 \times 8$ grayscale and tracks horizontal pixel gradients to generate a 16-hex char fingerprint. Calculates Hamming distance to detect stolen/reused photos across listings with $\le 10$ bits tolerance.
- **CORS-Safe Background Processing**: Utilizes service worker `createImageBitmap` and `OffscreenCanvas` with host permissions to eliminate canvas tainting from cross-origin CDN images without saving or uploading images.
- **Dynamic 5-Step Benchmark Fallback Ladder**: Replaces hardcoded rupee thresholds with non-parametric statistics (Median & Median Absolute Deviation) evaluated across:
  1. *Level 1: Peer Page* ($n \ge 6$ listings on active search/carousel — works on day one in any Indian city).
  2. *Level 2: Area Cell* (fine geohash ~1–5 km or fine locality pack, $n \ge 10$).
  3. *Level 3: District Cell* (parent geohash prefix ~20–40 km, $n \ge 8$).
  4. *Level 4: City Baseline* (metro aggregate, $n \ge 5$).
  5. *Level 5: Silence Mode* (suppresses false price alarms when local data is sparse).
- **Observable-Facts Explanations**: Adheres to strict anti-defamation principles. Badges state verifiable evidence (e.g. *"Rent is 77% below HSR Layout 3BHK median"*, *"Photo fingerprint appeared across 4 distinct listings"*) without defamatory accusations.
- **Positive Verification on Normal Listings**: Even when zero red flags fire, properties receive 4 verified points confirming price alignment, standard deposit ratio, and clean phrasing.

### 🏠 Property Buying & Resale Transparency (Pilot: Bengaluru)
- **Crore & Lakh Currency Normalization**: Extracts total asking price across Indian currency variants (`₹1.25 Cr`, `1.45 Crore`, `85 Lacs`, `₹95,00,000`) and parses normalized price per sq.ft (`₹10,162 / sq.ft`).
- **Strict Area Type Integrity**: Distinguishes between Carpet Area, Built-up Area, and Super Built-up Area (SBUA) to prevent misleading price-per-sq.ft comparisons across incompatible definitions.
- **Government Circle Rates / Guidance Values**: Bundles official Karnataka Stamps & Registration Department (Kaveri 2.0) minimum guidance values for Bengaluru zones (Indiranagar: ₹11,500/sqft, HSR Layout: ₹8,800/sqft, Electronic City: ₹5,200/sqft, Whitefield: ₹6,400/sqft, Koramangala: ₹12,000/sqft, Bellandur: ₹7,100/sqft). Highlights asking prices that are suspiciously below circle rates (>35% below, flagging potential unapproved layouts or tax evasion).
- **Official State RERA Link-Outs**: Extracts state RERA registration IDs (`PRM/KA/RERA/...`, `HRERA...`, `MahaRERA...`) and embeds direct verification links to official state authority search portals rather than brittle web scraping.
- **Buyer Due Diligence Checklist**: In-drawer actionable 5-step checklist covering Title Deed clearance, Encumbrance Certificate (15–30 yrs), Occupancy Certificate (OC/CC), Physical carpet area tape measurement, and Official RERA confirmation.
- **Strict Legal Disclaimer Guardrails**: Plainly states: *"FlatAudit provides informational signals from visible listing data and official guidance values. It does not constitute legal or financial advice and does not verify property title deeds."*
- **Loan EMI Amortization Calculator**: In-memory standard banking amortization formula for monthly EMI, total interest, and payment breakdown based on property price, loan tenure, and interest rate.

### 📈 Buyhatke-Style Property Companion
- **Price History Inline SVG Sparkline**: Pure mathematical SVG curve with gradient fill rendered directly in the DOM without external charting dependencies.
- **Local-First Watchlist**: Stores snapshots `{t, rent, deposit, price, pricePerSqft, listed}` in `chrome.storage.local`. Re-records snapshots only when price/rent changes or >24 hours pass.
- **Price-Drop Alerts**: Prominently highlights rent/price reductions upon revisit (e.g., *"🎉 Price dropped ₹5,00,000 (-4%) since first viewed"*).
- **Side-by-Side Comparison Matrix**: Select 2 to 4 listings to view an automated comparison of Price/Rent, Area (sq.ft), Price/sq.ft, Possession, RERA status, and Risk Flags with best values highlighted.
- **Cross-Portal Duplicate Matching**: Matches properties across portals using image dHash distance $\le 8$, same locality & BHK, price within 5%, and area within 3%. Requires at least 2 independent signals and shows honest phrasing (*"Likely the same property listed on MagicBricks at ₹40,000"*).
- **Shortlist CSV Export**: One-click download of saved shortlist with user notes and market status.

---

## 4. Evaluation Benchmarks & Zero Rule Drift

FlatAudit maintains an automated single-source-of-truth evaluation bridge (`eval/evaluate.py` via `eval/run_signals.js`) that directly invokes production JavaScript (`extension/lib/signals.js`), guaranteeing **0.0% rule drift**.

We evaluate the system across two separate datasets:

### Dataset A: Synthetic Unit-Test Benchmark (`eval/labels.csv`)
Engineered edge cases, currency variants, and deliberate threat archetypes across 4 cities:

| Metric | Result | Target |
| :--- | :--- | :--- |
| **Accuracy** | **97.3%** | > 85.0% |
| **Precision** | **95.1%** | > 85.0% |
| **Recall** | **100.0%** | > 70.0% |
| **F1-Score** | **0.975** | > 0.800 |
| **False Negatives** | **0** | 0 |
| **Rule Drift** | **0.0%** | 0.0% |

*Detailed breakdown in [`eval/evaluation_results.md`](eval/evaluation_results.md).*

### Dataset B: Real-World Multi-City Dataset (`eval/real_listings.csv`)
30 sanitized, real listings collected across **Bengaluru, Mumbai, Gurgaon, Hyderabad, and Pune**:

| Metric | Result | Target |
| :--- | :--- | :--- |
| **Accuracy** | **100.0%** | > 90.0% |
| **Precision** | **100.0%** | > 85.0% |
| **Recall** | **100.0%** | > 75.0% |
| **False Positives** | **0** | < 5% |
| **False Negatives** | **0** | 0 |
| **Cities Covered** | **5 metros** | $\ge 3$ metros |

*Detailed breakdown in [`eval/evaluation_real_results.md`](eval/evaluation_real_results.md). Community labeling template available in [`eval/labeling_template.csv`](eval/labeling_template.csv).*

---

## 5. Quickstart Guide

### Step 1: Clone & Install Dependencies
```bash
git clone https://github.com/aditya/FlatAudit.git
cd FlatAudit

# Install Node dependencies (test runner & demo)
npm install

# Install Python backend dependencies
python -m pip install -r backend/requirements.txt
```

### Step 2: Run Unit & Integration Tests
```bash
# Run 69 JavaScript unit & parser health tests
npm test

# Run 11 Python API, SQLite & Market Pack tests
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

### Step 4: Launch the Interactive Web Demo
```bash
npm run demo
```
*Open [http://localhost:8080](http://localhost:8080) to inspect preset listings, evaluate custom text, simulate price drops, view real-time SVG sparklines, compare properties, and test fallback ladder tiers.*

### Step 5: Load the Chrome Extension
1. Open Google Chrome and navigate to `chrome://extensions/`.
2. Enable **Developer mode** (top-right toggle).
3. Click **Load unpacked** and select the `extension/` directory.
4. Open any fixture in `fixtures/` or a live portal listing to view the trust badge and Buyhatke price tracker!

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
│   ├── styles.css             # Injected badge, facts drawer & sparkline styles
│   ├── icons/                 # Official extension icons (16px, 48px, 128px)
│   ├── popup/                 # Toolbar popup (Trust + Watchlist tabs)
│   └── lib/
│       ├── dhash.js           # 64-bit dHash & bitwise Hamming distance
│       ├── signals.js         # Single-source-of-truth signal engine
│       ├── benchmarks.js      # Dynamic 5-step fallback ladder, circle rates & RERA links
│       ├── geohash.js         # Base32 geohash encoder & DOM coordinate extractor
│       ├── tracker.js         # Buyhatke watchlist, SVG sparklines, compare & EMI calculator
│       ├── data/
│       │   ├── market_packs.json    # Aggregated fallback market statistics
│       │   └── guidance_values.json # Karnataka Kaveri 2.0 government circle rates
│       └── parsers/           # NoBroker, MagicBricks, 99acres, Housing parsers
├── backend/                   # FastAPI + SQLite Registry
│   ├── main.py                # REST endpoints: /observe, /seen, /matches, /packs
│   ├── db.py                  # SQLite storage & cross-portal duplicate matching
│   ├── build_packs.py         # Batch pack generator (trimmed stats, zero PII)
│   ├── models.py              # Pydantic data schemas (rent & sale listings)
│   └── tests/                 # Pytest test suite (11 tests)
├── fixtures/                  # Real-world HTML test fixtures (6 portal & resale formats)
├── eval/                      # Evaluation datasets & test runners
│   ├── labels.csv             # Synthetic Unit-Test Dataset (250 listings)
│   ├── real_listings.csv      # Real-World Multi-City Dataset (30 listings, 5 cities)
│   ├── labeling_template.csv  # Contributor annotation template
│   ├── evaluate.py            # Zero-drift evaluation runner
│   └── run_signals.js         # Node subprocess bridge to signals.js
├── docs/                      # Security & Engineering Documentation
│   ├── zero_context_blueprint.md     # Architectural reconstruction blueprint
│   ├── threat-model.md        # Full STRIDE threat model
│   ├── privacy-policy.md      # Plain-language privacy commitments
│   ├── store-listing.md       # Chrome Web Store listing & asset specification
│   ├── engineering-retrospective-v1.md # Lessons learned & retrospective
│   ├── architecture.md        # Architecture diagrams
│   └── scam-taxonomy.md       # Rental fraud kill chain breakdown
├── tests/                     # Node.js test suite (69 tests passing)
├── web-demo/                  # Standalone interactive browser testbed
└── package.json
```

---

## 8. Permissions & Privacy by Design

### Chrome Permissions Justification

| Permission | Justification | Privacy Safeguard |
| :--- | :--- | :--- |
| `storage` | Stores watchlist listings, price snapshots, and anonymous feedback. | Sandboxed strictly in `chrome.storage.local`. Nothing leaves the browser. |
| `host_permissions` (`*.nobroker.in/*`, `*.magicbricks.com/*`, `*.99acres.com/*`, `*.housing.com/*`) | Allows content script injection on supported portals and enables background `createImageBitmap` for local dHash computation without canvas tainting. | Only active on supported rental pages. Zero automated web crawling. |
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
