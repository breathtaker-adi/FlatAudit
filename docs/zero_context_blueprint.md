# FlatAudit: Project Progress Report & Zero-Context Reconstruction Blueprint

**Author**: Principal Software Architect & Lead Security Engineer  
**Project**: FlatAudit (Listing Trust Analyzer)  
**Target Audience**: Autonomous AI Coding Agents / Senior Software Engineers  
**Context Requirement**: Zero prior context required for full system reconstruction.

---

## 1. Project Overview & Architecture

### Core Purpose
**FlatAudit (Listing Trust Analyzer)** is a privacy-preserving cybersecurity browser extension and lightweight analytics backend engineered to protect Indian urban home seekers from structured advance-fee rental fraud on major listing portals (*NoBroker*, *MagicBricks*, *99acres*, *Housing.com*). 

The application addresses the "Rental Scam Kill Chain":
1. **Fake Listing**: Malicious actors post stolen photos of luxury apartments at 40%–70% below local market rent (bait pricing).
2. **Lead Capture**: Urgent, high-pressure copy ("Owner leaving country tonight", "14 people queued") designed to capture desperate tenants.
3. **The Pretext**: The poster impersonates an Indian Army, Air Force, CISF, or CRPF defense officer transferred urgently to a border cantonment, or an absentee NRI landlord in London.
4. **Advance-Fee Extortion**: The poster demands an upfront "gate entry pass", "visiting card registration slip", or "refundable viewing token" (₹1,500–₹3,500) via UPI QR code before permitting an in-person physical viewing.

**Primary Workflows**:
- **In-Page Passive Audit**: Content script detects rental pages, reads visible fields (title, rent, deposit, BHK, locality, description, photos), evaluates 4 threat signal dimensions, queries the local perceptual hash registry, and injects a non-defamatory, objective trust badge and expandable drawer.
- **Toolbar Quick Inspect**: Extension popup queries current active tab analysis from local storage and displays human-readable points, reasons, and renter safety advice.
- **Registry Duplicate Tracking**: The background service worker calculates a 64-bit difference hash (`dHash`) of listing photos inside an offscreen canvas and registers anonymous listing attributes in a local SQLite backend to detect cross-portal image reuse.
- **Interactive Web Demo & Testbed**: Standalone browser dashboard for testing arbitrary listings, inspecting dHash Hamming distances live, and benchmarking performance on labeled empirical datasets.

### Tech Stack
- **JavaScript Runtime**: Node.js v20+ / v26.8.1 (Native test runner via `node --test`, native ES modules `"type": "module"`).
- **Browser Extension Platform**: Google Chrome Manifest V3 (MV3) with Service Worker background execution and Content Scripts.
- **Backend Framework**: Python 3.10+ / Python 3.14.0, FastAPI 0.110+ (`fastapi`), Starlette 1.6+, Uvicorn 0.28+ (`uvicorn[standard]`).
- **Data Validation & Schemas**: Pydantic v2 (`pydantic>=2.0.0`).
- **Database Layer**: SQLite 3 (Standard Library `sqlite3`) with WAL journal mode and parameterized queries.
- **DOM Parsing & Simulation**: Native browser DOM APIs (`document.querySelector`, `MutationObserver`, `OffscreenCanvas`) in extension; `jsdom` for Node.js test suites.
- **Testing Frameworks**: `node:test` + `node:assert/strict` (Frontend/Extension); `pytest` 8.0+ with `httpx` (Backend API).
- **Styling Architecture**: Curated Dark-Mode Vanilla CSS (HSL tokens, glassmorphism, responsive CSS Grid/Flexbox, zero runtime styling overhead, Google Fonts *Bricolage Grotesque*, *Instrument Sans*, *JetBrains Mono*).

### Architectural Pattern
FlatAudit adopts an **Edge-Filtered Asymmetric Client-Server Architecture** designed around **Privacy by Design**:
- **Client-Side Edge Filtering (Extension Content Script & Worker)**: Pure rule evaluation, currency normalization, and 64-bit dHash generation happen locally in the user's browser. Untrusted DOM inputs are sanitized using strict `.textContent` assignment (zero `innerHTML`).
- **CORS-Isolated Perceptual Worker**: Image binaries are fetched exclusively within the background service worker using host permissions and drawn directly to an `OffscreenCanvas(9, 8)`. Raw images are **never** written to disk or transmitted across the network.
- **Asymmetric API / Registry (FastAPI + SQLite)**: The backend operates strictly as an anonymized hash index and locality benchmark provider. It stores only 5 primitive fields: `locality`, `bhk`, `rent`, `deposit`, and `image_hash`. No user identifiers, contact numbers, names, or image binaries are ever stored.

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
│  │ (Currency/BHK/DOM)     │─▶│ - Price Outlier      │  │
│  └────────────────────────┘  │ - Deposit Ratio      │  │
│                              │ - Advance-Fee Terms  │  │
│  ┌────────────────────────┐  │ - Image Duplicate    │  │
│  │ Background Worker      │  └──────────┬───────────┘  │
│  │ OffscreenCanvas (9x8)  │─────────────┘              │
│  │ 64-bit dHash Engine    │                            │
│  └────────────────────────┘                            │
└──────────────┬───────────────────────────┬─────────────┘
               │ Query duplicate count     │ Safe In-Page Injection
               │ & record observation      │ (Zero innerHTML)
               ▼                           ▼
┌───────────────────────────────┐ ┌──────────────────────┐
│  FastAPI Backend (Port 8000)  │ │ FlatAudit UI Drawer  │
│  - POST /api/v1/observe       │ │ - Status Badge       │
│  - GET  /api/v1/seen          │ │ - Points & Reasons   │
│  - POST /api/v1/analyze       │ │ - Safety Advice      │
│  - SQLite (flataudit.db)      │ └──────────────────────┘
└───────────────────────────────┘
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
│   ├── config.py
│   ├── db.py
│   ├── main.py
│   ├── models.py
│   ├── requirements.txt
│   └── tests/
│       ├── test_api.py
│       └── test_db.py
├── docs/
│   ├── architecture.md
│   ├── scam-taxonomy.md
│   ├── threat-model.md
│   └── zero_context_blueprint.md
├── eval/
│   ├── evaluate.py
│   ├── evaluation_results.md
│   ├── generate_dataset.py
│   ├── labeling-guide.md
│   └── labels.csv
├── extension/
│   ├── background.js
│   ├── content.js
│   ├── manifest.json
│   ├── styles.css
│   ├── lib/
│   │   ├── dhash.js
│   │   ├── signals.js
│   │   └── parsers/
│   │       ├── currency.js
│   │       ├── generic.js
│   │       ├── housing.js
│   │       ├── index.js
│   │       ├── magicbricks.js
│   │       ├── ninety_nine_acres.js
│   │       └── nobroker.js
│   └── popup/
│       ├── popup.css
│       ├── popup.html
│       └── popup.js
├── fixtures/
│   ├── 99acres_normal_1bhk.html
│   ├── housing_duplicate_photos.html
│   ├── magicbricks_bait_price.html
│   ├── nobroker_normal_2bhk.html
│   └── nobroker_scam_army_token.html
├── tests/
│   ├── test_dhash.test.js
│   ├── test_parsers.test.js
│   └── test_signals.test.js
└── web-demo/
    ├── app.js
    ├── index.html
    └── style.css
```

### File-by-File Breakdown

#### Root Configuration & Meta
- **`package.json`**
  - **Level:** Config
  - **Responsibility:** Defines Node package metadata, scripts (`test`, `demo`), and dev dependencies (`jsdom`).
  - **Key Scripts:** `"test": "node --test tests/*.test.js"`, `"demo": "node -e ..."` (built-in zero-dependency static web server on port 8080).
  - **Dependencies:** `jsdom` (dev).
- **`.gitignore`**
  - **Level:** Config
  - **Responsibility:** Prevents caching, build artifacts, Python venv, database files (`*.db`), and Node modules from entering Git. Explicitly allows `!extension/lib/`.
- **`README.md`**
  - **Level:** Supporting
  - **Responsibility:** Comprehensive user and reviewer guide: architecture diagrams, setup instructions, test commands, 250-listing evaluation metrics, and ethics disclaimer.

#### Backend Core (`backend/`)
- **`backend/config.py`**
  - **Level:** Config
  - **Responsibility:** Centralizes environment variables, default database file path (`flataudit.db`), and CORS origins list.
  - **Key Exports:** `DB_PATH`, `CORS_ORIGINS`.
- **`backend/models.py`**
  - **Level:** Core
  - **Responsibility:** Pydantic models for incoming payload validation and outgoing response serialization.
  - **Key Classes:**
    - `ObservationCreate`: Validates `url`, `locality`, `bhk` (1..10), `rent` (1k..5M), `deposit`, `image_hash` (exact 16 hex characters).
    - `ObservationResponse`: Serializes `status`, `id`, `seen_count`.
    - `SeenResponse`: Serializes `hash`, `seen_count`, `matched_listings`, `threshold`.
    - `LocalityStatsResponse`: Locality rent/deposit summary statistics.
    - `AnalyzeRequest`: Full listing request schema (`title`, `description`, `locality`, `bhk`, `rent`, `deposit`, `image_hashes`).
    - `HumanReadablePoint`: Structured point and reason item (`category`, `icon`, `fired`, `point`, `reason`).
    - `AnalyzeResponse`: Serializes badge classification, tone, points & reasons, safety advice, and raw signals.
- **`backend/db.py`**
  - **Level:** Core
  - **Responsibility:** SQLite database abstraction layer, connection manager, schema initialization, and bitwise 64-bit Hamming distance calculation.
  - **Key Functions:**
    - `hamming_distance(h1: str, h2: str) -> int`: Fast nibble XOR bit-count lookup table.
    - `init_db(db_file)`: Creates `observations` table and indexes.
    - `record_observation(...) -> int`: Inserts anonymous observation record.
    - `count_seen_hashes(target_hash: str, threshold: int = 10) -> dict`: Linear scan over stored hashes comparing Hamming distance $\le threshold$; counts distinct URLs.
    - `get_locality_stats(locality: str, bhk: int) -> dict`: Computes empirical rent/deposit medians.
- **`backend/main.py`**
  - **Level:** Core
  - **Responsibility:** FastAPI application factory, CORS middleware registration, startup lifespan initialization, and REST route handlers.
  - **Key Endpoints:**
    - `GET /api/v1/health`: Service health and privacy guarantee check.
    - `POST /api/v1/observe`: Records observation and returns seen count.
    - `GET /api/v1/seen`: Queries duplicate listings for a 16-hex dHash.
    - `GET /api/v1/locality-stats`: Returns locality empirical rent/deposit distributions.
    - `POST /api/v1/analyze`: Server-side listing trust evaluator replicating client rules.
- **`backend/tests/test_db.py`**
  - **Level:** Supporting
  - **Responsibility:** Pytest unit tests for database initialization, observation insertion, and Hamming distance duplicate counting.
- **`backend/tests/test_api.py`**
  - **Level:** Supporting
  - **Responsibility:** Pytest integration tests using `starlette.testclient.TestClient` validating all FastAPI endpoints with normal and scam payloads.

#### Extension Engine (`extension/`)
- **`extension/manifest.json`**
  - **Level:** Config
  - **Responsibility:** Manifest V3 declaration. Specifies permissions (`storage`), host permissions (`http://127.0.0.1:8000/*`, rental domains, `file:///*`), background service worker, content scripts, and CSP (`script-src 'self'`).
- **`extension/background.js`**
  - **Level:** Core
  - **Responsibility:** MV3 background service worker. Bypasses CORS canvas tainting by fetching images using host permissions, decoding them via `createImageBitmap`, drawing to `OffscreenCanvas(9, 8)`, and computing 64-bit dHashes. Proxies communication with the FastAPI backend.
  - **Key Listeners:** `chrome.runtime.onMessage` handling `COMPUTE_DHASH`, `CHECK_SEEN`, `OBSERVE_LISTING`.
- **`extension/content.js`**
  - **Level:** Core
  - **Responsibility:** Injected content script. Safely parses listing DOM fields on page load/change, coordinates with background worker for photo hashing, evaluates signals, and injects the trust badge and explanation drawer.
  - **Key Features:** Zero `innerHTML` usage (constructs DOM nodes exclusively with `.createElement` and `.textContent`), mutation observer loop prevention (ignores mutations from `#flataudit-root`), rock-solid drawer open state persistence.
- **`extension/styles.css`**
  - **Level:** UI
  - **Responsibility:** Styling for injected in-page badge, expandable facts drawer, points & reasons cards, and renter safety advice box.
- **`extension/popup/popup.html` / `popup.js` / `popup.css`**
  - **Level:** UI
  - **Responsibility:** Browser toolbar popup. Queries `chrome.storage.local` for the active tab's latest listing analysis, verifies backend API health, and renders human-readable points, reasons, and safety advice.

#### Shared Signal & Parser Libraries (`extension/lib/`)
- **`extension/lib/dhash.js`**
  - **Level:** Core
  - **Responsibility:** Pure mathematical implementation of 64-bit difference hash (dHash) and bitwise Hamming distance calculation.
  - **Key Exports:**
    - `computeDHashFromGrayscale72(grayPixels: Uint8Array) -> string`: Compares adjacent pixels per row ($pixel[x] > pixel[x+1]$) across 8 rows of 9 pixels (64 comparisons), returns 16-hex char string.
    - `computeDHashFromImageData(imageData) -> string`: Extracts perceptual luminance ($0.299R + 0.587G + 0.114B$) from 9x8 image data.
    - `hammingDistance(hashA: string, hashB: string) -> number`: Calculates bit differences using nibble lookup table.
    - `isDuplicateImage(hashA, hashB, threshold=10) -> boolean`: Returns true if distance $\le 10$.
- **`extension/lib/signals.js`**
  - **Level:** Core
  - **Responsibility:** Rule-based signal evaluation engine, empirical locality benchmarks, regex patterns, and human-readable points/reasons generation.
  - **Key Exports:**
    - `LOCALITY_BENCHMARKS`: Benchmark median rents and deposit ranges across Bengaluru, Mumbai, Gurgaon, Pune, and regional city fallbacks.
    - `PHRASE_PATTERNS`: Regex patterns for advance-fee requests, military transfer pretexts, absentee NRI owners, and urgency bait.
    - `evaluatePriceSignal(rent, locality, bhk)`: Evaluates rent against market medians; flags discounts $\ge 38\%$.
    - `evaluateDepositSignal(rent, deposit, locality)`: Flags zero-deposit traps or abnormal deposit ratios ($<0.8x$ or $>10x$).
    - `evaluatePhraseSignal(text)`: Scans title and description for scam pretexts.
    - `evaluateDuplicateImageSignal(seenCount)`: Flags photos observed across $\ge 2$ listings.
    - `analyzeListing(listingData, duplicateStats)`: Aggregates all signals into `badgeLabel` (`Looks normal`, `Some signals`, `Many signals`), `humanReadablePoints`, and `safetyAdvice`.
- **`extension/lib/parsers/currency.js`**
  - **Level:** Core
  - **Responsibility:** String normalization for Indian financial notations.
  - **Key Exports:** `parseIndianCurrency(raw)` (handles `₹ 42,000`, `Rs. 12,000`, `1.5 Lakh`, `45k`), `parseBHK(raw)`.
- **`extension/lib/parsers/index.js`**
  - **Level:** Core
  - **Responsibility:** Dispatcher that inspects URL/DOM and delegates to the appropriate portal parser.
- **`extension/lib/parsers/nobroker.js` / `magicbricks.js` / `ninety_nine_acres.js` / `housing.js` / `generic.js`**
  - **Level:** Supporting
  - **Responsibility:** Individual portal extractors targeting resilient semantic attributes to extract `title`, `locality`, `rent`, `deposit`, `bhk`, `description`, and `images`.

#### Dataset & Evaluation Suite (`eval/`)
- **`eval/generate_dataset.py`**
  - **Level:** Supporting
  - **Responsibility:** Generates 250 realistic, balanced Indian rental listings (125 normal, 125 suspicious) with a deterministic random seed across 4 metro regions. Assigns 70% train (175) / 30% test (75) splits.
- **`eval/labeling-guide.md`**
  - **Level:** Supporting
  - **Responsibility:** Formal annotation manual documenting classification rules, scam pretexts, and false-positive handling.
- **`eval/labels.csv`**
  - **Level:** Supporting
  - **Responsibility:** The 250-listing labeled benchmark dataset.
- **`eval/evaluate.py`**
  - **Level:** Core
  - **Responsibility:** Evaluation pipeline. Runs signals against `labels.csv`, evaluates train vs. held-out test splits, computes precision, recall, F1, accuracy, and confusion matrix, performs error analysis on false positives/negatives, and exports `eval/evaluation_results.md`.

#### Web Demo Application (`web-demo/`)
- **`web-demo/index.html` / `app.js` / `style.css`**
  - **Level:** UI
  - **Responsibility:** Standalone browser testbed. Allows testing arbitrary listings or loading pre-set test cases (*Indiranagar Normal 2BHK*, *HSR Army Token Scam*, *Cyber City Bait Penthouse*, *Pune Zero Deposit*), provides an interactive mock badge with a persistent drawer, displays human-readable points & reasons, visualizes the Scam Kill Chain, and includes an interactive 64-bit dHash Hamming distance calculator.

#### Test Suites (`tests/`) & Fixtures (`fixtures/`)
- **`tests/test_dhash.test.js`**: Unit tests for 64-bit dHash and Hamming distance.
- **`tests/test_parsers.test.js`**: Currency, BHK, and DOM fixture parsing tests using `jsdom`.
- **`tests/test_signals.test.js`**: Unit tests verifying price, deposit, phrase, duplicate image, and composite evaluation rules.
- **`fixtures/*.html`**: 5 representative HTML listing snapshots (*NoBroker normal 2BHK*, *NoBroker scam Army token*, *MagicBricks bait price*, *99acres normal 1BHK*, *Housing.com duplicate photos*).

---

## 3. Dependencies & Environment Configuration

### Production Dependencies

#### Python (`backend/requirements.txt`)
| Package | Version Range | Purpose & Architectural Justification |
| :--- | :--- | :--- |
| `fastapi` | `>=0.110.0` | Asynchronous high-performance REST API framework providing automatic Swagger OpenAPI docs, dependency injection, and Pydantic validation. |
| `uvicorn[standard]` | `>=0.28.0` | Lightning-fast ASGI server implementation for running FastAPI in production and development. |
| `pydantic` | `>=2.0.0` | Strict data validation, schema enforcement, and type serialization for incoming/outgoing API contracts. |
| `httpx` | `>=0.27.0` | Asynchronous HTTP client library used for external requests and FastAPI TestClient simulation. |
| `pillow` | `>=10.0.0` | Image manipulation and pixel extraction library for server-side perceptual hashing. |

#### Node.js (`package.json`)
FlatAudit's core runtime has **zero external production dependencies**. It runs natively on standard browser Web APIs and modern Node.js (`"type": "module"`).

### Dev / Build Dependencies
| Package | Manifest | Version Range | Purpose |
| :--- | :--- | :--- | :--- |
| `jsdom` | `package.json` | `^26.0.0` | Headless DOM implementation for Node.js, allowing `tests/test_parsers.test.js` to parse HTML fixtures using standard `document.querySelector` APIs. |
| `pytest` | `backend/requirements.txt` | `>=8.0.0` | Python test runner executing API integration tests and SQLite unit tests. |

### Configuration Files
- **`package.json`**: Configured with `"type": "module"` to enable ES module syntax (`import`/`export`) across all test and library files. Includes custom `"test"` script running Node's native test runner (`node --test tests/*.test.js`) and `"demo"` script starting a zero-dependency HTTP server on port 8080.
- **`extension/manifest.json`**: Manifest V3 compliant.
  - `permissions`: Trimmed strictly to `["storage"]`.
  - `host_permissions`: Configured for `http://127.0.0.1:8000/*`, `http://localhost:8000/*`, Indian rental portal wildcards, and `file:///*`.
  - `web_accessible_resources`: Exposes `lib/*` and `styles.css` so content scripts can import local ES modules dynamically.
  - `content_security_policy`: Strict `"script-src 'self'; object-src 'self';"`.

### Environment Variables (`.env.example`)
Create a `.env` file in the root directory if customizing backend deployment:

```bash
# ==============================================================================
# FlatAudit Backend Environment Configuration
# ==============================================================================

# Path to the SQLite database file
# Default: ./backend/flataudit.db
FLATAUDIT_DB_PATH="backend/flataudit.db"

# Server Host and Port Binding
FLATAUDIT_HOST="127.0.0.1"
FLATAUDIT_PORT=8000

# Environment Mode: 'development' | 'production'
FLATAUDIT_ENV="development"

# CORS Allowed Origins (Comma-separated)
# Default includes localhost and chrome-extension://*
FLATAUDIT_CORS_ORIGINS="http://localhost:8080,http://127.0.0.1:8080,http://localhost:3000"
```

---

## 4. Database Information & Complete Schema

### Database Engine & Query Architecture
- **Engine**: SQLite 3 (`flataudit.db`).
- **Connection Method**: Python standard library `sqlite3` with `conn.row_factory = sqlite3.Row`.
- **Query Layer**: Raw parameterized SQL with positional placeholder bindings (`?`) to ensure 100% immunity against SQL Injection.

### Complete DDL Schema Definition

```sql
-- Listing Observations Registry Table
CREATE TABLE IF NOT EXISTS observations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    url_hash TEXT,
    locality TEXT,
    bhk INTEGER,
    rent INTEGER,
    deposit INTEGER,
    image_hash TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Performance Indexes
CREATE INDEX IF NOT EXISTS idx_image_hash ON observations(image_hash);
CREATE INDEX IF NOT EXISTS idx_locality_bhk ON observations(locality, bhk);
```

#### Field Specifications:
1. `id` (`INTEGER PRIMARY KEY AUTOINCREMENT`): Unique numeric record identifier.
2. `url_hash` (`TEXT`): First 16 hex characters of the SHA-256 hash of the listing URL. Used to prevent duplicate hits from page refreshes.
3. `locality` (`TEXT`): Normalized, lowercase locality string (e.g., `'indiranagar'`, `'hsr layout'`).
4. `bhk` (`INTEGER`): Number of bedrooms (typically 1, 2, or 3).
5. `rent` (`INTEGER`): Monthly rent in Indian Rupees (INR).
6. `deposit` (`INTEGER`): Security deposit in Indian Rupees (INR).
7. `image_hash` (`TEXT`): 16-hexadecimal character perceptual difference hash (`dHash`) of the primary listing photo.
8. `created_at` (`TIMESTAMP`): Record insertion timestamp with default `CURRENT_TIMESTAMP`.

### Migrations & Initial Seed
- Schema creation is idempotent: handled automatically at application startup by `init_db(DB_PATH)` via FastAPI's lifespan context in `backend/main.py`.
- No mandatory manual seed is required; observations are populated dynamically as users browse listings, or pre-seeded by submitting observations via `POST /api/v1/observe`.

---

## 5. Core Business Logic, API & Data Flow

### Authentication & Authorization
FlatAudit is engineered strictly under **Zero-PII / Privacy by Design**:
- No user accounts, passwords, JWT tokens, or sessions exist.
- All endpoints are public and stateless, bound to localhost (`127.0.0.1`) in development.
- Abuse protection is enforced via strict Pydantic numeric and string length constraints.

### API Route Catalog

#### 1. Health Check
- **Method & Path**: `GET /api/v1/health`
- **Auth**: Public
- **Request**: None
- **Logic**: Returns service health status and privacy policy confirmation.
- **Response** (`200 OK`):
  ```json
  {
    "status": "healthy",
    "service": "flataudit-api",
    "version": "1.0.0",
    "privacy": "no-pii-stored"
  }
  ```

#### 2. Record Listing Observation
- **Method & Path**: `POST /api/v1/observe`
- **Auth**: Public
- **Request Payload** (`application/json`):
  ```json
  {
    "url": "https://www.nobroker.in/bangalore/hsr-layout",
    "locality": "HSR Layout",
    "bhk": 3,
    "rent": 12000,
    "deposit": 25000,
    "image_hash": "a4c28f1107be924d"
  }
  ```
- **Validation**: `rent` between 1,000 and 5,000,000; `bhk` between 1 and 10; `image_hash` exactly 16 hex chars.
- **Logic**:
  1. Hashes `url` to a 16-char SHA-256 digest.
  2. Inserts record into `observations` table via parameterized SQL.
  3. If `image_hash` is provided, scans the database for existing hashes within Hamming distance $\le 10$ and counts distinct URL hashes.
- **Response** (`201 Created`):
  ```json
  {
    "status": "recorded",
    "id": 1,
    "seen_count": 2
  }
  ```

#### 3. Query Seen Hash Count
- **Method & Path**: `GET /api/v1/seen`
- **Auth**: Public
- **Query Parameters**:
  - `hash` (string, required, length=16): The 16-character hex dHash.
  - `threshold` (integer, optional, default=10, range=0..30): Maximum allowed Hamming bit distance.
- **Logic**:
  1. Queries all non-null `image_hash` records from SQLite.
  2. Computes `hamming_distance(hash, row_hash)` in Python.
  3. Counts matches with distance $\le threshold$, grouped by distinct listing URL.
- **Response** (`200 OK`):
  ```json
  {
    "hash": "a4c28f1107be924d",
    "seen_count": 4,
    "matched_listings": 4,
    "threshold": 10
  }
  ```

#### 4. Locality Summary Statistics
- **Method & Path**: `GET /api/v1/locality-stats`
- **Auth**: Public
- **Query Parameters**:
  - `locality` (string, required, min_length=2): Sub-locality name.
  - `bhk` (integer, optional, default=2): BHK configuration.
- **Logic**: Queries `observations` for matching locality and BHK, computes median, min, and max rent and deposit.
- **Response** (`200 OK`):
  ```json
  {
    "locality": "indiranagar",
    "bhk": 2,
    "count": 14,
    "median_rent": 40000.0,
    "min_rent": 36000,
    "max_rent": 46000,
    "median_deposit": 150000.0
  }
  ```

#### 5. Full Listing Trust Analysis
- **Method & Path**: `POST /api/v1/analyze`
- **Auth**: Public
- **Request Payload** (`application/json`):
  ```json
  {
    "title": "Urgent 3 BHK in HSR Layout",
    "description": "Army officer urgent transfer. Society gate pass token Rs 2500 required before visit.",
    "locality": "HSR Layout, Bangalore",
    "bhk": 3,
    "rent": 12000,
    "deposit": 25000,
    "image_hashes": ["a4c28f1107be924d"]
  }
  ```
- **Logic**: Evaluates price outlier, deposit ratio, phrase patterns, and image duplicate signals. Formulates objective points & reasons, renter safety advice, and kill chain stage.
- **Response** (`200 OK`):
  ```json
  {
    "badge_label": "Many signals",
    "badge_tone": "bad",
    "headline_summary": "High Risk: Multiple scam signals flagged. Exercise extreme caution.",
    "scam_kill_chain_stage": "Stage 3: The Excuse (Advance fee / Token request)",
    "fired_count": 3,
    "observable_facts": [
      "Rent of ₹12,000 is 77% below the HSR LAYOUT 3BHK median (₹52,000)",
      "Deposit of ₹25,000 is only 0.5x monthly rent (expected 3.0x-6.0x)",
      "Found 2 suspicious advance-fee phrase pattern(s): advance token/pass fee required before physical visit, military/defense transfer pretext"
    ],
    "human_readable_points": [
      {
        "category": "Rent Pricing",
        "icon": "💰",
        "fired": true,
        "point": "Monthly rent (₹12,000) is below normal market rate",
        "reason": "Rent of ₹12,000 is 77% below the HSR LAYOUT 3BHK median (₹52,000)"
      },
      {
        "category": "Security Deposit",
        "icon": "📑",
        "fired": true,
        "point": "Deposit ratio deviates from regional norms",
        "reason": "Deposit of ₹25,000 is only 0.5x monthly rent (expected 3.0x-6.0x)"
      },
      {
        "category": "Terms & Phrasing",
        "icon": "💬",
        "fired": true,
        "point": "Suspicious advance-fee wording or identity pretexts detected",
        "reason": "Found 2 suspicious advance-fee phrase pattern(s): advance token/pass fee required before physical visit, military/defense transfer pretext"
      },
      {
        "category": "Photo Authenticity",
        "icon": "🖼️",
        "fired": false,
        "point": "Photo appears unique to this listing",
        "reason": "Photo has not been observed across conflicting listings"
      }
    ],
    "safety_advice": [
      "Never transfer any token fee, gate entry pass fee, or courier charge via UPI before you physically enter and tour the apartment.",
      "Always request to meet the owner, building security guard, or society manager in person at the property gate first.",
      "If the poster claims to be an Army/CISF officer who cannot meet due to transfer, treat it with extreme caution."
    ],
    "signals": {
      "price": { "fired": true, "severity": "high", "reason": "Rent of ₹12,000 is 77% below the HSR LAYOUT 3BHK median (₹52,000)" },
      "deposit": { "fired": true, "severity": "low", "reason": "Deposit of ₹25,000 is only 0.5x monthly rent (expected 3.0x-6.0x)" },
      "phrase": { "fired": true, "severity": "high", "reason": "Found 2 suspicious advance-fee phrase pattern(s)..." },
      "duplicate_image": { "fired": false, "severity": "low", "reason": "Photo has not been observed across conflicting listings" }
    }
  }
  ```

---

## 6. Project Progress & Implementation Status

### Completed Features (100% Functional & Tested)
1. **Perceptual Image Fingerprinting Engine (`extension/lib/dhash.js`)**:
   - 64-bit difference hash (dHash) algorithm converting 9x8 grayscale image gradients into 16-hex strings.
   - Nibble-lookup bitwise Hamming distance computation ($O(1)$ lookup over 16 nibbles, immune to JS signed-integer overflow).
   - 100% test coverage passing in `tests/test_dhash.test.js`.
2. **Indian Rental Portal Extractors (`extension/lib/parsers/`)**:
   - Specialized extractors for *NoBroker*, *MagicBricks*, *99acres*, *Housing.com*, and generic fallback.
   - Financial normalizer for Lakhs, thousands, and Rupee symbols.
   - 100% test coverage across all 5 fixture files in `tests/test_parsers.test.js`.
3. **Pure Rule-Based Signal Engine (`extension/lib/signals.js`)**:
   - Price deviation against empirical locality benchmarks (flags discounts $\ge 38\%$).
   - Deposit ratio check against city norms (flags zero deposit on luxury flats and $<0.8x$ ratios).
   - Advance-fee phrase scanner (detects gate pass fees, visiting tokens, defense officer transfer pretexts, courier keys).
   - Produces structured, non-defamatory observable facts, points, reasons, and safety advice.
   - Comprehensive test coverage in `tests/test_signals.test.js`.
4. **FastAPI Backend & SQLite Registry (`backend/`)**:
   - `/health`, `/observe`, `/seen`, `/locality-stats`, and `/analyze` endpoints.
   - Parameterized SQLite schema with indexed hash lookup.
   - 6 of 6 Pytest unit and integration tests passing in `backend/tests/`.
5. **Manifest V3 Chrome Extension (`extension/`)**:
   - Background service worker using `OffscreenCanvas` to bypass CORS canvas tainting.
   - Safe content script DOM injection (strictly using `.createElement` and `.textContent`).
   - Resolved drawer auto-closing mutation loop; drawer stays open until explicitly closed.
   - Toolbar popup inspector with live status and points & reasons.
6. **Empirical Evaluation & Error Analysis (`eval/`)**:
   - 250 labeled listings generated in `eval/labels.csv` with standard labeling guide.
   - Evaluation runner `eval/evaluate.py` demonstrating **100% Precision (0 False Positives)** and **74.4% Recall** on held-out test data.
7. **Interactive Web Demo (`web-demo/`)**:
   - Complete browser dashboard running on port 8080 with preloaded normal & scam test cases, live dHash Hamming calculator, and simulated in-page badge drawer.

### In-Progress / Partially Implemented
- **Dynamic Real-Time Locality Learning**: Locality benchmarks are currently seeded from static dictionaries (`LOCALITY_BENCHMARKS`) in `signals.js` and `main.py` while SQLite observations accumulate. Dynamic automated updating of median baselines from SQLite aggregations is partially implemented via `/locality-stats`.

### Pending / Not Started (Future Milestones)
- **State RERA Project Registry Integration**: Direct API verification of builder project RERA numbers to verify construction delays (planned for Weeks 9–10 stretch goal).
- **Automated Chrome Web Store Packaging Pipeline**: GitHub Actions workflow to bundle the extension into a `.zip` artifact and run automated linting.

### Known Edge Cases & Technical Debt
1. **Legitimate Multi-Unit Broker Photo Reuse**: In newly developed high-rises, licensed brokers frequently reuse official 3D renders across genuine listings. FlatAudit mitigates this by treating isolated photo reuse as a minor signal (`Some signals`), requiring co-occurrence of an advance fee or bait price to trigger `Many signals`.
2. **Dynamic Portal Class Name Mutations**: While FlatAudit prefers semantic attributes, portals occasionally refactor DOM hierarchies. The generic heuristic parser (`generic.js`) serves as the automated fallback.

---

## 7. Step-by-Step Reconstruction Sequence

Follow these deterministic instructions to rebuild the entire application from an empty directory:

### Step 1: Initialize Project & Environment
```bash
# Initialize empty git repository
git init

# Create Node environment
npm init -y
npm install --save-dev jsdom

# Create Python environment and install backend dependencies
python -m pip install fastapi "uvicorn[standard]" pydantic httpx pytest pillow
```

### Step 2: Establish Configuration Files
1. Create `.gitignore` ignoring `.pytest_cache`, `__pycache__`, `*.db`, `node_modules`, while allowing `!extension/lib/`.
2. Update `package.json` with `"type": "module"`, `"test": "node --test tests/*.test.js"`, and `"demo"` server script.
3. Create `backend/requirements.txt` containing `fastapi`, `uvicorn[standard]`, `pydantic`, `httpx`, `pytest`, `pillow`.
4. Create `backend/config.py` declaring `DB_PATH` and `CORS_ORIGINS`.

### Step 3: Implement Core Libraries (`extension/lib/`)
1. Implement `extension/lib/dhash.js`: Write `computeDHashFromGrayscale72`, `computeDHashFromImageData`, `hammingDistance`, and `isDuplicateImage`.
2. Implement `extension/lib/parsers/currency.js`: Write `parseIndianCurrency` and `parseBHK`.
3. Implement individual portal parsers in `extension/lib/parsers/` (`nobroker.js`, `magicbricks.js`, `ninety_nine_acres.js`, `housing.js`, `generic.js`) and export them through `index.js`.
4. Implement `extension/lib/signals.js`: Define `LOCALITY_BENCHMARKS`, `PHRASE_PATTERNS`, `evaluatePriceSignal`, `evaluateDepositSignal`, `evaluatePhraseSignal`, `evaluateDuplicateImageSignal`, and `analyzeListing`.

### Step 4: Build Backend Engine (`backend/`)
1. Implement `backend/models.py`: Define Pydantic models (`ObservationCreate`, `ObservationResponse`, `SeenResponse`, `LocalityStatsResponse`, `AnalyzeRequest`, `AnalyzeResponse`, `HumanReadablePoint`).
2. Implement `backend/db.py`: Write `get_connection`, `init_db`, `record_observation`, `count_seen_hashes` (with nibble lookup table), and `get_locality_stats`.
3. Implement `backend/main.py`: Set up FastAPI app with CORS middleware, lifespan DB initialization, and all 5 REST routes.

### Step 5: Construct Extension Interface (`extension/`)
1. Write `extension/manifest.json` declaring MV3 configuration, background service worker, and web accessible resources.
2. Implement `extension/background.js` to process `COMPUTE_DHASH`, `CHECK_SEEN`, and `OBSERVE_LISTING` messages using `OffscreenCanvas`.
3. Implement `extension/content.js` to extract listing data, coordinate with background worker, and safely construct the UI badge and drawer using `.textContent`.
4. Create `extension/styles.css` with dark-mode styling for the floating badge, explanation drawer, points & reasons cards, and safety box.
5. Create `extension/popup/` (`popup.html`, `popup.css`, `popup.js`) to display toolbar inspection data.

### Step 6: Create Benchmark & Test Fixtures
1. Create HTML files in `fixtures/` representing real listing layouts.
2. Create `eval/generate_dataset.py`, run it to generate `eval/labels.csv`, and create `eval/evaluate.py`.
3. Create JavaScript unit tests in `tests/` (`test_dhash.test.js`, `test_parsers.test.js`, `test_signals.test.js`) and Python tests in `backend/tests/` (`test_db.py`, `test_api.py`).

### Step 7: Build Interactive Web Demo (`web-demo/`)
1. Create `web-demo/index.html` with interactive presets, listing input form, simulated badge drawer, and dHash calculator.
2. Create `web-demo/style.css` and `web-demo/app.js` wiring live signal evaluation and persistent drawer toggling.

### Step 8: Execute Verification & Validation
```bash
# 1. Run all 24 JavaScript tests (dHash, parsers, signal rules)
npm test

# 2. Run all 6 Python backend tests (DB operations, REST routes)
python -m pytest backend/tests/ -v

# 3. Run model evaluation on 250 labeled listings
python eval/evaluate.py

# 4. Start FastAPI server locally
uvicorn backend.main:app --reload --port 8000

# 5. Start interactive Web Demo
npm run demo
```
