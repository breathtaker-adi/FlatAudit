# FlatAudit - Chrome Web Store Listing Specification

**Official Name**: FlatAudit - Rental Scam Detector & Price Tracker  
**Short Name**: FlatAudit  
**Version**: 1.0.0  
**Target Category**: Search Tools / Productivity / Shopping  
**Primary Language**: English  
**Pricing**: Free (Open Source, MIT)

---

## 1. Store Summary (128 characters / 132 max)
Detect rental scam signals (advance fees, fake photos, bait rents) and track price history on NoBroker, MagicBricks, 99acres & Housing.

---

## 2. Detailed Store Description

FlatAudit is an open-source, privacy-preserving browser extension and rental companion engineered for Indian urban tenants searching on NoBroker, MagicBricks, 99acres, and Housing.com. 

It solves two critical problems in the Indian rental market:
1. **Advance-Fee Rental Extortion**: Flags fraudulent listings demanding upfront "gate pass fees", "visiting tokens", or impersonating military/defense officers before physical flat visits.
2. **Rental Price Opacity**: Acts as a "Buyhatke for property" — recording rent history snapshots, alerting to price drops upon revisit, rendering inline SVG sparklines, and providing side-by-side comparison tables.

---

### 🛡️ Trust & Safety Features
- **Observable-Facts Explanations**: No defamatory personal accusations. The extension presents clear, verifiable data points (e.g., *"Rent is 72% below HSR Layout 3BHK median"*, *"Advance visiting token phrase detected"*).
- **Perceptual Image Fingerprinting (dHash)**: Computes a 64-bit difference hash locally in your browser to detect stolen or repeated photos across multiple listings without transmitting image files to any cloud server.
- **Dynamic 5-Step Benchmark Fallback Ladder**: Replaces hardcoded rupee thresholds with robust non-parametric statistics (Median & Median Absolute Deviation) evaluated across peer pages, local area cells, district clusters, and city baselines.
- **Positive Verification on Normal Listings**: Legitimate properties display positive verification points confirming market rent alignment, standard deposit ratio, and clean phrasing.

---

### 📈 Buyhatke-Style Property Companion
- **Inline Price History Sparklines**: Generates zero-dependency mathematical SVG sparklines directly in the listing page.
- **Price Drop Alerts**: Automatically alerts you when a landlord lowers the rent on a property you've viewed (`↓ ₹2,000 (-5.0%)`).
- **Side-by-Side Comparison Matrix**: Select 2 to 4 listings to view an automated breakdown of Rent, Deposit Multiple, Area (sq.ft), Rent per sq.ft, and Floor Level.
- **One-Click CSV Export**: Download your saved shortlist and price histories for offline review or sharing with roommates.

---

### 🔒 Privacy by Design Guarantees
- **Zero Cloud Photo Transmission**: Images are processed in a local background service worker using `OffscreenCanvas`. No image binaries are ever saved to disk or transmitted to our backend.
- **Local-First Watchlist**: All watchlists, personal notes, and price snapshots are stored exclusively in your browser's `chrome.storage.local`.
- **Zero PII**: No names, phone numbers, email addresses, or personal contact details are ever collected or stored.
- **Non-Invasive**: FlatAudit only analyzes listings you actively visit in your browser. It performs no automated background scraping.

---

## 3. Chrome Web Store Permissions Justification

| Permission | Technical Requirement | User Privacy Guarantee |
| :--- | :--- | :--- |
| `storage` | Required to store your watchlist, price snapshots, and personal notes locally on your machine. | All data resides in `chrome.storage.local`. Nothing is synced or shared without your explicit action. |
| `host_permissions` (`*.nobroker.in/*`, `*.magicbricks.com/*`, `*.99acres.com/*`, `*.housing.com/*`) | Required to read listing details on supported rental portals and allow the background service worker to fetch listing photos into an `OffscreenCanvas` for local 64-bit dHash computation without canvas tainting. | Only executes on rental listing pages. Zero automated web crawling. |
| `http://127.0.0.1:8000/*` | Required for the optional local analytics server and cross-portal duplicate check. | Fully configurable via extension settings (`flataudit_api_url`). The extension remains 100% functional offline using built-in static market packs. |

---

## 4. Single Purpose Declaration
The single purpose of FlatAudit is to assist tenants in verifying rental listing credibility and tracking rental price changes on supported Indian real estate portals.

---

## 5. Store Asset Specifications

- **Extension Icon**: 128×128 PNG (`extension/icons/icon128.png`)
- **Promo Tile (Small)**: 440×280 PNG (Shield trust badge over rental portal preview)
- **Promo Tile (Marquee)**: 1400×560 PNG
- **Screenshots (1280×800 PNG)**:
  1. `screenshot_1_trust_badge.png`: In-page floating badge and expandable drawer showing observable signals.
  2. `screenshot_2_verified_listing.png`: Positive verification breakdown on a legitimate listing.
  3. `screenshot_3_sparkline_watchlist.png`: Buyhatke price history sparkline and price drop notification.
  4. `screenshot_4_comparison_matrix.png`: Side-by-side comparison matrix with best-value highlights.
  5. `screenshot_5_anonymous_feedback.png`: User feedback tool and offline benchmark indicator.
