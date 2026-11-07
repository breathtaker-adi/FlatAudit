# FlatAudit: Project Progress Report & Zero-Context Reconstruction Blueprint

**Author**: Principal Software Architect & Technical Lead  
**Project**: FlatAudit (Listing Trust Analyzer, Buyhatke Property Companion & Buyer Due Diligence Engine)  
**Target Audience**: Autonomous AI Coding Agents / Senior Software Engineers  
**Context Requirement**: Zero prior context required for full system reconstruction.  
**Version**: 1.0.0 (Production-Verified, S0–S10 Complete, Apple Design Overhaul Applied)  
**Date**: November 2026  

---

## 1. Project Overview & Architecture

### Core Purpose
**FlatAudit** is a privacy-preserving cybersecurity browser extension and lightweight analytics backend engineered to protect Indian urban home seekers from structured advance-fee rental and sale fraud on major Indian listing portals (**NoBroker**, **MagicBricks**, **99acres**, **Housing.com**), while serving as a **Buyhatke-style property companion** and **Buyer Due Diligence engine**.

#### Threat Model Addressed: The "Rental & Property Scam Kill Chain"
1. **Fake Listing Creation**: Fraudsters scrape legitimate property listings or stock interior photographs and post them at 40%–70% below prevailing market rates ("Bait Pricing").
2. **High-Pressure Lead Capture**: Urgency triggers are embedded ("Owner moving abroad tonight", "15 people visited today, pay token to block").
3. **Impersonation Pretext**: Posters claim to be armed forces officers (Army, Air Force, CISF, CRPF, BSF) stationed at remote border cantonments, defense personnel unable to physically show the flat, or absentee NRI landlords in the UK/US.
4. **Advance-Fee Extortion**: Victims are instructed to pay an upfront "gate pass fee", "military cantonment entry slip", "visiting card registration", or "refundable viewing token" (₹1,500–₹5,000) via UPI QR code before being permitted to view the flat. Once transferred, the scammer vanishes.
5. **Sale / Resale Traps**: Severe circle rate under-valuation (black money / unapproved layouts), missing RERA registration filings, delayed developer completions, and unverified Joint Development Agreements (JDA).

#### Primary Application Workflows
1. **In-Page Passive Trust Audit**:
   - Content script activates on listing detail pages across supported portals.
   - Parses visible fields: title, asking rent/price, security deposit, BHK, carpet/super built-up area, floor, description, coordinates, and photo elements.
   - Evaluates threat signals locally in-browser without transmitting listing content or personal data to remote servers.
   - Injects a non-defamatory, objective trust badge ("Looks normal", "Some signals", "Many signals") and an expandable drawer with observable factual observations.
2. **Dynamic 5-Step Benchmark Fallback Ladder**:
   - Discards rigid hardcoded rupee thresholds. Evaluates rents and prices relative to empirical distributions using robust non-parametric statistics (Median & Median Absolute Deviation - MAD) across 5 hierarchical levels:
     - **Level 1: Peer Page**: Harvested from search result cards or "similar properties" carousels on the active page ($n \ge 6$). Works immediately on day one in any Indian city without server dependency.
     - **Level 2: Area Cell**: Fine geohash cell (~1–5 km) or fine locality pack ($n \ge 10$).
     - **Level 3: District Cell**: Parent geohash prefix (~20–40 km, $n \ge 8$).
     - **Level 4: City Baseline**: Metro aggregate by BHK ($n \ge 5$).
     - **Level 5: None / Silence Mode**: If fewer than 5 observations exist, suppresses price red flags entirely to prevent false accusations, while continuing to evaluate non-price signals (advance-fee terms, duplicate stolen photos, zero-deposit traps).
3. **Buyhatke-Style Property Companion**:
   - Tracks listings in local storage (`chrome.storage.local`) under a unified key scheme.
   - Captures timestamped price snapshots on revisits and flags rent drops (`↓ ₹2,000 (-5.0%)`).
   - Generates zero-dependency inline SVG sparklines displaying price trajectory over time.
   - Computes time-on-market ("Listed 14 days ago").
   - Builds a side-by-side comparison matrix with automated best-value tagging (lowest rent, lowest deposit multiple, lowest price per sq.ft).
   - Exports shortlists directly to RFC 4180 CSV text.
4. **Buyer Mode Due Diligence (Pilot: Bengaluru & Rajasthan)**:
   - Supports `listingType: 'sale'` with Crore (`₹1.25 Cr`), Lakh, and Price/sq.ft (`₹10,162 / sq.ft`) normalization.
   - Differentiates Carpet Area, Built-up Area, and Super Built-up Area (SBUA).
   - Validates against official minimum guidance values (circle rates): Karnataka Kaveri 2.0 and Rajasthan DLC rates to flag severe under-valuation anomalies (>35% below circle rate).
   - Validates state RERA identifiers (K-RERA, Raj-RERA, MahaRERA, HRERA, TS-RERA) and links out directly to official authority search portals.
   - Categorizes property into 3 distinct workflows:
     - **Individual Resale**: Focuses on 30-year Encumbrance Certificate (EC), parent deed trail, occupancy certificate (OC), physical carpet measurement, and society NOC.
     - **Builder Floor**: Focuses on sanctioned floor plans, Joint Development Agreement (JDA), and Undivided Share (UDS) allocation.
     - **Developer Project / New Launch**: Focuses on RERA Form B affidavits, quarterly progress reports (QPR), promoter completion track record, and designated escrow account compliance.
   - In-drawer Buyer Due Diligence checklist and generator for a printable 1-page HTML Buyer Report for legal review.
   - Integrated loan EMI amortization calculator (`calculateEMI`).
5. **OpenStreetMap (OSM) Area Report (S0–S10)**:
   - Privacy-first infrastructure scoring evaluating 5 distinct categories: Healthcare, Daily Supplies, Commute & Transit, Safety & Environment, and Lifestyle & Community.
   - Strictly opt-in (`area_report_enabled` default `false`).
   - Rounds user coordinates to 3 decimal places (~100m grid) for location privacy before querying.
   - Caches responses in `chrome.storage.local` with a 14-day TTL and a 50-item LRU capacity.
   - Sensitivity-tuned city tier thresholds (Metro vs Tier-2/3).
   - Evaluates amenities via OpenStreetMap Overpass API, generating letter grades (A, B, C, D), metric scores (x/10), nearest distance measurements, and neutral map-fact drawbacks.
6. **Cross-Portal Duplicate Price Matching**:
   - Compares listings across portals using perceptual photo dHash and physical attributes (BHK, locality, floor, area) to uncover pricing discrepancies ("Also listed on MagicBricks for ₹3,000 less").

---

### Tech Stack

| Component | Technology | Version | Purpose |
| :--- | :--- | :--- | :--- |
| **Language (Frontend)** | JavaScript (ESM) | ES2022 / Node 20+ | Extension content scripts, background worker, popup, and core libraries |
| **Language (Backend)** | Python | 3.10+ / 3.14.0 | REST API, database access, pack aggregation, simulation, and evaluation |
| **Extension Platform** | Chrome Manifest V3 | MV3 | Privacy-preserving browser extension standard |
| **Backend Framework** | FastAPI | 0.110.0+ | High-performance asynchronous REST API framework |
| **ASGI Server** | Uvicorn | 0.28.0+ | ASGI server hosting FastAPI (`uvicorn[standard]`) |
| **Data Validation** | Pydantic | 2.0.0+ | Strict request/response schemas and feature parsing |
| **Database Engine** | SQLite 3 | Standard Library | Embedded ACID database with WAL journal mode and row factory |
| **DOM Parser (Tests)** | jsdom | 30.1.3 | Headless DOM parsing in Node.js test suites |
| **Test Runner (JS)** | `node:test` | Node.js Native | Zero-dependency native unit and integration test runner (270 tests) |
| **Test Assertions** | `node:assert/strict`| Node.js Native | Strict equality and deep assertion library |
| **Test Runner (Python)**| Pytest | 8.0.0+ | Backend unit, API, and Monte Carlo simulation testing (30 tests) |
| **HTTP Client (Python)**| HTTPX | 0.27.0+ | Asynchronous test client for FastAPI integration testing |
| **Image Processing** | Pillow (PIL) | 10.0.0+ | Perceptual image hashing in Python tooling |
| **Geospatial API** | OpenStreetMap Overpass | Overpass QL | Privacy-preserving public spatial infrastructure query engine |
| **Styling Architecture**| Vanilla CSS3 (Apple HIG)| Native | Dark-mode tokens, glassmorphism, responsive CSS Grid, Apple cyan `#38bdf8` and slate palette |

---

### Architectural Pattern

FlatAudit utilizes an **Edge-Filtered Asymmetric Client-Server Architecture** strictly bounded by **Privacy by Design**:

1. **Client-Side Edge Execution (Zero-Server Dependency)**:
   - Primary fraud rule evaluation, regex pattern matching, currency normalization, guidance circle rate comparison, and fallback ladder logic execute 100% locally in the browser extension.
   - DOM inputs are sanitized via `.textContent` assignment; `innerHTML` is strictly forbidden across all production scripts.
2. **CORS-Isolated Perceptual Worker**:
   - Listing photo binaries are fetched inside the Manifest V3 service worker using declared host permissions.
   - Raw pixels are drawn directly to an `OffscreenCanvas(9, 8)` and converted into a 64-bit difference hash (dHash).
   - Raw images are never saved to disk, never cached, and never transmitted over the network.
3. **Asymmetric Anonymized Hash Index (Backend)**:
   - The FastAPI backend stores only anonymous structural primitives: `portal`, `listing_key`, `listing_type`, `locality`, `bhk`, `rent`, `deposit`, `price`, `price_per_sqft`, `area_sqft`, `floor`, `geohash`, `image_hash`, and observation date `day`.
   - No user identifiers, names, phone numbers, email addresses, listing URLs, or image files are ever stored.
4. **Static Market Pack Caching**:
   - Backend periodically compiles static aggregated packs containing medians, MADs, and percentiles.
   - Clients consume static packs with HTTP `ETag` and `Cache-Control: public, max-age=86400`, allowing 304 Not Modified caching without server compute load.

```
┌────────────────────────────────────────────────────────┐
│            Rental / Sale Listing DOM Page              │
│   (NoBroker, MagicBricks, 99acres, Housing.com)        │
└──────────────────────────┬─────────────────────────────┘
                           │ 1. Content Script extracts visible fields
                           ▼
┌────────────────────────────────────────────────────────┐
│          FlatAudit Extension (Manifest V3)             │
│                                                        │
│  ┌────────────────────────┐  ┌──────────────────────┐  │
│  │   extractListing()     │  │  analyzeListing()    │  │
│  │ - Currency Normalizer  │─▶│ - 5-Step Ladder      │  │
│  │ - Coordinate Rounder   │  │ - Deposit Ratio      │  │
│  │ - Area Type Classifier │  │ - Advance Terms      │  │
│  └────────────────────────┘  │ - Circle Rate Check  │  │
│                              │ - RERA Status        │  │
│  ┌────────────────────────┐  └──────────┬───────────┘  │
│  │ Background Worker      │             │              │
│  │ OffscreenCanvas (9x8)  │─────────────┘              │
│  │ 64-bit dHash Engine    │                            │
│  └──────────┬─────────────┘                            │
│             │                                          │
│  ┌──────────▼───────────────────────────────────────┐  │
│  │ Area Report Engine (S0–S10) (Strictly Opt-in)    │  │
│  │ - Rounds coords to 3 decimals (~100m)            │  │
│  │ - 14-day TTL / 50-item LRU Cache                 │  │
│  │ - OpenStreetMap Overpass Client                  │  │
│  │ - 5-Category Infrastructure Evaluator            │  │
│  └──────────────────────────────────────────────────┘  │
│                                                        │
│  ┌──────────────────────────────────────────────────┐  │
│  │ Buyhatke Tracker & Local Watchlist Storage       │  │
│  │ - Price History Snapshots & Inline SVG Sparkline │  │
│  │ - Multi-Property Comparison Matrix               │  │
│  │ - RFC 4180 CSV Shortlist Exporter                │  │
│  └──────────────────────────────────────────────────┘  │
└──────────────┬───────────────────────────┬─────────────┘
               │ 2. Query photo duplicates │ 3. Safe In-Page Injection
               │    & record observation   │    (Zero innerHTML)
               ▼                           ▼
┌───────────────────────────────┐ ┌──────────────────────┐
│  FastAPI Backend (Port 8000)  │ │ FlatAudit UI Drawer  │
│  - POST /api/v1/observe       │ │ - Status Badge       │
│  - GET  /api/v1/seen          │ │ - Sparkline / Price  │
│  - GET  /api/v1/matches       │ │ - Benchmark Ladder   │
│  - GET  /api/v1/packs/{cell}  │ │ - Area Report (5 Cat)│
│  - POST /api/v1/telemetry/*   │ │ - Acquisition Costs  │
│  - SQLite (flataudit.db)      │ │ - Due Diligence Card │
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
├── FlatAudit Buyer Mode_ Evaluate the Flat, Project and Builder.html
├── FlatAudit Expansion Plan_ States, Price Freshness, Yearly Memory.html
├── FlatAudit Roadmap_ Buyhatke-style companion for property.html
├── FlatAudit_ Adding Property Buying and Price History.html
├── FlatAudit_ Every-City Benchmarks Without Hardcoding.html
├── FlatAudit_ Next Stage Plan.html
├── FlatAudit_ What's Left to Finish v1.html
├── Listing Trust Analyzer_ Project Document.html
├── backend/
│   ├── build_packs.py
│   ├── config.py
│   ├── db.py
│   ├── flataudit.db
│   ├── main.py
│   ├── models.py
│   ├── requirements.txt
│   └── tests/
│       ├── test_api.py
│       ├── test_db.py
│       ├── test_packs.py
│       ├── test_rajasthan_benchmarks.py
│       ├── test_service_jobs.py
│       ├── test_spike_and_history.py
│       ├── test_spike_simulation.py
│       └── test_telemetry.py
├── docs/
│   ├── architecture.md
│   ├── buyer-mode-wording-guide.md
│   ├── engineering-retrospective-v1.md
│   ├── flataudit-banner.png
│   ├── privacy-policy.md
│   ├── scam-taxonomy.md
│   ├── store-listing.md
│   ├── technical_report_next_stage.md
│   ├── threat-model.md
│   ├── verification_log.md
│   └── zero_context_blueprint.md
├── eval/
│   ├── area_report_qa.csv
│   ├── evaluate.py
│   ├── evaluation_real_results.md
│   ├── evaluation_results.md
│   ├── generate_dataset.py
│   ├── labeling_template.csv
│   ├── labeling-guide.md
│   ├── labels.csv
│   ├── real_listings.csv
│   └── run_signals.js
├── extension/
│   ├── background.js
│   ├── content.js
│   ├── manifest.json
│   ├── styles.css
│   ├── icons/
│   │   ├── icon16.png
│   │   ├── icon32.png
│   │   ├── icon48.png
│   │   ├── icon128.png
│   │   ├── icon256.png
│   │   ├── icon512.png
│   │   ├── logo.svg
│   │   └── logo-full.svg
│   ├── lib/
│   │   ├── benchmarks.js
│   │   ├── buyer.js
│   │   ├── dhash.js
│   │   ├── geohash.js
│   │   ├── investment.js
│   │   ├── localities.js
│   │   ├── price_check.js
│   │   ├── price_compare.js
│   │   ├── settings.js
│   │   ├── signals.js
│   │   ├── tracker.js
│   │   ├── area/
│   │   │   ├── area_cache.js
│   │   │   ├── categories.js
│   │   │   ├── grades.js
│   │   │   ├── osm_client.js
│   │   │   └── report.js
│   │   ├── data/
│   │   │   ├── area_rules.json
│   │   │   ├── closing_costs.json
│   │   │   ├── guidance_values.json
│   │   │   ├── localities_bengaluru.json
│   │   │   ├── localities_jaipur.json
│   │   │   ├── localities_jodhpur.json
│   │   │   ├── market_packs.json
│   │   │   ├── pilot_projects.json
│   │   │   ├── rajasthan_costs.json
│   │   │   ├── rajasthan_pilot_projects.json
│   │   │   └── rbi_hpi.json
│   │   ├── parsers/
│   │   │   ├── classifier.js
│   │   │   ├── currency.js
│   │   │   ├── generic.js
│   │   │   ├── housing.js
│   │   │   ├── index.js
│   │   │   ├── jsonld.js
│   │   │   ├── magicbricks.js
│   │   │   ├── ninety_nine_acres.js
│   │   │   └── nobroker.js
│   │   └── states/
│   │       └── rajasthan.js
│   └── popup/
│       ├── popup.css
│       ├── popup.html
│       └── popup.js
├── fixtures/
│   ├── 99acres_normal_1bhk.html
│   ├── 99acres_project_jaipur_kiara.html
│   ├── 99acres_vpd_jodhpur_2bhk.html
│   ├── housing_duplicate_photos.html
│   ├── magicbricks_bait_price.html
│   ├── nobroker_normal_2bhk.html
│   ├── nobroker_sale_resale_2bhk.html
│   ├── nobroker_scam_army_token.html
│   ├── rera_karnataka_project_clean.html
│   ├── rera_karnataka_project_delayed.html
│   └── overpass/
│       ├── bengaluru_indiranagar.json
│       ├── bengaluru_koramangala.json
│       ├── empty_map.json
│       ├── half_tagged_map.json
│       ├── jaipur_cscheme.json
│       ├── jaipur_mansarovar.json
│       ├── jodhpur_ratanada.json
│       └── jodhpur_sardarpura.json
├── scripts/
│   ├── generate_icons.py
│   ├── generate_localities.js
│   └── trace_logo.py
├── tests/
│   ├── test_area_cache.test.js
│   ├── test_area_grades.test.js
│   ├── test_area_report_ui.test.js
│   ├── test_benchmarks.test.js
│   ├── test_buyer.test.js
│   ├── test_category_commute.test.js
│   ├── test_category_daily_supplies.test.js
│   ├── test_category_healthcare.test.js
│   ├── test_category_lifestyle.test.js
│   ├── test_category_safety_env.test.js
│   ├── test_classifier.test.js
│   ├── test_classifier_bulk.test.js
│   ├── test_dhash.test.js
│   ├── test_investment.test.js
│   ├── test_localities.test.js
│   ├── test_osm_client.test.js
│   ├── test_parsers.test.js
│   ├── test_price_check.test.js
│   ├── test_price_check_ui.test.js
│   ├── test_price_compare.test.js
│   ├── test_privacy_settings.test.js
│   ├── test_project_parse.js
│   ├── test_rajasthan.test.js
│   ├── test_signals.test.js
│   ├── test_tracker.test.js
│   └── test_ui_improvements.test.js
└── web-demo/
    ├── app.js
    ├── icon16.png
    ├── icon32.png
    ├── icon48.png
    ├── icon128.png
    ├── icon256.png
    ├── icon512.png
    ├── index.html
    ├── logo.svg
    ├── logo-full.svg
    └── style.css
```

---

### File-by-File Breakdown

#### Root Configuration & Specs
- `package.json`
  - **Criticality Level**: Config
  - **Responsibility**: Manifest for Node.js modules, test scripts, and dev dependencies.
  - **Key Exports**: Scripts (`test`, `test:watch`, `demo`), `"type": "module"`.
  - **Dependencies**: `devDependencies: jsdom`.
- `package-lock.json`
  - **Criticality Level**: Config
  - **Responsibility**: Deterministic lockfile for npm dependencies.
- `.gitignore`
  - **Criticality Level**: Config
  - **Responsibility**: Ignores `node_modules`, `venv`, Python `.pytest_cache`, OS artifacts, test database files, and build outputs.
- `README.md`
  - **Criticality Level**: Supporting
  - **Responsibility**: Project overview, architecture diagrams, testing commands, and user guide.
- `LICENSE`
  - **Criticality Level**: Config
  - **Responsibility**: Open-source MIT licensing text.

#### Backend (`backend/`)
- `backend/config.py`
  - **Criticality Level**: Config
  - **Responsibility**: Centralized backend configuration, environment paths, and CORS whitelist.
  - **Key Exports**: `BASE_DIR`, `DB_PATH`, `CORS_ORIGINS`.
  - **Dependencies**: Imported by `backend/db.py`, `backend/main.py`.
- `backend/models.py`
  - **Criticality Level**: Core
  - **Responsibility**: Pydantic v2 schemas defining all inbound request payloads and outbound API response shapes.
  - **Key Exports**: `ObservationCreate`, `ObservationResponse`, `SeenResponse`, `LocalityStatsResponse`, `CrossPortalMatchItem`, `CrossPortalMatchResponse`, `AnalyzeRequest`, `SignalDetail`, `HumanReadablePoint`, `AnalyzeResponse`, `TelemetryObservationCreate`, `TelemetryObservationResponse`, `TelemetryFeedbackCreate`, `TelemetryFeedbackResponse`.
  - **Dependencies**: Imported by `backend/main.py`.
- `backend/db.py`
  - **Criticality Level**: Core
  - **Responsibility**: SQLite database management, migrations, parameterized queries, Hamming distance calculation, monthly aggregations, spike detection, automated backups, pruning, and telemetry recording.
  - **Key Exports**: `hamming_distance(h1, h2)`, `get_connection(db_file)`, `init_db(db_file)`, `record_observation(...)`, `count_seen_hashes(target_hash, threshold, db_file)`, `find_cross_portal_matches(...)`, `get_locality_stats(locality, bhk)`, `detect_price_spike(...)`, `get_area_trend(...)`, `log_job(...)`, `get_job_logs(...)`, `rollup_monthly_aggregates(...)`, `backup_database(...)`, `restore_database(...)`, `prune_raw_observations(...)`, `check_stale_packs(...)`, `record_telemetry_observation(...)`, `record_telemetry_feedback(...)`.
  - **Dependencies**: Imports `backend/config.py`. Imported by `backend/main.py`, `backend/build_packs.py`, and test suites.
- `backend/main.py`
  - **Criticality Level**: Core
  - **Responsibility**: FastAPI application router defining REST endpoints, static pack handlers with HTTP 304 ETag caching, in-memory IP rate limiting, and Discord alert webhooks.
  - **Key Exports**: `app`, `health_check()`, `list_job_logs()`, `trigger_rollup()`, `observe_listing()`, `get_seen_hash()`, `get_cross_portal_matches_endpoint()`, `get_locality_price_stats()`, `analyze_listing_endpoint()`, `get_packs_index()`, `get_market_pack()`, `check_price_spike()`, `get_area_trend_route()`, `ingest_telemetry_observation()`, `ingest_telemetry_feedback()`.
  - **Dependencies**: Imports `backend/config.py`, `backend/models.py`, `backend/db.py`.
- `backend/build_packs.py`
  - **Criticality Level**: Supporting
  - **Responsibility**: Batch aggregation job computing robust non-parametric metrics (trimmed median, MAD, percentiles, deposit multiples) and generating static JSON market packs with zero PII.
  - **Key Exports**: `compute_percentile(sorted_data, p)`, `compute_median(data)`, `compute_mad(data, median_val)`, `aggregate_market_packs(...)`.
  - **Dependencies**: Imports `backend/db.py`.
- `backend/requirements.txt`
  - **Criticality Level**: Config
  - **Responsibility**: Python dependencies manifest (`fastapi`, `uvicorn[standard]`, `pydantic`, `httpx`, `pytest`, `pillow`).

#### Extension Core Libraries (`extension/lib/`)
- `extension/lib/benchmarks.js`
  - **Criticality Level**: Core
  - **Responsibility**: 5-step fallback benchmark ladder, robust non-parametric statistics (Median, MAD, Robust Z-score), government circle rate lookups, and state RERA portal link resolution.
  - **Key Exports**: `computeMedian(arr)`, `computeMAD(arr, median)`, `robustZScore(val, median, mad)`, `computePeerAggregates(peers)`, `isValidMarketPack(pack)`, `getBenchmark(listing, context)`, `getGuidanceValue(city, locality)`, `getReraPortalUrl(reraId)`, `normalizeAreaType(type)`, `filterLikeForLikeListings(target, pool)`, `evaluatePricePerSqftCheck(askingRate, circleRate, localityRate)`.
  - **Dependencies**: Imports `data/market_packs.json`, `data/guidance_values.json`.
- `extension/lib/buyer.js`
  - **Criticality Level**: Core
  - **Responsibility**: Buyer Mode evaluation engine: differentiates individual resale vs builder floor vs developer project, performs 4-line evaluation, calculates statutory closing costs, generates paperwork checklists, and renders printable 1-page HTML legal reports.
  - **Key Exports**: `normalizeReraId(raw)`, `detectJurisdiction(reraId, city)`, `lookupProjectFacts(reraId, jurisdiction)`, `evaluateFlatFacts(listing)`, `evaluateProjectFacts(listing, projectData)`, `evaluateBuilderFacts(listing, projectData)`, `evaluateResaleTitleFacts(listing)`, `evaluateResaleSocietyFacts(listing)`, `evaluateBuilderFloorApprovals(listing)`, `evaluateBuilderJdaFacts(listing)`, `evaluatePaperworkFacts(listing, category)`, `estimateTotalCost(price, state, options)`, `getPaperworkChecklist(listingType, state, subcategory)`, `detectListingCategory(listing)`, `generateBuyerReport(listing, options)`, `renderPrintableHtml(report)`.
  - **Dependencies**: Imports `data/pilot_projects.json`, `data/closing_costs.json`, `states/rajasthan.js`.
- `extension/lib/dhash.js`
  - **Criticality Level**: Core
  - **Responsibility**: 64-bit difference hash (dHash) generator using 9x8 grayscale reduction, 64-bit binary comparison, and bitwise Hamming distance lookup.
  - **Key Exports**: `computeDHashFromGrayscale72(pixels72)`, `computeDHashFromImageData(imageData)`, `dhashFromCanvas(canvas)`, `hammingDistance(h1, h2)`, `isDuplicateImage(h1, h2, threshold)`.
- `extension/lib/geohash.js`
  - **Criticality Level**: Core
  - **Responsibility**: Base32 spatial geohash encoder/decoder and DOM coordinate harvesting from JSON-LD, meta tags, and map links.
  - **Key Exports**: `encodeGeohash(latitude, longitude, precision)`, `decodeGeohash(geohash)`, `parseCoordinatesFromPage(doc)`.
- `extension/lib/investment.js`
  - **Criticality Level**: Supporting
  - **Responsibility**: Property investment forecast engine: capital appreciation modeling (+7.5% p.a. baseline), gross and net rental yields, and loan EMI amortization schedules.
  - **Key Exports**: `DEFAULT_ANNUAL_APPRECIATION_RATE`, `DEFAULT_RENTAL_YIELD_RATE`, `formatIndianCurrencyAbbr(amount)`, `calculateInvestmentForecast(price, options)`.
- `extension/lib/localities.js`
  - **Criticality Level**: Supporting
  - **Responsibility**: Spatial locality dictionaries across cities and Haversine distance calculator.
  - **Key Exports**: `CITY_LOCALITIES`, `haversineKm(lat1, lon1, lat2, lon2)`, `normalizeCityName(name)`, `getLocalitiesForCity(cityName)`, `findLocality(cityName, query)`, `findNeighbourLocalities(cityName, localityName, maxDistanceKm)`.
- `extension/lib/price_check.js`
  - **Criticality Level**: Core
  - **Responsibility**: Price-per-square-foot check engine, area type normalization, and like-for-like peer filtering.
  - **Key Exports**: `normalizeAreaType(type)`, `filterLikeForLikeListings(target, pool)`, `evaluatePricePerSqftCheck(askingRate, circleRate, localityRate)`.
- `extension/lib/price_compare.js`
  - **Criticality Level**: Supporting
  - **Responsibility**: Cross-portal price comparison engine evaluating asking price variations across portals.
  - **Key Exports**: `SUPPORTED_CITIES`, `EXACT_STRINGS`, `normalizeAreaType(t)`, `isCitySupported(city)`, `computeWeightedMedian(prices)`, `comparePricePerSqft(target, peers)`, `formatPriceCheckDisplay(result)`.
- `extension/lib/settings.js`
  - **Criticality Level**: Core
  - **Responsibility**: Privacy settings manager, opt-in consent flow, coordinate rounding (~100m privacy boundary), and Overpass permission requests.
  - **Key Exports**: `STORAGE_KEY_SETTINGS`, `STORAGE_KEY_AREA_REPORT`, `OVERPASS_ORIGINS`, `EXACT_CONSENT_COPY`, `roundCoordinate(coord, decimals)`, `roundLocation(coords)`, `roundLocationKey(lat, lon)`, `getFooterPrivacyText(enabled)`, `getAreaReportSettings()`, `setAreaReportSettings(settings)`, `requestAreaReportPermissions()`, `hasAreaReportPermissions()`.
- `extension/lib/signals.js`
  - **Criticality Level**: Core
  - **Responsibility**: Central rule-based scam evaluation engine executing price bait checks, deposit ratio analysis, advance-fee phrase regexes, duplicate photo matching, sale circle rate valuation, RERA validation, and composite trust badge scoring.
  - **Key Exports**: `LOCALITY_BENCHMARKS`, `PHRASE_PATTERNS`, `findLocalityBenchmark(locality, bhk)`, `evaluatePriceSignal(listing, context)`, `evaluateDepositSignal(listing, context)`, `evaluatePhraseSignal(text)`, `evaluateDuplicateImageSignal(imageHash, seenData)`, `evaluateSalePriceSignal(listing, context)`, `evaluateReraSignal(listing)`, `analyzeListing(listing, context)`.
  - **Dependencies**: Imports `benchmarks.js`, `dhash.js`, `geohash.js`, `buyer.js`.
- `extension/lib/tracker.js`
  - **Criticality Level**: Core
  - **Responsibility**: Buyhatke property companion engine managing local watchlist tracking, price snapshots, price drop deltas, inline SVG sparklines, comparison matrices, RFC 4180 CSV export, and loan EMI calculation.
  - **Key Exports**: `canonicalizeUrl(url)`, `parseListingKey(url, portal)`, `StorageAdapter`, `getTrackedListings()`, `trackListing(listing)`, `untrackListing(listingKey)`, `updateListingStatus(listingKey, status)`, `updateListingNote(listingKey, note)`, `computePriceHistoryStats(snapshots)`, `calculateEMI(principal, annualRate, tenureYears)`, `formatTimeOnMarket(firstSeenTimestamp)`, `generateSparklineSVG(snapshots, options)`, `buildComparisonMatrix(listings)`, `exportShortlistToCSV(listings)`.

#### Extension Area Report Modules (`extension/lib/area/`)
- `extension/lib/area/area_cache.js`
  - **Criticality Level**: Core
  - **Responsibility**: 14-day TTL, LRU 50-entry cache in `chrome.storage.local` keyed by 3-decimal rounded coordinates (`osm_area_${lat}_${lon}`).
  - **Key Exports**: `CACHE_STORAGE_KEY`, `CACHE_TTL_MS`, `CACHE_MAX_ENTRIES`, `getAreaFromCache(lat, lon, adapter)`, `saveAreaToCache(lat, lon, data, adapter)`, `clearAreaCache(adapter)`.
- `extension/lib/area/categories.js`
  - **Criticality Level**: Core
  - **Responsibility**: Spatial evaluation of 5 infrastructure categories: Emergency Healthcare, Daily Supplies, Commute & Transit, Safety & Environment, and Lifestyle & Community.
  - **Key Exports**: `findNearestElement(elements, targetLat, targetLon)`, `filterElements(elements, criteria)`, `evaluateEmergencyHealthcare(elements, coords, tier)`, `evaluateDailySupplies(elements, coords, tier)`, `evaluateCommuteTransit(elements, coords, tier)`, `isLateNightOpen(tags)`, `evaluateSafetyEnvironment(elements, coords, tier)`, `evaluateLifestyleCommunity(elements, coords, tier)`, `evaluateAllCategories(elements, coords, tier)`.
- `extension/lib/area/grades.js`
  - **Criticality Level**: Core
  - **Responsibility**: City tier resolution (Bengaluru/Bangalore -> metro, Jaipur/Jodhpur -> smaller city), score boundaries, letter grading (A, B, C, D), distance tie-breaking, and neutral drawback phrasing.
  - **Key Exports**: `getCityTier(cityName, areaRules)`, `scoreCheck(value, checkRule)`, `formatFact(template, values)`, `formatDrawback(template, values)`, `gradeCategory(categoryKey, checkResults, areaRules, tier)`.
- `extension/lib/area/osm_client.js`
  - **Criticality Level**: Core
  - **Responsibility**: OpenStreetMap Overpass API client executing structured bounding-box QL queries with 25s timeout, rate-limiting, and error handling.
  - **Key Exports**: `OVERPASS_ENDPOINTS`, `OVERPASS_TIMEOUT_SEC`, `MIN_QUERY_INTERVAL_MS`, `OSM_ATTRIBUTION`, `RELEVANT_TAG_KEYS`, `buildOverpassQuery(lat, lon, radiusMeters)`, `parseOverpassResponse(json)`, `canExecuteQuery()`, `resetRateLimiter()`, `queryOverpass(lat, lon, radiusMeters, fetchFn)`.
- `extension/lib/area/report.js`
  - **Criticality Level**: Core
  - **Responsibility**: Area Report orchestrator: generates complete category scores, coordinates cache lookups, formats threshold strings, and builds DOM components with grade chips, metric descriptions, and ODbL attribution.
  - **Key Exports**: `EXACT_AREA_STRINGS`, `generateAreaReport(coords, cityName, options)`, `formatCriteriaThresholds(categoryKey, tier)`, `renderAreaReportDOM(reportData, options)`.

#### Extension DOM Parsers (`extension/lib/parsers/`)
- `extension/lib/parsers/classifier.js`
  - **Criticality Level**: Core
  - **Responsibility**: Automatic DOM classifier distinguishing between `rent` vs `sale` vs `project` vs `builder` vs `individual`.
  - **Key Exports**: `classifyListingType(doc, url)`.
- `extension/lib/parsers/currency.js`
  - **Criticality Level**: Core
  - **Responsibility**: Indian currency normalizer parsing ₹, Lakhs, Crores, Price/sq.ft, Area Types (Carpet vs Super Built-up), Possession Status, RERA ID, and BHK.
  - **Key Exports**: `parseIndianCurrency(str)`, `parseBHK(str)`, `parseArea(str)`, `parseFloor(str)`, `parsePricePerSqFt(str)`, `parseAreaType(str)`, `parsePossessionStatus(str)`, `parseReraId(str)`, `parseListingType(str, url)`, `filterPropertyImages(imgs)`, `classifyListingType(str, url)`.
- `extension/lib/parsers/generic.js`
  - **Criticality Level**: Supporting
  - **Responsibility**: Heuristic fallback extractor for unlisted property listing portals.
  - **Key Exports**: `parseGeneric(doc, url)`.
- `extension/lib/parsers/housing.js`
  - **Criticality Level**: Core
  - **Responsibility**: Dedicated DOM extractor for Housing.com rental and sale listings.
  - **Key Exports**: `parseHousing(doc, url)`.
- `extension/lib/parsers/index.js`
  - **Criticality Level**: Core
  - **Responsibility**: Central parser router dispatching to portal-specific parsers, running `isListingValid()` health checks, and harvesting search peers via `parsePeerListingsFromPage()`.
  - **Key Exports**: `extractListing(doc, url)`, `isListingValid(listing)`, `parsePeerListingsFromPage(doc, portal)`, `parseNoBroker`, `parseMagicBricks`, `parse99acres`, `parseHousing`, `parseGeneric`.
- `extension/lib/parsers/jsonld.js`
  - **Criticality Level**: Supporting
  - **Responsibility**: Schema.org JSON-LD structured data extractor for `RealEstateListing`, `SingleFamilyResidence`, `Product`, etc.
  - **Key Exports**: `extractJsonLdData(doc)`.
- `extension/lib/parsers/magicbricks.js`
  - **Criticality Level**: Core
  - **Responsibility**: Dedicated DOM extractor for MagicBricks (rent and sale).
  - **Key Exports**: `parseMagicBricks(doc, url)`.
- `extension/lib/parsers/ninety_nine_acres.js`
  - **Criticality Level**: Core
  - **Responsibility**: Dedicated DOM extractor for 99acres (rent, resale flat, and new developer launches).
  - **Key Exports**: `parse99acres(doc, url)`.
- `extension/lib/parsers/nobroker.js`
  - **Criticality Level**: Core
  - **Responsibility**: Dedicated DOM extractor for NoBroker (rent and resale flat listings).
  - **Key Exports**: `parseNoBroker(doc, url)`.

#### Extension State Adapters (`extension/lib/states/`)
- `extension/lib/states/rajasthan.js`
  - **Criticality Level**: Core
  - **Responsibility**: Rajasthan state valuation adapter, DLC circle rate lookups, statutory closing costs (Stamp duty 6% male / 5% female / 5% joint, 1% registration), Raj-RERA ID normalization (`RAJ/P/...`), Form R-1/R-2/R-3 escrow audits, and QPR compliance evaluations.
  - **Key Exports**: `RajasthanValuationAdapter`, `normalizeRajReraId(raw)`, `evaluateRajReraDossier(projectData)`.

#### Extension Static Reference Datasets (`extension/lib/data/`)
- `area_rules.json`: Category amenity weights, distance radii, tier definitions, and neutral copy templates.
- `closing_costs.json`: Statutory closing cost rates for Karnataka (Stamp duty 5.6%, registration 1%, GST 0%/5%/12%, maintenance advance).
- `guidance_values.json`: Karnataka Stamps & Registration (Kaveri 2.0) minimum guidance values (circle rates) per square foot.
- `localities_bengaluru.json`: Locality coordinate and boundary dictionary for Bengaluru.
- `localities_jaipur.json`: Locality coordinate and boundary dictionary for Jaipur.
- `localities_jodhpur.json`: Locality coordinate and boundary dictionary for Jodhpur.
- `market_packs.json`: Static rental market packs (medians, MAD, PSF, deposit multiples) across pilot micro-markets.
- `pilot_projects.json`: Curated dataset of 20 K-RERA Bengaluru projects with sanctioned dates, revised completions, and Form B disclosures.
- `rajasthan_costs.json`: Rajasthan statutory closing costs and DLC rates.
- `rajasthan_pilot_projects.json`: Curated dataset of Rajasthan RERA projects with escrow compliance, QPR filings, and completion velocity.
- `rbi_hpi.json`: Reserve Bank of India House Price Index time-series data for appreciation trend modeling.

#### Extension UI & Runtime Scripts (`extension/`)
- `extension/manifest.json`
  - **Criticality Level**: Config
  - **Responsibility**: Manifest V3 declaration, permissions (`storage`), host permissions, service worker, content scripts, and CSP.
- `extension/background.js`
  - **Criticality Level**: Core
  - **Responsibility**: MV3 service worker managing `OffscreenCanvas(9, 8)` dHash generation, CORS-isolated image fetches, backend API proxying, and storage updates.
- `extension/content.js`
  - **Criticality Level**: Core / UI
  - **Responsibility**: Main content script injected into listing pages. Handles DOM observation, search-peer harvesting, trust badge injection, expandable audit drawer, 5-category Area Report, Buyhatke price history sparklines, comparison drawer, Buyer Due Diligence checklist, and Apple Design accordions.
- `extension/styles.css`
  - **Criticality Level**: UI
  - **Responsibility**: Dark-mode stylesheet implementing Apple HIG tokens, cyan `#38bdf8` and slate `#cbd5e1` contrast text, elevated glass cards, floating translucent scrollbars, drop box accordions with rotating chevrons, and responsive drawers.
- `extension/popup/popup.html`
  - **Criticality Level**: UI
  - **Responsibility**: Toolbar popup HTML structure displaying listing trust status, fallback ladder chip, Buyhatke watchlist, and settings modal.
- `extension/popup/popup.css`
  - **Criticality Level**: UI
  - **Responsibility**: Apple HIG dark-mode stylesheet for the extension toolbar popup.
- `extension/popup/popup.js`
  - **Criticality Level**: Core / UI
  - **Responsibility**: Toolbar popup controller communicating with active tab content script, managing local watchlists, and persisting privacy settings.

#### Web Demo (`web-demo/`)
- `web-demo/index.html`
  - **Criticality Level**: UI
  - **Responsibility**: Standalone web testbed interface simulating extension behavior with presets (rent scams, clean flats, resale apartments, developer launches), ladder test selectors, dHash Hamming calculator, Buyer Due Diligence report card, and area report simulator.
- `web-demo/app.js`
  - **Criticality Level**: Supporting / UI
  - **Responsibility**: Standalone client application logic executing `analyzeListing`, `generateBuyerReport`, and `generateAreaReport` directly in-browser without backend dependencies.
- `web-demo/style.css`
  - **Criticality Level**: UI
  - **Responsibility**: Apple HIG dark-mode stylesheet for the web demo testbed.

#### Evaluation Pipeline (`eval/`)
- `eval/evaluate.py`
  - **Criticality Level**: Supporting
  - **Responsibility**: Evaluation harness executing `extension/lib/signals.js` via Node.js bridge, computing Accuracy, Precision, Recall, F1, Specificity, and per-city breakdowns.
- `eval/generate_dataset.py`
  - **Criticality Level**: Supporting
  - **Responsibility**: Deterministic generator synthesizing 250 realistic rental listings with edge cases.
- `eval/run_signals.js`
  - **Criticality Level**: Supporting
  - **Responsibility**: Node.js CLI bridge consuming stdin JSON listings, executing `analyzeListing()`, and emitting stdout JSON results to prevent rule drift.
- `eval/labels.csv`
  - **Criticality Level**: Supporting
  - **Responsibility**: Synthetic unit-test dataset containing 250 annotated listings across Bengaluru, Gurgaon, Mumbai, Pune.
- `eval/real_listings.csv`
  - **Criticality Level**: Supporting
  - **Responsibility**: Multi-city empirical test dataset containing 30 real-world listings across 5 metro cities.
- `eval/area_report_qa.csv`
  - **Criticality Level**: Supporting
  - **Responsibility**: Ground-truth QA dataset for OpenStreetMap area report infrastructure assertions.
- `eval/labeling_template.csv`
  - **Criticality Level**: Supporting
  - **Responsibility**: Standardized labeling template for human annotation.
- `eval/labeling-guide.md`
  - **Criticality Level**: Supporting
  - **Responsibility**: Empirical annotation guide defining threat signals, classification boundaries, and edge-case protocols.
- `eval/evaluation_results.md`
  - **Criticality Level**: Supporting
  - **Responsibility**: Evaluation report on synthetic dataset (97.3% accuracy, 95.1% precision, 100.0% recall).
- `eval/evaluation_real_results.md`
  - **Criticality Level**: Supporting
  - **Responsibility**: Evaluation report on real multi-city dataset (100.0% accuracy, 100.0% precision, 100.0% recall).

---

## 3. Dependencies & Environment Configuration

### Production Dependencies

#### Python Backend (`backend/requirements.txt`)
1. `fastapi>=0.110.0`
   - **Why**: Asynchronous, high-throughput REST API framework providing automated OpenAPI documentation, dependency injection, and Pydantic validation.
2. `uvicorn[standard]>=0.28.0`
   - **Why**: Lightning-fast ASGI web server implementation based on `uvloop` and `httptools`.
3. `pydantic>=2.0.0`
   - **Why**: High-performance data parsing, type enforcement, and schema validation.
4. `pillow>=10.0.0`
   - **Why**: Perceptual image hashing (dHash) and image normalization in Python backend jobs and scripts.

#### Browser Extension (`extension/manifest.json`)
- **Zero Runtime Dependencies**: The browser extension runtime has **0 external npm dependencies**. All parsing, statistical calculation, dHash generation, SVG rendering, and DOM manipulation execute using native browser Web APIs (`OffscreenCanvas`, `crypto.subtle`, `MutationObserver`, `document.querySelector`, `chrome.storage.local`).

### Dev & Build Dependencies

#### Node.js Ecosystem (`package.json`)
1. `jsdom (^30.1.3)`
   - **Why**: Provides a standards-compliant W3C DOM and HTML environment in Node.js for running unit and integration tests against captured portal HTML fixtures.

#### Python Ecosystem
1. `pytest>=8.0.0`
   - **Why**: Test runner for backend unit tests, SQLite schema migrations, and Monte Carlo market spike simulations.
2. `httpx>=0.27.0`
   - **Why**: High-performance asynchronous HTTP client used by Pytest `TestClient` to perform integration testing on FastAPI endpoints.

### Configuration Files
1. `package.json`:
   - `"type": "module"`: Enforces native ECMAScript Modules (ESM) across all JavaScript files.
   - `"test": "node --test tests/*.test.js"`: Executes the Node.js native test runner against all 27 test files without requiring Jest or Mocha.
   - `"demo"`: Spins up a zero-dependency local static file server using Node's native `http` module on port 8080.
2. `extension/manifest.json`:
   - `"manifest_version": 3`: Complies with Chrome Manifest V3 specifications.
   - `"permissions": ["storage"]`: Strictly restricted to local client storage.
   - `"optional_host_permissions"`: Restricted to OpenStreetMap Overpass API endpoints (`https://overpass-api.de/*`, `https://overpass.kumi.systems/*`, `https://lz4.overpass-api.de/*`), requested only when user toggles Area Report ON.
   - `"host_permissions"`: Explicitly whitelisted listing portal domains for content script injection and background image fetching.
   - `"content_security_policy"`: `"extension_pages": "script-src 'self'; object-src 'self';"`: Prohibits remote code execution, eval, or CDN script loading.

### Environment Variables (`.env.example`)

```bash
# FlatAudit Environment Configuration

# Database Configuration
# Path to the primary SQLite database file. Defaults to 'backend/flataudit.db' if omitted.
FLATAUDIT_DB_PATH="backend/flataudit.db"

# Server Network Configuration
# Host interface for Uvicorn ASGI server.
HOST="127.0.0.1"

# Port for FastAPI application.
PORT=8000

# Environment Mode
# Allowed values: 'development', 'production', 'test'
ENV="development"

# Discord Webhook Notification (Optional)
# Webhook URL for dispatching real-time notifications when beta testers submit false-positive or missed-scam feedback.
# Expected format: https://discord.com/api/webhooks/<webhook_id>/<webhook_token>
DISCORD_WEBHOOK_URL="https://discord.com/api/webhooks/dummy_id/dummy_token"
```

---

## 4. Database Information & Complete Schema

### Database Engine & Architecture
- **Engine**: SQLite 3 (`backend/flataudit.db`).
- **Access Method**: Python standard library `sqlite3` using `conn.row_factory = sqlite3.Row`.
- **Concurrency & Integrity**: Thread-safe parameterized queries with daily deduplication constraint (`UNIQUE(portal, listing_key, day)`).

### Complete DDL Schema Definition

```sql
-- 1. Listing Observations Registry Table (Rent & Sale Properties)
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

-- Performance & Query Indexes for Observations
CREATE INDEX IF NOT EXISTS idx_image_hash ON observations(image_hash);
CREATE INDEX IF NOT EXISTS idx_locality_bhk ON observations(locality, bhk);
CREATE INDEX IF NOT EXISTS idx_portal_listing ON observations(portal, listing_key);
CREATE INDEX IF NOT EXISTS idx_listing_type ON observations(listing_type);
CREATE INDEX IF NOT EXISTS idx_day ON observations(day);
CREATE INDEX IF NOT EXISTS idx_geohash ON observations(geohash);

-- 2. Multi-Year Memory Rollup Table (Cell Month Aggregates)
CREATE TABLE IF NOT EXISTS cell_month (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    cell TEXT NOT NULL,
    month TEXT NOT NULL,
    listing_type TEXT NOT NULL DEFAULT 'rent',
    bhk INTEGER NOT NULL,
    property_type TEXT DEFAULT 'apartment',
    status TEXT DEFAULT 'active',
    n INTEGER NOT NULL,
    median INTEGER NOT NULL,
    p25 INTEGER,
    p75 INTEGER,
    mad INTEGER,
    psf_median INTEGER,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(cell, month, listing_type, bhk, property_type, status)
);

CREATE INDEX IF NOT EXISTS idx_cell_month_lookup ON cell_month(cell, listing_type, bhk, month);

-- 3. Service Operations: Structured Job Execution Logs
CREATE TABLE IF NOT EXISTS job_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    job_name TEXT NOT NULL,
    status TEXT NOT NULL,
    details TEXT,
    records_processed INTEGER DEFAULT 0,
    duration_ms REAL DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_job_logs_name ON job_logs(job_name, status);

-- 4. Crowdsourced Anonymous Listing Observations
CREATE TABLE IF NOT EXISTS telemetry_observations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    client_id TEXT NOT NULL,
    portal TEXT NOT NULL,
    city TEXT NOT NULL,
    locality TEXT,
    listing_fingerprint TEXT NOT NULL,
    price INTEGER,
    deposit INTEGER,
    bedrooms INTEGER,
    features_json TEXT,
    signals_json TEXT,
    schema_version TEXT,
    extension_version TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_telem_city ON telemetry_observations(city, locality);
CREATE INDEX IF NOT EXISTS idx_telem_fingerprint ON telemetry_observations(listing_fingerprint);

-- 5. Ground-Truth Tester Feedback Table
CREATE TABLE IF NOT EXISTS telemetry_feedback (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    client_id TEXT NOT NULL,
    listing_fingerprint TEXT NOT NULL,
    verdict TEXT NOT NULL,
    reason_category TEXT,
    user_note TEXT,
    snapshot_json TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_feedback_verdict ON telemetry_feedback(verdict);
```

### Migrations & Seed Data
- **Dynamic Migration Engine**: `backend/db.py:init_db()` executes table introspection via `PRAGMA table_info(observations)` and dynamically issues `ALTER TABLE observations ADD COLUMN <col> <type>` for any missing columns across schema updates.
- **Deduplication Logic**: When an observation arrives, `record_observation()` queries for `(portal, listing_key, day = today)`. If found, it issues an `UPDATE` statement; if not, it issues an `INSERT`.
- **Seed Data**: Shipped with pre-calculated static market packs in `extension/lib/data/market_packs.json` and government guidance circle rates in `guidance_values.json` and `rajasthan_costs.json`. The application is fully operational on first launch without requiring pre-seeded database rows.

---

## 5. Core Business Logic, API & Data Flow

### Authentication & Authorization
- **Privacy Model**: Zero user authentication is required. FlatAudit collects zero personal identity data (no user accounts, passwords, email addresses, or phone numbers).
- **Client Identity**: Extension clients generate a pseudo-anonymous UUIDv4 client ID persisted in `chrome.storage.local` solely for deduplicating opt-in telemetry feedback.
- **Rate Limiting**: An in-memory token bucket (`enforce_ip_rate_limit`) enforces a ceiling of 60 requests per minute per client IP. Client IP addresses are processed in memory and never persisted to the database.

### API / Route Catalog

#### 1. `GET /api/v1/health`
- **Auth**: Public
- **Params**: None
- **Logic**: Inspects SQLite database accessibility, scans for stale market packs exceeding 45 days, and verifies the zero-PII privacy guarantee.
- **Response** (`200 OK`):
  ```json
  {
    "status": "healthy",
    "service": "flataudit-api",
    "version": "1.0.0",
    "privacy": "no-pii-stored",
    "packs": { "stale_packs_count": 0, "stale_cells": [] }
  }
  ```

#### 2. `POST /api/v1/observe`
- **Auth**: Public
- **Request Body**: `ObservationCreate`
  ```json
  {
    "url": "https://www.nobroker.in/property/...",
    "portal": "nobroker",
    "listing_key": "nobroker:58a3654f",
    "locality": "indiranagar",
    "bhk": 2,
    "listing_type": "rent",
    "rent": 40000,
    "deposit": 160000,
    "area_sqft": 1200,
    "floor": 3,
    "image_hash": "a4c2e1f0b8d7e6a5",
    "geohash": "tdr1y"
  }
  ```
- **Logic**: Computes SHA-256 hash of URL; inserts or updates daily observation row; scans existing observations for perceptual image matches (Hamming distance $\le 10$); returns total seen count.
- **Response** (`201 Created`):
  ```json
  {
    "status": "recorded",
    "id": 142,
    "seen_count": 1
  }
  ```

#### 3. `GET /api/v1/seen`
- **Auth**: Public
- **Query Params**: `hash` (16-hex string), `threshold` (int, default: 10).
- **Logic**: Iterates over distinct image hashes in `observations`, executes bitwise Hamming distance, and counts matching distinct listings.
- **Response** (`200 OK`):
  ```json
  {
    "hash": "a4c2e1f0b8d7e6a5",
    "seen_count": 3,
    "matched_listings": 3,
    "threshold": 10
  }
  ```

#### 4. `GET /api/v1/matches`
- **Auth**: Public
- **Query Params**: `rent` (int), `portal` (optional str), `listing_key` (optional str), `locality` (optional str), `bhk` (int), `area_sqft` (optional int), `floor` (optional int), `image_hash` (optional str).
- **Logic**: Locates sister or identical listings on alternative portals matching either identical perceptual photo dHash ($\le 10$) or matching physical attributes ($\pm 15\%$ area, identical BHK, same floor and locality). Computes rent differential.
- **Response** (`200 OK`):
  ```json
  {
    "target_portal": "nobroker",
    "match_count": 1,
    "lowest_rent": 37000,
    "matches": [
      {
        "portal": "magicbricks",
        "listing_key": "mb:4981729",
        "rent": 37000,
        "deposit": 150000,
        "area_sqft": 1180,
        "floor": 3,
        "rent_delta": -3000,
        "confidence": "high",
        "verdict": "Also listed on MagicBricks for ₹3,000 less",
        "reasons": ["Matching 64-bit photo fingerprint (Hamming distance: 2)"]
      }
    ]
  }
  ```

#### 5. `GET /api/v1/locality-stats`
- **Auth**: Public
- **Query Params**: `locality` (str), `bhk` (int).
- **Logic**: Retrieves empirical rent and deposit statistics for a locality and bedroom count, computing median, min, max, sample size $n$, and confidence tier.
- **Response** (`200 OK`):
  ```json
  {
    "locality": "indiranagar",
    "bhk": 2,
    "count": 48,
    "sample_size": 48,
    "confidence": "high",
    "median_rent": 40000.0,
    "min_rent": 32000,
    "max_rent": 52000,
    "median_deposit": 160000.0
  }
  ```

#### 6. `POST /api/v1/analyze`
- **Auth**: Public
- **Request Body**: `AnalyzeRequest`
- **Logic**: Evaluates listing against price benchmarks, deposit ratio thresholds, advance-fee phrase patterns, image duplicate hashes, and sale circle rates; computes composite badge label and safety advice.
- **Response** (`200 OK`):
  ```json
  {
    "badge_label": "Looks normal",
    "badge_tone": "ok",
    "headline_summary": "All observable parameters align with market standards.",
    "scam_kill_chain_stage": "none",
    "fired_count": 0,
    "observable_facts": ["Rent is within expected market distribution"],
    "human_readable_points": [],
    "safety_advice": ["Always verify physical property before transferring funds"],
    "signals": {},
    "cross_portal_matches": []
  }
  ```

#### 7. `GET /api/v1/packs/index.json`
- **Auth**: Public
- **Logic**: Serves index of available static market packs with ETag and `Cache-Control: public, max-age=86400`. Returns `304 Not Modified` on matching ETag.
- **Response** (`200 OK` or `304 Not Modified`).

#### 8. `GET /api/v1/packs/{cell}`
- **Auth**: Public
- **Path Param**: `cell` (geohash cell or locality identifier).
- **Logic**: Serves zero-PII static market pack containing trimmed medians, MAD, and deposit multiples.
- **Response** (`200 OK` or `304 Not Modified`).

#### 9. `GET /api/v1/spike-check`
- **Auth**: Public
- **Query Params**: `locality` (str), `bhk` (int), `listing_type` (str).
- **Logic**: Evaluates sudden 30-day price surges against 90-day baseline (requires $n \ge 5$ in both windows). Returns surge percentage and neutral explanation.
- **Response** (`200 OK`).

#### 10. `GET /api/v1/area-trend`
- **Auth**: Public
- **Query Params**: `locality` (str), `bhk` (int), `listing_type` (str), `limit` (int, default 12).
- **Logic**: Returns multi-year monthly aggregate statistics from `cell_month` and recent 30-day spike checks.
- **Response** (`200 OK`).

#### 11. `GET /api/v1/jobs/logs`
- **Auth**: Public / Operations
- **Query Params**: `job_name` (optional str), `limit` (int).
- **Logic**: Returns recent structured background job execution records from `job_logs`.
- **Response** (`200 OK`).

#### 12. `POST /api/v1/jobs/rollup`
- **Auth**: Public / Operations
- **Query Params**: `month` (str, `YYYY-MM`), `force` (bool).
- **Logic**: Aggregates closed calendar month observations into `cell_month` table.
- **Response** (`200 OK`).

#### 13. `POST /api/v1/telemetry/observation` (and `/v1/telemetry/observation`)
- **Auth**: Public (Rate-limited to 60 req/min)
- **Request Body**: `TelemetryObservationCreate`
- **Logic**: Records sanitized listing feature snapshots from opted-in users (stores zero personal data or IP addresses).
- **Response** (`201 Created`):
  ```json
  {
    "status": "recorded",
    "telemetry_id": 81,
    "client_id": "c1f8a84b-7241-4c12-9289-4a9f3b9d0e12"
  }
  ```

#### 14. `POST /api/v1/telemetry/feedback` (and `/v1/telemetry/feedback`)
- **Auth**: Public (Rate-limited to 60 req/min)
- **Request Body**: `TelemetryFeedbackCreate`
- **Logic**: Ingests ground-truth feedback (`false_positive`, `missed_scam`, `accurate`). If `false_positive` or `missed_scam` is reported, triggers an instant alert to the Discord webhook if configured.
- **Response** (`201 Created`):
  ```json
  {
    "status": "recorded",
    "feedback_id": 19,
    "alert_dispatched": true
  }
  ```

---

### Core Business Logic Algorithms

#### 1. Robust Statistics & Z-Score Formula
$$\text{Median} = \begin{cases} 
X\left[\frac{n+1}{2}\right] & \text{if } n \text{ is odd} \\
\frac{X\left[\frac{n}{2}\right] + X\left[\frac{n}{2} + 1\right]}{2} & \text{if } n \text{ is even}
\end{cases}$$

$$\text{MAD} = \text{median}\left(\left|x_i - \text{median}(X)\right|\right)$$

$$\text{Robust Z-Score } z = \frac{x - \text{median}}{1.4826 \times \text{MAD}}$$
*Rule*: A rent outlier warning fires if rent is $\ge 38\%$ below median or robust $z \le -2.5$.

#### 2. Perceptual 64-Bit Difference Hash (dHash)
1. Convert source image to grayscale.
2. Resize to an asymmetric grid of 9 columns $\times$ 8 rows (72 pixels).
3. Compute bitwise horizontal difference for each row $y \in [0, 7]$ and column $x \in [0, 7]$:
   $$P(x, y) = \begin{cases} 1 & \text{if } \text{pixel}(x, y) > \text{pixel}(x+1, y) \\ 0 & \text{otherwise} \end{cases}$$
4. Concatenate the 64 bits into a 16-character hexadecimal string.
5. Compute bitwise XOR and count set bits (Hamming distance):
   $$\text{Hamming}(H_1, H_2) = \sum_{i=0}^{15} \text{popcount}\left(\text{hex}_1[i] \oplus \text{hex}_2[i]\right)$$
   If $\text{Hamming}(H_1, H_2) \le 10$, photos are treated as duplicates.

#### 3. Loan EMI Amortization Algorithm
$$r = \frac{\text{AnnualRate}}{12 \times 100}, \quad n = \text{TenureYears} \times 12$$
$$\text{EMI} = P \times \frac{r \times (1 + r)^n}{(1 + r)^n - 1}$$
$$\text{Total Repayment } T = \text{EMI} \times n, \quad \text{Total Interest } I = T - P$$

#### 4. OpenStreetMap Area Report Algorithm (S0–S10)
- **Coordinate Privacy**: Coordinates are rounded to 3 decimal places (~100m grid) using `roundLocation(coords)`.
- **Query Construction**: Generates structured Overpass QL bounding box around rounded coordinates with a 1,000-meter radius, retrieving amenities, healthcare, shops, public transport, police, parks, and leisure facilities.
- **Grading Matrix**:
  - Scores individual checks (0 = weak, 1 = okay, 2 = good) against city-tier thresholds.
  - Computes composite category grade:
    $$\text{Average Score} = \frac{\sum \text{Check Scores}}{\text{Count of Checks}}$$
    $$\text{Grade} = \begin{cases}
    \text{Good (A)} & \text{if Average} \ge 1.5 \\
    \text{Okay (B)} & \text{if } 0.75 \le \text{Average} < 1.5 \\
    \text{Weak (C)} & \text{if Average} < 0.75
    \end{cases}$$
  - Selects positive highlights by closest distance and formats neutral drawbacks ("on the map").

---

## 6. Project Progress & Implementation Status

### Completed Features (100% Functional & Verified)
1. **Multi-Portal DOM Parsing Engine**:
   - High-fidelity extraction across NoBroker, MagicBricks, 99acres, and Housing.com.
   - Comprehensive extraction of rents, sale prices (Crores/Lakhs), deposits, BHK, Carpet vs Built-up vs Super Built-up area types, possession status, floor, coordinates, and RERA IDs.
2. **64-Bit Perceptual dHash Architecture**:
   - MV3 Service Worker `OffscreenCanvas` processing.
   - Bitwise Hamming distance computation with 10-bit threshold.
3. **Dynamic 5-Step Benchmark Fallback Ladder**:
   - 100% decoupling from hardcoded prices.
   - Seamless progression through Peer Page $\rightarrow$ Area Cell $\rightarrow$ District Cell $\rightarrow$ City Baseline $\rightarrow$ Silence Mode.
4. **Buyhatke-Style Property Companion**:
   - Watchlist management, revisit price snapshotting, rent drop alerts, zero-dependency inline SVG sparklines, comparison matrix, and RFC 4180 CSV export.
5. **Buyer Mode Due Diligence**:
   - Differentiated property classification: `individual` (Title search, 30-year EC, Society NOC), `builder` (FAR drawings, JDA, UDS), and `project` (RERA filings, promoter completion track record, designated escrow account).
   - Karnataka (Kaveri 2.0) and Rajasthan (DLC) guidance circle rate validation.
   - Statutory closing cost estimator (stamp duty, registration, GST, maintenance advance).
   - Loan EMI amortization calculator.
   - Printable 1-page HTML Buyer Report for legal review.
6. **OpenStreetMap Area Report (S0–S10)**:
   - 5 infrastructure categories: Emergency Healthcare, Daily Supplies, Commute & Transit, Safety & Environment, Lifestyle & Community.
   - Strict opt-in privacy consent flow.
   - 3-decimal coordinate rounding (~100m grid).
   - 14-day TTL and 50-entry LRU cache.
   - City-tier sensitive grading (Metro vs Tier-2/3).
7. **Apple Design & UI Overhaul**:
   - Cyan (`#38bdf8`) and Slate (`#cbd5e1`/`#94a3b8`) accessible contrast tokens.
   - Translucent floating scrollbars (`::-webkit-scrollbar`).
   - Accordion drop boxes with rotating chevrons (`▾`).
   - High-contrast elevated glass cards for Estimated All-In Acquisition Costs.
   - Replaced risky word `"Verified"` with `"Validated"`.
8. **Automated Verification**:
   - **270 JavaScript tests passing** across 100 suites (`npm test`).
   - **30 Python backend tests passing** (`pytest backend/tests`).
   - **100% accuracy on real multi-city listings** ($n=30$).
   - **97.3% accuracy on synthetic benchmark** ($n=250$, 0 false negatives).

### In-Progress & Partially Implemented
- **Expanded State Guidance Values**: Karnataka and Rajasthan circle rates are fully mapped in production JSON. Maharashtra (MahaRERA/ASR) and Haryana (HRERA/Collector Rates) have RERA links configured, but automated circle rate JSON tables remain stubbed for future quarterly releases.
- **Overpass Public Server Rate Limits**: Public Overpass instances occasionally throttle heavy burst traffic. Handled gracefully via client timeouts and 14-day local caching, but production scale will benefit from a dedicated self-hosted Overpass instance or pre-compiled OSM amenity tiles.

### Pending / Not Started
- **Automated Form B PDF Parsing**: Direct extraction of developer litigation affidavits from state RERA PDF filings (currently relies on curated pilot project datasets and official portal link-outs).
- **Mobile Firefox / Safari Port**: Extension is currently built and verified exclusively for Chromium Manifest V3 browsers.

### Known Bugs, Edge Cases & Tech Debt
- **Dynamic Portal Class Name Churn**: Listing portals frequently obfuscate or regenerate Tailwind/CSS-module class names. Mitigated via multi-selector fallbacks, JSON-LD extraction, and heuristic semantic text matching in `generic.js`.
- **Location Permission Prompts**: Toggling Area Report requires Chrome's native optional host permission prompt for `https://overpass-api.de/*`. If rejected by the user, the UI remains cleanly disabled in silence mode.

---

## 7. Step-by-Step Reconstruction Sequence

Follow this deterministic execution plan to reconstruct the entire FlatAudit codebase from scratch:

### Step 1: Repository Initialization & Dependencies
```bash
# Initialize project directory
mkdir FlatAudit
cd FlatAudit
git init

# Initialize Node.js environment
npm init -y

# Configure ESM modules in package.json
node -e "const pkg=JSON.parse(fs.readFileSync('package.json'));pkg.type='module';pkg.scripts={test:'node --test tests/*.test.js',demo:'node web-demo/server.js'};fs.writeFileSync('package.json',JSON.stringify(pkg,null,2));"

# Install Node development dependencies
npm install --save-dev jsdom

# Create Python virtual environment and install backend dependencies
python -m venv venv
# Windows: venv\Scripts\activate | Unix: source venv/bin/activate
pip install fastapi "uvicorn[standard]" pydantic httpx pytest pillow
```

### Step 2: Establish Configuration Files
1. Create `.gitignore` ignoring `node_modules`, `venv`, `*.db`, `.pytest_cache`, and build directories.
2. Create `backend/requirements.txt` containing `fastapi`, `uvicorn[standard]`, `pydantic`, `httpx`, `pytest`, `pillow`.
3. Create `backend/config.py` declaring `BASE_DIR`, `DB_PATH`, and `CORS_ORIGINS`.

### Step 3: Implement Core Extension Libraries
1. `extension/lib/dhash.js`: Implement 72-pixel grayscale conversion, horizontal gradient comparison, 64-bit dHash generation, and bitwise Hamming distance calculation.
2. `extension/lib/geohash.js`: Implement Base32 geohash encoding/decoding and coordinate DOM harvesting.
3. `extension/lib/parsers/currency.js`: Implement Indian currency normalizer (₹, Lakh, Crore, Price/sq.ft, Area Type, RERA ID, BHK).
4. `extension/lib/parsers/`: Implement portal-specific extractors (`nobroker.js`, `magicbricks.js`, `ninety_nine_acres.js`, `housing.js`, `generic.js`), JSON-LD parser (`jsonld.js`), and router (`index.js`).
5. `extension/lib/benchmarks.js`: Implement robust median, MAD, robust z-score, 5-tier fallback ladder, and circle rate lookup.
6. `extension/lib/data/`: Create static JSON datasets: `market_packs.json`, `guidance_values.json`, `closing_costs.json`, `pilot_projects.json`, `rajasthan_costs.json`, `rajasthan_pilot_projects.json`, `rbi_hpi.json`, `area_rules.json`, and locality files.
7. `extension/lib/buyer.js`: Implement 3-way listing classifier, 4-line evaluation, closing cost estimator, due diligence checklists, and printable HTML report generator.
8. `extension/lib/tracker.js`: Implement `StorageAdapter`, watchlist tracking, price history snapshotting, inline SVG sparklines, comparison matrices, CSV export, and EMI calculation.
9. `extension/lib/settings.js`: Implement privacy settings manager, coordinate rounding (~100m grid), and permission requests.
10. `extension/lib/area/`:
    - `area_cache.js`: Implement 14-day TTL and 50-item LRU cache.
    - `categories.js`: Implement 5-category infrastructure evaluators.
    - `grades.js`: Implement city tier resolution, metric scoring, letter grading, and drawback phrasing.
    - `osm_client.js`: Implement Overpass QL query builder, timeout handling, and rate-limiting.
    - `report.js`: Implement area report orchestrator and DOM rendering.
11. `extension/lib/signals.js`: Wire all evaluation rules into composite `analyzeListing()` engine.

### Step 4: Implement Backend & Database Engine
1. `backend/models.py`: Define Pydantic V2 schemas for observations, telemetry, cross-portal matches, and analysis.
2. `backend/db.py`: Implement SQLite initialization (`init_db`), schema migrations, parameterized queries, daily deduplication, Hamming distance queries, monthly rollups, spike checks, and telemetry logging.
3. `backend/build_packs.py`: Implement market pack aggregation job computing trimmed medians and percentiles.
4. `backend/main.py`: Implement FastAPI endpoints (`/observe`, `/seen`, `/matches`, `/locality-stats`, `/analyze`, `/packs/*`, `/spike-check`, `/area-trend`, `/telemetry/*`), IP rate limiting, and Discord alert integration.

### Step 5: Implement UI & Extension Frontend
1. `extension/manifest.json`: Declare Manifest V3 service worker, storage permission, optional host permissions for Overpass, portal host permissions, icons, and CSP.
2. `extension/background.js`: Implement service worker `OffscreenCanvas` dHash generator, CORS image fetcher, and API proxy.
3. `extension/content.js`: Implement DOM observer, search-peer harvester, badge injector, expandable drawer, Area Report UI, Buyhatke sparklines, and Buyer Due Diligence cards.
4. `extension/styles.css`: Implement Apple HIG dark-mode styling, cyan `#38bdf8` contrast tokens, glassmorphism, drop box accordions, and floating scrollbars.
5. `extension/popup/`: Implement toolbar popup HTML, CSS, and JS controller.
6. `web-demo/`: Implement standalone browser testbed (`index.html`, `app.js`, `style.css`).

### Step 6: Full Verification & Test Execution
```bash
# 1. Execute all 270 JavaScript unit and integration tests
npm test

# 2. Execute all 30 Python backend unit and simulation tests
python -m pytest backend/tests -v

# 3. Verify zero rule drift on synthetic benchmark dataset
python eval/evaluate.py --dataset eval/labels.csv

# 4. Verify 100% accuracy on real-world multi-city listings
python eval/evaluate.py --dataset eval/real_listings.csv

# 5. Start FastAPI backend server
uvicorn backend.main:app --host 127.0.0.1 --port 8000 --reload

# 6. Start Web Demo testbed
npm run demo
# Access web demo at http://localhost:8080
```
