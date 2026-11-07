# FlatAudit Privacy Policy & Terms of Service Statement

**Last Updated**: October 2026  
**Version**: 1.0.0  
**Commitment**: Local-First, Zero-PII, Privacy by Design  

---

## 1. Core Privacy Philosophy

FlatAudit was designed from the first line of code with a strict **Privacy by Design** architecture. We believe that protecting renters from fraud should never come at the cost of surrendering their personal data, browsing habits, or communications.

---

## 2. Information We Process & Where It Stays

### A. Data Processed Locally in Your Browser (Client-Only)
When you navigate to a supported rental listing (*NoBroker*, *MagicBricks*, *99acres*, *Housing.com*), the FlatAudit extension inspects only the visible webpage in your active tab:
- **Public Listing Details**: Monthly rent, security deposit, BHK configuration, super built-up/carpet area, floor level, general locality, and public listing description.
- **Photo Fingerprint (dHash)**: The primary listing photo is drawn to an internal 9×8 pixel canvas to calculate a 64-bit mathematical difference hash (e.g. `a4c28f1107be924d`). The image binary is **discarded immediately** and is never saved to disk or transmitted over the internet.
- **Your Personal Watchlist & Private Notes**: Listings you save via the "★ Track Flat" feature, custom status tags (`Interested`, `Visited`, `Rejected`), and your private notes are stored strictly in your browser's private local storage (`chrome.storage.local`). They never leave your device.
- **Anonymous Feedback**: If you choose to submit feedback via "🚩 This looks wrong?", only non-personal listing parameters (`portal`, `bhk`, `locality`, `rent`, and your text description) are saved. We never ask for or record your email, name, or phone number.

### B. What We NEVER Collect
- **Zero Personal Identifiable Information (PII)**: We do not collect your name, email address, phone number, physical address, or IP identity.
- **Zero Contact Scraping**: Landlord contact numbers, broker identities, and personal chat windows are never read or stored.
- **Zero Browsing History**: FlatAudit operates exclusively when you open a supported rental portal listing or results page. It has zero visibility into any other tabs, websites, or search queries.
- **Zero Account Requirement**: FlatAudit requires no signup, login, password, or third-party authentication.

### C. Area Report (OpenStreetMap) Opt-In Privacy & Location Rounding
FlatAudit includes an optional **Area Report** feature providing neighborhood amenities (healthcare, daily supplies, transit, environment, community):
- **Off by Default**: The Area Report is strictly disabled by default. No requests are made to map servers unless you explicitly toggle the feature ON in the extension settings.
- **Consent & Permission**: Toggling ON prompts a transparent consent dialog explaining what is requested and invokes Chrome's optional host permissions API for OpenStreetMap Overpass servers. If denied, the switch remains OFF.
- **Strict Location Rounding (~100m)**: When enabled, the flat's coordinates are rounded to 3 decimal places (approx. 100 meters at Indian latitudes, e.g. `12.978, 77.641`) before any network query is executed or stored in the local cache. Your exact location is never transmitted.
- **Zero Transmission Guarantee When Off**: When Area Report is disabled, the footer displays `"🔒 Zero personal data transmitted"`. Unit tests guarantee that zero network calls to map servers can occur while disabled.
- **How to Turn Off**: You can disable Area Report at any time from the extension popup with one click.

### D. Data Transmitted to the Optional Analytics Registry
If connected to a FlatAudit backend instance (either your own self-hosted server or an official community instance):
- The extension transmits only anonymous listing attributes: `portal`, `listing_key`, `locality`, `bhk`, `rent`, `deposit`, `area_sqft`, `floor`, and the 16-hex character `image_hash`.
- This anonymous data is used solely to detect cross-portal duplicate listings and compute regional trimmed medians.

---

## 3. Host Permissions & Why We Need Them

FlatAudit requests the minimum permissions necessary to function:

| Permission | Technical Reason |
| :--- | :--- |
| `storage` | Required to persist your local watchlist, rent snapshots for sparklines, and extension preferences in `chrome.storage.local`. |
| `*://*.nobroker.in/*` | Content script execution and image fetching for dHash computation on NoBroker. |
| `*://*.magicbricks.com/*` | Content script execution and image fetching for dHash computation on MagicBricks. |
| `*://*.99acres.com/*` | Content script execution and image fetching for dHash computation on 99acres. |
| `*://*.housing.com/*` | Content script execution and image fetching for dHash computation on Housing.com. |
| `https://overpass-api.de/*`, `https://overpass.kumi.systems/*`, `https://lz4.overpass-api.de/*` | *Optional Host Permissions*: Only requested if the user explicitly turns on Area Report in settings to fetch nearby map facts from OpenStreetMap. |
| `http://127.0.0.1:8000/*` | Local development and self-hosted backend API communication. |
| `file:///*` | Allows users and researchers to run trust evaluations on saved offline HTML fixtures without internet access. |

---

## 4. Portal Terms of Service & Ethical Crawling Note

FlatAudit is a client-side assistive browsing tool:
- **No Bulk Scraping**: FlatAudit does not crawl, scrape, or automate queries against portal servers. It executes solely on the page the human user is actively viewing in their browser.
- **Zero Server Load**: Signal evaluation and sparkline generation execute locally on the user's CPU using vanilla JavaScript.
- **Consumer Protection**: FlatAudit operates as an objective security and price transparency companion for tenants, similar to shopping assistants like Buyhatke or Honey.

---

## 5. Contact & Open Source Auditability

FlatAudit's code is 100% open source under the MIT License. Anyone can audit the network traffic, source files, and test suites to verify that our zero-PII guarantees hold true.
