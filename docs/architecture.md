# FlatAudit Architecture & System Design

FlatAudit is a privacy-preserving browser extension and lightweight backend designed to detect and explain advance-fee fraud signals on Indian rental portals (NoBroker, MagicBricks, 99acres, Housing.com).

---

## 1. High-Level Architecture

```
┌────────────────────────────────────────────────────────┐
│               Target Rental Portal DOM                 │
│         (NoBroker / MagicBricks / 99acres)             │
└──────────────────────────┬─────────────────────────────┘
                           │
             Content Script Reads Visible Fields
                           │
                           ▼
┌────────────────────────────────────────────────────────┐
│         FlatAudit Extension (Manifest V3)             │
│                                                        │
│  ┌──────────────────────┐    ┌──────────────────────┐  │
│  │   Portal Parsers     │    │   Signal Evaluator   │  │
│  │  (NoBroker, 99acres) │───▶│ - Price Outlier      │  │
│  └──────────────────────┘    │ - Deposit Ratio Norm │  │
│                              │ - Advance-Fee Phrase │  │
│  ┌──────────────────────┐    └──────────┬───────────┘  │
│  │ Service Worker Canvas│               │              │
│  │ - 64-bit dHash       │───────────────┤              │
│  │ - Hamming Distance   │               │              │
│  └──────────────────────┘               ▼              │
│                               Observable Facts Model   │
└──────────────────────────┬──────────────┬──────────────┘
                           │              │
              Queries      │              │ Injects
              Seen Count   │              │ Safe Text
                           ▼              ▼
           ┌──────────────────────┐  ┌──────────────────────┐
           │   FastAPI Backend    │  │  In-Page UI Badge    │
           │  (SQLite Registry)   │  │  - Looks normal      │
           │  - 0 Photos Stored   │  │  - Some signals      │
           │  - 0 Phone Numbers   │  │  - Many signals      │
           └──────────────────────┘  └──────────────────────┘
```

---

## 2. Core Components

### A. Portal Extractors (`extension/lib/parsers/`)
- **Semantic Selectors**: Targets resilient semantic attributes and DOM structures rather than fragile hashed CSS class names.
- **Indian Financial Normalizer**: Parses Lakhs (`1.5 Lac` -> `150,000`), thousands (`45k` -> `45,000`), and formatted rupee values (`₹ 42,000` / `Rs. 12,000`).
- **Generic Fallback**: Schema.org microdata and regex-based heuristics for unlisted or newly redesigned portals.

### B. Image Perceptual Fingerprinting (`extension/lib/dhash.js`)
- **64-bit Difference Hash (dHash)**:
  1. Downscales image to 9 width x 8 height grayscale (72 pixels).
  2. Compares each pixel to its horizontal right neighbor ($pixel[x] > pixel[x+1]$).
  3. Generates 64 bits represented as a 16-character hexadecimal string.
- **CORS Isolation**: The background service worker uses `createImageBitmap` and `OffscreenCanvas` with host permissions, preventing canvas tainting from cross-origin CDN images.
- **Hamming Distance**: Fast 64-bit bitwise comparison. Distance $\le 10$ bits identifies identical, re-compressed, or watermarked image reuse.

### C. Signal Rules Engine (`extension/lib/signals.js`)
- **Price Deviation**: Compares monthly rent against locality-specific empirical distributions across 13 major IT hub localities in Bengaluru, Mumbai, Gurgaon, and Pune. Flags listings priced $\le -38\%$ below market median.
- **Deposit Ratio**: Evaluates deposit-to-rent ratio against regional norms (e.g. 3–6 months for Bengaluru, 1–3 months for Gurgaon/Pune). Flags 0-deposit traps on luxury properties or exorbitant upfront deposits.
- **Advance-Fee Phrase Rules**: Regex patterns identifying known scam pretexts:
  - Defense/Army transfer pretexts
  - Gate entry pass / visiting token demands before physical flat visit
  - Courier key delivery excuses
  - UPI scanner / WhatsApp urgency

### D. Privacy-Preserving Registry (`backend/`)
- Built with **FastAPI** and **SQLite**.
- **Privacy by Design**:
  - Raw images are **never stored**; only 16-hex perceptual hashes are recorded.
  - Renter identities, phone numbers, and broker names are explicitly omitted.
  - Parameterized SQLite queries with indexed hash searches.

### E. In-Page Explainability Badge (`extension/content.js`)
- Constructive, verifiable language: strictly outputs observable facts ("*this photo appeared in 4 other listings*", "*rent is 78% below HSR median*").
- **Never uses defamatory labels**: UI never states "scammer", "fraudster", or "criminal".
- Standard status labels: `Looks normal`, `Some signals`, `Many signals`.
