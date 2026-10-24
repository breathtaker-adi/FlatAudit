# FlatAudit: Project Progress Report & Zero-Context Reconstruction Blueprint

**Author**: Principal Software Architect & Lead Security Engineer  
**Project**: FlatAudit (Listing Trust Analyzer & Buyhatke Property Companion)  
**Target Audience**: Autonomous AI Coding Agents / Senior Software Engineers  
**Context Requirement**: Zero prior context required for full system reconstruction.

---

## 1. Project Overview & Architecture

### Core Purpose
**FlatAudit (Listing Trust Analyzer & Buyhatke Property Companion)** is a privacy-preserving cybersecurity browser extension and lightweight analytics backend engineered to protect Indian urban home seekers from structured advance-fee rental fraud on major listing portals (*NoBroker*, *MagicBricks*, *99acres*, *Housing.com*), while serving as a **Buyhatke-style companion for property**: tracking rent price history, alerting to price drops, rendering inline SVG sparklines, comparing shortlisted properties side-by-side, and calculating every-city benchmarks without hardcoding.

The application addresses the "Rental Scam Kill Chain":
1. **Fake Listing**: Malicious actors post stolen photos of luxury apartments at 40%–70% below local market rent (bait pricing).
2. **Lead Capture**: Urgent, high-pressure copy ("Owner leaving country tonight", "14 people queued") designed to capture desperate tenants.
3. **The Pretext**: The poster impersonates an Indian Army, Air Force, CISF, or CRPF defense officer transferred urgently to a border cantonment, or an absentee NRI landlord in London.
4. **Advance-Fee Extortion**: The poster demands an upfront "gate entry pass", "visiting card registration slip", or "refundable viewing token" (₹1,500–₹3,500) via UPI QR code before permitting an in-person physical viewing.

**Primary Workflows**:
- **In-Page Passive Trust Audit**: Content script detects rental pages, reads visible fields (title, rent, deposit, BHK, locality, coordinates, description, photos), evaluates 4 threat signal dimensions, queries the local perceptual hash registry, and injects a non-defamatory, objective trust badge and expandable drawer.
- **Dynamic 5-Step Benchmark Fallback Ladder**: Discards fixed rupee thresholds; judges listings strictly relative to peers using robust non-parametric statistics (Median & MAD) across 5 hierarchical levels:
  - **Level 1: Peer Page** (same-BHK listings seen on current search results or similar carousel, $n \ge 6$) — works immediately in any Indian city on day one without server dependency.
  - **Level 2: Area Cell** (fine geohash ~1–5 km or fine locality pack, $n \ge 10$).
  - **Level 3: District Cell** (parent geohash prefix ~20–40 km, $n \ge 8$).
  - **Level 4: City Baseline** (metro aggregate, $n \ge 5$).
  - **Level 5: None / Silence Mode** (when local data is thin/absent: stays silent, suppresses price outlier alarms, and runs only non-price signals).
- **Buyhatke Property Companion**:
  - Tracks rental listings in `chrome.storage.local`.
  - Captures timestamped price snapshots on revisits and flags rent drops (`↓ ₹2,000 (-5.0%)`).
  - Generates zero-dependency inline SVG sparklines depicting price trajectory over time.
  - Formats human-readable time-on-market ("Listed 14 days ago").
  - Builds side-by-side comparison matrix with automated best-value tagging (lowest rent, lowest deposit ratio, lowest price per sq.ft.).
  - Exports shortlists directly to valid CSV text.
- **Property Buying & Resale Transparency (Pilot: Bengaluru)**:
  - Supports `listingType: 'sale'` with Crore (`₹1.25 Cr`), Lakh, and Price/sq.ft (`₹10,162 / sq.ft`) normalization.
  - Strict area type integrity: differentiates Carpet Area, Built-up Area, and Super Built-up Area (SBUA).
  - Integrates official Karnataka Stamps & Registration Department (Kaveri 2.0) minimum guidance values (circle rates) per square foot to detect severe under-valuation anomalies (>35% below circle rate).
  - Official state RERA link-outs (K-RERA, MahaRERA, HRERA, TS-RERA) direct to official authority portals.
  - Actionable in-drawer Buyer Due Diligence checklist (Title deed, 30-year Encumbrance Certificate, OC/CC, physical carpet tape measurement) and visible legal disclaimer.
  - Built-in loan EMI amortization calculator (`calculateEMI`).
- **Cross-Portal Duplicate Price Matching**: Detects identical or sister listings across portals (e.g., NoBroker vs. MagicBricks) to reveal pricing discrepancies ("Also listed on Portal B for ₹3,000 less").
- **Offline & Low-Bandwidth Resilience**: Offline-first client architecture using local `chrome.storage.local` cache and static market packs with ETag and 24-hour TTL caching.
- **Interactive Web Demo & Testbed**: Standalone browser dashboard for testing arbitrary listings, inspecting dHash Hamming distances live, switching fallback ladder tiers, simulating sale properties, and tracking watchlists.

### Tech Stack
- **JavaScript Runtime**: Node.js v20+ / v26.8.1 (Native test runner via `node --test`, native ES modules `"type": "module"`).
- **Browser Extension Platform**: Google Chrome Manifest V3 (MV3) with Service Worker background execution and Content Scripts.
- **Backend Framework**: Python 3.10+ / Python 3.14.0, FastAPI 0.110+ (`fastapi`), Starlette 1.6+, Uvicorn 0.28+ (`uvicorn[standard]`).
- **Data Validation & Schemas**: Pydantic v2 (`pydantic>=2.0.0`).
- **Database Layer**: SQLite 3 (Standard Library `sqlite3`) with WAL journal mode, parameterized queries, and daily deduplication.
- **DOM Parsing & Simulation**: Native browser DOM APIs (`document.querySelector`, `MutationObserver`, `OffscreenCanvas`) in extension; `jsdom` for Node.js test suites.
- **Testing Frameworks**: `node:test` + `node:assert/strict` (Frontend/Extension: 69 tests passing across 20 suites); `pytest` 8.0+ with `httpx` (Backend API: 11 tests passing).
- **Styling Architecture**: Curated Dark-Mode Vanilla CSS (HSL tokens, glassmorphism, responsive CSS Grid/Flexbox, zero runtime styling overhead, Google Fonts *Bricolage Grotesque*, *Instrument Sans*, *JetBrains Mono*).

### Architectural Pattern
FlatAudit adopts an **Edge-Filtered Asymmetric Client-Server Architecture** designed around **Privacy by Design**:
- **Client-Side Edge Filtering (Extension Content Script & Worker)**: Pure rule evaluation, currency normalization, and 64-bit dHash generation happen locally in the user's browser. Untrusted DOM inputs are sanitized using strict `.textContent` assignment (zero `innerHTML`).
- **CORS-Isolated Perceptual Worker**: Image binaries are fetched exclusively within the background service worker using host permissions and drawn directly to an `OffscreenCanvas(9, 8)`. Raw images are **never** written to disk or transmitted across the network.
- **Asymmetric API & Static Pack Publisher (FastAPI + SQLite)**: The backend operates strictly as an anonymized hash index, cross-portal matching engine, and static market pack generator. It stores only anonymous primitive fields: `portal`, `listing_key`, `listing_type`, `locality`, `bhk`, `rent`, `deposit`, `price`, `price_per_sqft`, `area_sqft`, `area_type`, `possession_status`, `rera_id`, `floor`, `geohash`, `image_hash`, and `day`. No user identifiers, contact numbers, names, or image binaries are ever stored.

```
┌────────────────────────────────────────────────────────┐
│            Rental Listing DOM (Web Page)               │
│   (NoBroker, MagicBricks, 99acres, Housing, Fixture)   │
└──────────────────────────┬─────────────────────────────┘
                           │ Content script extracts visible fields
                           ▼
┌────────────────────────────────────────────────────────┐
│            FlatAudit Extension (Manifest V3)           │
│                                                        │
│  ┌────────────────────────┐  ┌──────────────────────┐  │
│  │   extractListing()     │  │  analyzeListing()    │  │
│  │ (Currency/BHK/Coords)  │─▶│ - Price (Ladder 1-5) │  │
│  └────────────────────────┘  │ - Deposit Ratio      │  │
│                              │ - Advance-Fee Terms  │  │
│  ┌────────────────────────┐  │ - Image Duplicate    │  │
│  │ Background Worker      │  └──────────┬───────────┘  │
│  │ OffscreenCanvas (9x8)  │─────────────┘              │
│  │ 64-bit dHash Engine    │                            │
│  └────────────────────────┘                            │
│                                                        │
│  ┌──────────────────────────────────────────────────┐  │
│  │ Buyhatke Tracker & Local Watchlist Cache         │  │
│  │ - Price Snapshots & Sparkline SVG Generator      │  │
│  │ - Comparison Matrix & CSV Exporter               │  │
│  └──────────────────────────────────────────────────┘  │
└──────────────┬───────────────────────────┬─────────────┘
               │ Query duplicate count     │ Safe In-Page Injection
               │ & record observation      │ (Zero innerHTML)
               ▼                           ▼
┌───────────────────────────────┐ ┌──────────────────────┐
│  FastAPI Backend (Port 8000)  │ │ FlatAudit UI Drawer  │
│  - POST /api/v1/observe       │ │ - Status Badge       │
│  - GET  /api/v1/seen          │ │ - Sparkline / Price  │
│  - GET  /api/v1/matches       │ │ - Benchmark Ladder   │
│  - GET  /api/v1/packs/{cell}  │ │ - Points & Reasons   │
│  - SQLite (flataudit.db)      │ │ - Safety Advice      │
└───────────────────────────────┘ └──────────────────────┘
```

---

## 2. Annotated File & Directory Structure

### Visual File Tree
```
FlatAudit/
├── .gitignore
├── LICENSE
├── package.json
├── package-lock.json
├── README.md
├── Build Plan_ Listing Trust Analyzer (1).html
├── Listing Trust Analyzer_ Project Document.html
├── backend/
│   ├── build_packs.py          # Market pack aggregation batch job (trimmed stats, zero-PII)
│   ├── config.py               # Database paths, CORS origins
│   ├── db.py                   # SQLite schema, migration, deduplication, Hamming distance
│   ├── flataudit.db            # SQLite database file (deduped observations)
│   ├── main.py                 # FastAPI application, REST endpoints, static packs with ETag
│   ├── models.py               # Pydantic schemas (ObservationCreate, AnalyzeRequest, etc.)
│   ├── requirements.txt        # Python backend dependencies
│   ├── packs/                  # Static JSON market packs directory (index.json, {cell}.json)
│   └── tests/
│       ├── test_api.py         # Pytest API integration tests
│       ├── test_db.py          # Pytest SQLite unit tests
│       └── test_packs.py       # Pytest market pack aggregator & zero-PII validation tests
├── docs/
│   ├── architecture.md
│   ├── engineering-retrospective-v1.md # Technical retrospective and lessons learned
│   ├── privacy-policy.md       # Plain-language user privacy and ToS statement
│   ├── scam-taxonomy.md
│   ├── store-listing.md        # Chrome Web Store listing, permissions & asset spec
│   ├── threat-model.md         # Full STRIDE threat model
│   └── zero_context_blueprint.md
├── eval/
│   ├── evaluate.py             # Single-source-of-truth evaluator (0.0% rule drift)
│   ├── evaluation_results.md   # Synthetic benchmark report (97.3% accuracy, 95.1% precision)
│   ├── evaluation_real_results.md # Real-world multi-city report (100% accuracy, 5 cities)
│   ├── generate_dataset.py     # Deterministic 250-listing synthetic dataset generator
│   ├── labeling-guide.md       # Empirical annotation taxonomy manual
│   ├── labeling_template.csv   # Contributor labeling template
│   ├── labels.csv              # Synthetic Unit-Test Dataset (250 listings)
│   ├── real_listings.csv       # Real-World Multi-City Dataset (30 listings, 5 cities)
│   └── run_signals.js          # Node bridge executing production signals.js for Python eval
├── extension/
│   ├── background.js           # MV3 background worker (OffscreenCanvas dHash, API proxy)
│   ├── content.js              # Injected content script (badge, drawer, peer cache, Buyhatke card)
│   ├── icons/                  # Extension PNG icons (16px, 48px, 128px)
│   ├── manifest.json           # Chrome MV3 manifest declaration
│   ├── styles.css              # Dark-mode styling for injected badge, drawer, sparklines
│   ├── lib/
│   │   ├── benchmarks.js       # Dynamic benchmark ladder engine, circle rates & RERA links
│   │   ├── dhash.js            # 64-bit difference hash & bitwise Hamming distance
│   │   ├── geohash.js          # Base32 geohash encoder/decoder & coordinate DOM extractor
│   │   ├── signals.js          # Rule-based evaluation engine (price, deposit, phrase, duplicate, sale valuation, RERA)
│   │   ├── tracker.js          # Buyhatke tracker (watchlist, snapshots, sparklines, CSV export, EMI calculator)
│   │   ├── data/
│   │   │   ├── market_packs.json    # Static rental market packs (medians, MAD, PSF, deposit multiples)
│   │   │   └── guidance_values.json # Karnataka Kaveri 2.0 government circle rates (Indiranagar, HSR, E-City, etc.)
│   │   └── parsers/
│   │       ├── currency.js     # Currency normalizer (₹, Lakhs, Crores, Price/sq.ft, Area Type, Possession, RERA)
│   │       ├── generic.js      # Heuristic fallback extractor
│   │       ├── housing.js      # Housing.com extractor
│   │       ├── index.js        # Parser router, isListingValid & parsePeerListingsFromPage
│   │       ├── magicbricks.js  # MagicBricks extractor
│   │       ├── ninety_nine_acres.js # 99acres extractor
│   │       └── nobroker.js     # NoBroker extractor (Rent + Sale properties)
│   └── popup/
│       ├── popup.css           # Toolbar popup dark styling
│       ├── popup.html          # Toolbar popup HTML interface
│       └── popup.js            # Toolbar controller (Trust signals, Buyhatke watchlist, compare)
├── fixtures/
│   ├── 99acres_normal_1bhk.html
│   ├── housing_duplicate_photos.html
│   ├── magicbricks_bait_price.html
│   ├── nobroker_normal_2bhk.html
│   ├── nobroker_scam_army_token.html
│   └── nobroker_sale_resale_2bhk.html # Sanitized 2BHK resale flat fixture (₹1.25 Cr, carpet area, RERA registered)
├── tests/
│   ├── test_benchmarks.test.js # Unit tests for geohash, MAD, fallback ladder, silence mode, pack validator
│   ├── test_dhash.test.js      # Unit tests for 64-bit dHash and Hamming distance
│   ├── test_parsers.test.js    # Multi-portal fixture parsing, sale parsing & health integrity tests
│   ├── test_signals.test.js    # Signal evaluation rules, circle rates, RERA & composite analysis tests
│   └── test_tracker.test.js    # Buyhatke watchlist, sparklines, comparison, CSV export & EMI calculator tests
└── web-demo/
    ├── app.js                  # Standalone testbed logic & Buyhatke companion simulator
    ├── index.html              # Interactive browser dashboard (presets, ladder modes)
    └── style.css               # Vanilla CSS styling for web demo
```

---

## 3. Database Information & Complete Schema

### Database Engine & Query Architecture
- **Engine**: SQLite 3 (`backend/flataudit.db`).
- **Connection Method**: Standard library `sqlite3` with `conn.row_factory = sqlite3.Row`.
- **Concurrency & Integrity**: Thread-safe parameterized queries with daily deduplication constraint (`UNIQUE(portal, listing_key, day)`).

### Complete DDL Schema Definition

```sql
-- Listing Observations Registry Table (Rent & Sale Properties)
CREATE TABLE IF NOT EXISTS observations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    portal TEXT,
    listing_key TEXT,
    url_hash TEXT,
    listing_type TEXT DEFAULT 'rent',
    locality TEXT,
    bhk INTEGER,
    rent INTEGER,
    deposit INTEGER,
    price INTEGER,
    price_per_sqft INTEGER,
    area_sqft INTEGER,
    area_type TEXT,
    possession_status TEXT,
    rera_id TEXT,
    floor INTEGER,
    image_hash TEXT,
    geohash TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    day TEXT DEFAULT (date('now'))
);

-- Performance & Deduplication Indexes
CREATE INDEX IF NOT EXISTS idx_image_hash ON observations(image_hash);
CREATE INDEX IF NOT EXISTS idx_locality_bhk ON observations(locality, bhk);
CREATE INDEX IF NOT EXISTS idx_portal_listing ON observations(portal, listing_key);
CREATE INDEX IF NOT EXISTS idx_listing_type ON observations(listing_type);
CREATE INDEX IF NOT EXISTS idx_day ON observations(day);
CREATE INDEX IF NOT EXISTS idx_geohash ON observations(geohash);
```

#### Field Specifications:
1. `id` (`INTEGER PRIMARY KEY AUTOINCREMENT`): Unique numeric record identifier.
2. `portal` (`TEXT`): Portal origin (`nobroker`, `magicbricks`, `99acres`, `housing`).
3. `listing_key` (`TEXT`): Normalized listing key (e.g. `nobroker:58a3654f`).
4. `url_hash` (`TEXT`): First 16 hex characters of SHA-256 hash of URL.
5. `listing_type` (`TEXT`): Property classification (`'rent'` or `'sale'`).
6. `locality` (`TEXT`): Normalized, lowercase locality string.
7. `bhk` (`INTEGER`): Bedroom count (1 to 5).
8. `rent` (`INTEGER`): Monthly asking rent in INR (rent listings).
9. `deposit` (`INTEGER`): Security deposit in INR (rent listings).
10. `price` (`INTEGER`): Total asking sale price in INR (e.g., `12500000` for ₹1.25 Cr).
11. `price_per_sqft` (`INTEGER`): Normalized rate in ₹ per sq.ft.
12. `area_sqft` (`INTEGER`): Super built-up or carpet area in square feet.
13. `area_type` (`TEXT`): Area specification (`'carpet'`, `'builtup'`, `'super_builtup'`).
14. `possession_status` (`TEXT`): Status (`'ready_to_move'`, `'under_construction'`).
15. `rera_id` (`TEXT`): State Real Estate Regulatory Authority ID.
16. `floor` (`INTEGER`): Floor number.
17. `image_hash` (`TEXT`): 16-hex char perceptual dHash of primary photo.
18. `geohash` (`TEXT`): Base32 spatial geohash (length 4–6).
19. `day` (`TEXT`): Observation date (`YYYY-MM-DD`) for daily deduplication.

### Government Circle Rate / Guidance Values Schema (`extension/lib/data/guidance_values.json`)
Official minimum registration values published by state revenue departments:
```json
{
  "state": "Karnataka",
  "authority": "Department of Stamps and Registration, Government of Karnataka (Kaveri 2.0)",
  "effective_date": "2024-02-01",
  "disclaimer": "Official government guidance value is the minimum reference value for stamp duty and registration. It does not represent open market value.",
  "zones": {
    "electronic city": {
      "rate_per_sqft": 5200,
      "zone": "Electronic City Phase 1 & 2",
      "currency": "INR"
    },
    "indiranagar": {
      "rate_per_sqft": 11500,
      "zone": "Indiranagar (100ft Rd / CMH Rd / HAL 2nd Stage)",
      "currency": "INR"
    }
  }
}
```

### Market Pack JSON Schema (`backend/packs/{cell}.json`)
Static market packs are generated without personal data or raw listings:
```json
{
  "v": 1,
  "cell": "tdr1y",
  "level": "area_cell",
  "name": "Indiranagar",
  "updated": "2026-10-25",
  "window_days": 90,
  "total_observations": 104,
  "bhk": {
    "2": {
      "n": 48,
      "p25": 36000,
      "median": 40000,
      "p75": 44000,
      "mad": 4000,
      "psf_median": 34.0
    }
  },
  "deposit_multiple": {
    "n": 48,
    "p10": 2.5,
    "median": 4.0,
    "p90": 6.0,
    "min": 2.0,
    "max": 6.5
  }
}
```

### Buyhatke Local Watchlist Storage Schema (`chrome.storage.local`)
Stored under key `flataudit_tracked_listings`:
```json
{
  "nobroker:58a3654f": {
    "key": "nobroker:58a3654f",
    "portal": "nobroker",
    "title": "2 BHK Flat in Indiranagar",
    "url": "https://www.nobroker.in/...",
    "locality": "Indiranagar",
    "bhk": 2,
    "area_sqft": 1200,
    "currentRent": 38000,
    "initialRent": 40000,
    "deposit": 150000,
    "status": "Interested",
    "note": "Spoke to security guard; flat vacant.",
    "firstSeen": 1729800000000,
    "lastSeen": 1729860000000,
    "snapshots": [
      { "t": 1729800000000, "rent": 40000 },
      { "t": 1729860000000, "rent": 38000 }
    ]
  }
}
```

---

## 4. Core Business Logic & Signal Rules

### The 5-Step Dynamic Benchmark Fallback Ladder
FlatAudit discards hardcoded rupee numbers in code. When evaluating rent and deposit, `getBenchmark(listing, context)` walks the 5-step ladder:
1. **Level 1: Peer Page**
   - Harvested from search cards or "similar properties" carousel on the active page via `parsePeerListingsFromPage`.
   - Condition: $n \ge 6$ same-BHK listings.
   - User Label: `"vs 14 same-BHK listings on this page"` (High confidence).
2. **Level 2: Area Cell**
   - Geohash prefix length 5 (~1–5 km) or fine locality pack.
   - Condition: $n \ge 10$ in the last 90 days.
   - User Label: `"vs 23 listings nearby in Indiranagar"` (High confidence).
3. **Level 3: District Cell**
   - Parent geohash prefix length 4 (~20–40 km).
   - Condition: $n \ge 8$.
   - User Label: `"vs 61 listings in wider area"` (Medium confidence).
4. **Level 4: City Baseline**
   - City-wide metro aggregate by BHK.
   - Condition: $n \ge 5$.
   - User Label: `"vs Bengaluru city-wide median (sample size: 80)"` (Low confidence).
5. **Level 5: None (Silence Mode)**
   - Used when all layers above have $n < 5$.
   - User Label: `"Not enough local data"`.
   - **Crucial Ethical Rule**: Suppresses price red flags entirely to prevent false accusations. Non-price signals (advance-fee phrases, stolen duplicate photos, zero deposit traps) continue protecting the user.

### Robust Statistics Math
- **Median**: Exact middle value of sorted observations (or mean of two central values).
- **MAD (Median Absolute Deviation)**: $\text{MAD} = \text{median}(|x_i - \text{median}(X)|)$.
- **Robust Z-Score**: $z = \frac{x - \text{median}}{1.4826 \times \text{MAD}}$.
- **Price Outlier Trigger**: Fired if rent is $\ge 38\%$ below median or robust $z \le -2.5$.

### Buyhatke Property Companion Algorithms
- **Price Delta**: $\Delta = \text{currentRent} - \text{initialRent}$ (or $\Delta = \text{currentPrice} - \text{initialPrice}$ for sale listings).
- **Inline SVG Sparkline**: Generated natively in `extension/lib/tracker.js` using `<polyline>` coordinate interpolation without third-party chart libraries.
- **Comparison Matrix**: Evaluates side-by-side attributes across shortlisted properties and dynamically tags:
  - `best_rent` / `best_price`: Lowest asking rent or sale price.
  - `best_deposit`: Lowest deposit-to-rent multiple.
  - `best_psf`: Lowest rent or price per square foot.
- **CSV Export**: Emits standard RFC 4180 CSV with escaped string fields for instant Excel/Sheets import.

### Property Buying & Resale Valuation Algorithms
- **Guidance Value Delta**: $\text{Delta}_{\%} = \frac{\text{AskingPricePerSqFt} - \text{GuidanceValue}}{\text{GuidanceValue}} \times 100$.
  - An asking price $\ge 35\%$ below official circle rate triggers a severe valuation warning (potential unapproved layout or registration under-declaration).
- **Official RERA Portal Resolution**:
  - `PRM/KA/RERA/...` -> Karnataka RERA project search (`https://rera.karnataka.gov.in/`).
  - `P51...` / `MahaRERA` -> Maharashtra RERA search (`https://maharera.mahaonline.gov.in/`).
  - `HRERA...` -> Haryana RERA search (`https://haryanarera.gov.in/`).
  - `TS RERA...` -> Telangana RERA search (`https://rera.telangana.gov.in/`).
- **Loan EMI Amortization Algorithm (`calculateEMI`)**:
  - Monthly Interest Rate: $r = \frac{\text{AnnualRate}}{12 \times 100}$.
  - Number of Monthly Installments: $n = \text{TenureYears} \times 12$.
  - Equated Monthly Installment: $\text{EMI} = P \times \frac{r \times (1 + r)^n}{(1 + r)^n - 1}$.
  - Total Payment: $T = \text{EMI} \times n$.
  - Total Interest: $I = T - P$.

---

## 5. API Route Catalog

| Method | Path | Auth | Purpose |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/v1/health` | Public | Service health and privacy guarantee check |
| `POST` | `/api/v1/observe` | Public | Records anonymous listing observation (deduped per key per day, supports rent and sale) |
| `GET` | `/api/v1/seen` | Public | Queries duplicate listings for a 16-hex dHash within Hamming threshold |
| `GET` | `/api/v1/matches` | Public | Returns cross-portal matching properties with price delta |
| `GET` | `/api/v1/locality-stats` | Public | Locality empirical rent/deposit distributions |
| `GET` | `/api/v1/packs/index.json` | Public | Returns static market pack index with ETag and Cache-Control |
| `GET` | `/api/v1/packs/{cell}` | Public | Returns static zero-PII market pack for a geohash cell with ETag |
| `POST` | `/api/v1/analyze` | Public | Server-side listing trust evaluator |

---

## 6. Project Verification & Current State

### Automated Test Suites
- **JavaScript Test Suite (`node --test tests/*.test.js`)**:
  - **69 tests across 20 suites**: **100% PASS** (0 failures).
  - Geohash base32 encoding/decoding & DOM coordinate parsing.
  - Robust non-parametric statistics (Median, MAD, Robust z-score).
  - 5-Tier Fallback Ladder (Peer page, Area cell, District cell, City, Silence mode).
  - Market pack schema validation (`isValidMarketPack`).
  - 64-bit dHash perceptual fingerprinting & bitwise Hamming distance.
  - Indian currency, Lakh and Crore notation, Price/sq.ft, Area Types (carpet vs builtup), Possession, RERA ID, and BHK parsing.
  - Multi-portal DOM fixture parsing & parser health checks on all 5 portals plus NoBroker resale buying fixture.
  - Graceful degradation on malformed or empty DOMs without uncaught exceptions.
  - Threat detection rules (Price bait, deposit trap, military pretexts, duplicate photos, sale token pressure, title litigation flags).
  - Property buying evaluation (Guidance value comparison, circle rate under-valuation alerts, official RERA links).
  - Buyhatke tracking, snapshots, price drop delta, SVG sparklines, comparison matrix, CSV export, and loan EMI amortization calculations.
- **Python Backend Suite (`python -m pytest backend/tests/ -v`)**:
  - **11 tests**: **100% PASS** (0 failures).
  - API health, observation recording for rent and sale listings, seen count.
  - Cross-portal match duplicate matching.
  - SQLite database operations, Hamming distance, deduplication.
  - Market pack aggregation batch job, minimum contributor threshold enforcement, and zero-PII leak scan.
  - Static pack API ETag 304 caching.
- **Empirical Evaluation Pipelines**:
  - Direct execution of production `extension/lib/signals.js` via `eval/run_signals.js` (**0.0% rule drift**).
  - **Synthetic Unit-Test Dataset (`eval/labels.csv`, $n=250$)**:
    - Accuracy: **97.3%** | Precision: **95.1%** | Recall: **100.0%** | F1: **0.975** | False Negatives: **0**
  - **Real-World Multi-City Dataset (`eval/real_listings.csv`, $n=30$ across 5 cities)**:
    - Accuracy: **100.0%** | Precision: **100.0%** | Recall: **100.0%** | F1: **1.000** | False Positives: **0** | False Negatives: **0**

---

## 7. Step-by-Step Reconstruction Sequence

Follow these deterministic instructions to regenerate the entire codebase from scratch:

### Step 1: Initialize Project & Environment
```bash
git init
npm init -y
npm install --save-dev jsdom
python -m pip install fastapi "uvicorn[standard]" pydantic httpx pytest pillow
```

### Step 2: Establish Configuration Files
1. Create `package.json` with `"type": "module"`, `"test": "node --test tests/*.test.js"`, and `"demo"` script.
2. Create `backend/requirements.txt` with `fastapi`, `uvicorn[standard]`, `pydantic`, `httpx`, `pytest`, `pillow`.
3. Create `backend/config.py` declaring `DB_PATH` and `CORS_ORIGINS`.

### Step 3: Implement Core Extension Libraries
1. `extension/lib/geohash.js`: Implement `encodeGeohash`, `decodeGeohash`, and `parseCoordinatesFromPage` (JSON-LD, meta tags, map links, data attributes).
2. `extension/lib/dhash.js`: Implement `computeDHashFromGrayscale72`, `computeDHashFromImageData`, `hammingDistance`, `isDuplicateImage`.
3. `extension/lib/parsers/`: Implement `currency.js` (Crores, Lakhs, ₹, Price/sq.ft, Area Types, RERA ID, BHK) and portal parsers (`nobroker.js` with rent & sale extraction, `magicbricks.js`, `ninety_nine_acres.js`, `housing.js`, `generic.js`), plus `parsePeerListingsFromPage` and `isListingValid` health check in `index.js`.
4. `extension/lib/benchmarks.js`: Implement `computeMedian`, `computeMAD`, `robustZScore`, `computePeerAggregates`, `getBenchmark`, `getGuidanceValue`, and `getReraPortalUrl`.
5. `extension/lib/data/`: Bundle `market_packs.json` (medians, MAD, PSF medians, deposit multiples) and `guidance_values.json` (Karnataka Kaveri 2.0 circle rates).
6. `extension/lib/tracker.js`: Implement `StorageAdapter`, `trackListing`, `computePriceHistoryStats`, `generateSparklineSVG`, `buildComparisonMatrix`, `exportShortlistToCSV`, and `calculateEMI`.
7. `extension/lib/signals.js`: Wire dynamic benchmarks, robust z-scores, advance-fee phrases, buying signals (circle rate valuation, RERA verification, token pressure), buyer due diligence checklist, and silence mode on thin data.

### Step 4: Build Backend & Aggregation Engine
1. `backend/models.py`: Define Pydantic models for observations (supporting rent & sale), matches, packs, and analysis.
2. `backend/db.py`: Implement SQLite schema with migration columns (`listing_type`, `price`, `price_per_sqft`, `area_type`, `possession_status`, `rera_id`), daily deduplication, `record_observation`, `count_seen_hashes`, and `find_cross_portal_matches`.
3. `backend/build_packs.py`: Implement nightly aggregation job computing trimmed median, MAD, PSF median, and writing static packs with zero PII.
4. `backend/main.py`: Implement FastAPI endpoints (`/observe`, `/seen`, `/matches`, `/locality-stats`, `/analyze`, `/packs/index.json`, `/packs/{cell}` with ETag).

### Step 5: Implement UI & Extension Frontend
1. `extension/manifest.json`: Configure MV3 service worker and host permissions.
2. `extension/background.js`: Implement `OffscreenCanvas` dHash worker and backend proxy.
3. `extension/content.js`: Harvest search peers, cache search medians, render trust badge, fallback ladder badge, Buyhatke card, Buyer Due Diligence checklist, and RERA link-out button.
4. `extension/styles.css`: Dark-mode styling for badges, drawer, sparklines, comparison strip, and buyer checklist boxes.
5. `extension/popup/`: Popup controller displaying trust signals, benchmark ladder chip, and Buyhatke watchlist.
6. `web-demo/`: Standalone browser dashboard with preset listings (including 2BHK resale flat), ladder test selector, sparklines, and Hamming distance calculator.

### Step 6: Execute Full Test & Evaluation Verification
```bash
# 1. Run all 69 JavaScript tests
npm test

# 2. Run all 11 Python backend tests
python -m pytest backend/tests/ -v

# 3. Verify zero rule drift and benchmark accuracy on both datasets
python eval/evaluate.py --dataset eval/labels.csv
python eval/evaluate.py --dataset eval/real_listings.csv

# 4. Run nightly market pack generator
python backend/build_packs.py

# 5. Start web demo server
npm run demo
```
