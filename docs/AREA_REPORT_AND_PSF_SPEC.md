# FlatAudit: Area Report + Price per sq ft Check (Implementation Spec)

**Date:** 2026-11-07
**Audience:** coding agent with existing FlatAudit context
**Status:** decisions locked by the owner; items marked **ASSUMPTION** need owner confirmation but have a safe default.

> Paths below follow the architecture known from earlier sessions. Inspect the repo first and adapt file names if they differ. Do not rename or move existing modules.

---

## 0. Working rules

1. Work in **slices** (section 9). Each slice must run on its own, include tests, and end in one commit. Stop after any slice and the repo must still pass everything.
2. Never break existing suites (JS and pytest). Run both before every commit.
3. Deterministic code only. No ML or LLM calls.
4. Follow `docs/buyer-mode-wording-guide.md`. Forbidden in any new text: "safe", "unsafe", "dangerous", "scam", "overpriced", "cheap", "good deal", "bad area", "worth it". Allowed: facts, distances, counts, percentages, dates.
5. Every number shown must carry its source, its sample size or element count, and a date where one exists.
6. Missing data is never guessed. Use the exact "no data" strings in section 7.
7. Storage goes through the existing `StorageAdapter`. Do **not** use `localStorage` as a fallback anywhere (page scripts can read it from a content script context).
8. Keep all thresholds and text templates in data files, not inline in logic.
9. After each slice, write a short report (format in section 12).

---

## 1. Goal and scope

Add two features to the **Key Observations** section of the extension drawer:

- **A. Price per sq ft check (sale listings):** compare this flat's ₹/sq ft with similar listings in its locality plus localities within 3 km.
- **B. Area Report:** five graded categories built from OpenStreetMap facts around the flat: Emergency & Healthcare, Daily Supplies & Services, Commute & Transit, Safety & Environment (day vs night), Lifestyle & Community.

Pilot cities: **Bengaluru** (metro rules), **Jaipur** and **Jodhpur** (smaller-city rules). Any other city: Area Report and price check show "not available for this city yet".

**Non-goals (do not build):** one overall "worth it" score, user-adjustable weights, lookalike-locality matching, crime data, walking-route distances, rent ₹/sq ft, Firefox support, anything in section 11.

---

## 2. Locked decisions

| Topic | Decision |
|---|---|
| Placement | Inside Key Observations; each category row has a grade and points; tap to expand to: how it was judged, one fact, one major drawback |
| Map data | OpenStreetMap via Overpass, requested from the user's browser |
| Privacy | Area Report is **off by default**; user enables once in settings; location rounded before sending |
| Safety | Only nearby map facts; always labeled "not crime data" |
| Grading | Different rule sets for metros and smaller cities |
| Price comparison scope | Same locality + localities within 3 km |
| Too few listings | Show "Not enough listings to compare" and nothing else |
| Pilot cities | Bengaluru, Jaipur, Jodhpur |
| Order | New features first; correctness work later (section 11) |
| Rent/sale uncertainty | If mode is `unknown`, hide the price comparison (Slice S0) |

---

## 3. Assumptions to confirm (defaults in bold)

1. "Points" = a **score out of 10 per category** shown next to the grade (Good / Okay / Weak).
2. Price per sq ft check is **sale listings only**. In rent mode the line is not shown.
3. Matching in v1 = **same BHK + same area type (carpet vs super built-up)**. The ±20% size band from earlier planning needs a pack-schema change; it is a stretch task (S3b).
4. Minimum sample to show a comparison: **n ≥ 8 listings combined** across included cells, from **at least 2 distinct cells or ≥ 8 in one cell**.
5. Metro list: **Bengaluru = metro; Jaipur, Jodhpur = smaller city.**
6. Distances are **straight-line** and labeled that way.

---

## 4. Architecture

### 4.1 New and changed files

```
extension/
  manifest.json                    # add optional_host_permissions for Overpass endpoints
  background.js                    # message handler: AREA_QUERY -> Overpass fetch
  content.js                       # render Key Observations rows (price check + area report)
  popup/                           # settings switch + consent copy
  lib/
    price_compare.js               # NEW  psf matching + aggregation (pure functions)
    localities.js                  # NEW  locality lookup, haversine, neighbour cells
    area/
      osm_client.js                # NEW  Overpass query builder + response parser
      area_cache.js                # NEW  TTL + LRU cache via StorageAdapter
      categories.js                # NEW  five category extractors (pure)
      grades.js                    # NEW  points -> grade, fact/drawback selection
      report.js                    # NEW  orchestrates cache -> query -> categories -> grades
    data/
      localities_bengaluru.json    # NEW
      localities_jaipur.json       # NEW
      localities_jodhpur.json      # NEW
      area_rules.json              # NEW  thresholds, tag lists, text templates, city tiers
backend/
  build_packs.py                   # CHECK ONLY: confirm sale psf + area_type are in packs; change only if missing
fixtures/overpass/                 # NEW  recorded Overpass JSON responses (see section 8)
tests/                             # NEW test files per module
docs/                              # update (section 10)
```

### 4.2 Data flow

**Price check:** page parse → mode check (`unknown` → stop) → locality + lat/lng → neighbour cells within 3 km → fetch existing static packs for those cells (same mechanism as the benchmark ladder, **no new backend endpoint, no new location sent to the backend**) → `price_compare.js` → Key Observations line.

**Area Report:** setting enabled? → rounded point → cache hit? → else content script messages background → background fetches Overpass → parse → `categories.js` → `grades.js` → UI. Content scripts should not call Overpass directly; route through the background worker so permissions and CORS stay in one place (verify in a real Chrome profile).

---

## 5. Part A: Price per sq ft check

### 5.1 Inputs (flat)
- `listing_type === 'sale'` and mode not `unknown`.
- Price and area parsed, area type known (carpet or super built-up). If area type is unknown, show "Area type not clear on this page" and stop.
- Flat ₹/sq ft = price / area.

### 5.2 Neighbours
- `localities_<city>.json` entry: `{ "name": "", "aliases": [], "lat": 0, "lng": 0, "geohash5": "" }`.
- Find the flat's locality (by name/alias, else nearest centroid within 1.5 km).
- Included localities: itself plus any centroid within **3.0 km** (haversine).
- Map included localities to the geohash cells used by the existing packs (reuse `geohash.js`); do not invent new cell logic.

### 5.3 Aggregation
- From each cell pack, take the entry for `(sale, bhk, area_type)` with `n`, `psf_median`, and `p25/p75` if present.
- Combined median = **n-weighted median of cell medians** (label as approximate in details). Show combined n and number of localities.
- Gate: n ≥ 8 (assumption 4). Else return `{status: "insufficient"}` and the UI shows the exact string in section 7.

### 5.4 Output object

```json
{
  "status": "ok",
  "flat_psf": 9120,
  "area_psf_median": 8600,
  "diff_pct": 6.0,
  "n": 23,
  "localities_used": 3,
  "radius_km": 3,
  "own_locality_n": 12,
  "data_as_of": "2026-11"
}
```

### 5.5 Display
- Key Observations line: `₹9,120/sq ft, 6% above the middle rate of ₹8,600/sq ft (23 listings, 3 localities within 3 km).`
- Details: how it was compared (same BHK, same area type, sale listings, listing asking prices, not sale deeds), one fact, one drawback. Drawback examples chosen by rules: own-locality n < 5 → "Most listings come from neighbouring localities"; data older than 60 days → "Latest listings are over 60 days old".
- Wording must follow section 0 rule 4. Say "above/below the middle rate", never "overpriced".

---

## 6. Part B: Area Report

### 6.1 Settings and consent (Slice S4)
- Storage key `flataudit_settings.areaReport = { enabled: false, consentedAt: null }`.
- Turning on calls `chrome.permissions.request` for the Overpass origins (declare as `optional_host_permissions`). If denied, the switch stays off.
- Consent copy (exact):
  > Area Report asks OpenStreetMap servers what is near this flat. This sends the flat's location, rounded to about 100 m, from your browser to the map servers. Nothing else is sent. Off by default; you can turn it off any time.
- Footer text: when disabled keep "🔒 Zero personal data transmitted"; when enabled show "Area Report on: rounded location sent to OpenStreetMap". Add a test so the footer can never claim zero transmission while enabled.
- Rounding: round lat/lng to 3 decimals before any use in a request or cache key. Add a test.
- With the switch off, **no network call to map servers may occur**. Test by mocking `fetch` and asserting zero calls.

### 6.2 Overpass client (Slice S5)
- One combined query per point, JSON output, `out center tags` (keep tag subset small), timeout 25 s, radius 3000 m for hospital checks and smaller radii for others (see rules file). Primary endpoint plus one fallback mirror; verify current public usage guidance at implementation time and respect it.
- Rate limit: one in-flight request, at most one new query per 5 seconds, no retries in a loop (max one retry on a different mirror).
- Cache: key = `rounded lat,lng` ; TTL 14 days; LRU cap 50 entries; stored through `StorageAdapter`. Store only the reduced element list (type, lat, lng, a few tags), not raw responses.
- Failure states: network error, timeout, HTTP 429/5xx, empty/garbage JSON → `status: "unavailable"` (never a guessed grade).
- Map density: count elements within 1 km. If fewer than **15** → `confidence: "low"`; if fewer than **5** → `status: "thin_map"` (show "not enough map data here").
- Attribution: show "Map data © OpenStreetMap contributors" in the report footer (ODbL requirement).

### 6.3 Categories (Slice S7, one commit per category)

Tag lists live in `area_rules.json`. Starting set:

| Category | Checks (OSM tags) |
|---|---|
| Emergency & Healthcare | nearest hospital (`amenity=hospital`, `healthcare=hospital`); nearest clinic/doctor (`amenity=clinic`, `amenity=doctors`); nearest pharmacy (`amenity=pharmacy`); nearest ambulance station (`emergency=ambulance_station`) as a bonus fact only |
| Daily Supplies & Services | nearest grocery/supermarket/convenience (`shop=supermarket`, `convenience`, `grocery`, `general`); nearest greengrocer (`shop=greengrocer`); nearest ATM/bank (`amenity=atm`, `amenity=bank`); pharmacy again as a daily need |
| Commute & Transit | nearest bus stop/station (`highway=bus_stop`, `amenity=bus_station`, `public_transport=platform`); nearest metro/rail station (`railway=station`, `station=subway`, `railway=halt`, `railway=subway_entrance`); distance to a main road (`highway=trunk/primary/secondary`) |
| Safety & Environment | **Day:** nearest police station (`amenity=police`), main road access, count of shops within 300 m. **Night:** count of places with opening hours past 22:00 or 24/7 within 500 m (`opening_hours` parse, simple cases only), share of nearby roads tagged `lit=yes` (only if ≥ 10 tagged roads). **Environment:** park/green area within 1 km (`leisure=park`, `landuse=grass/forest`), industrial land within 1 km (`landuse=industrial`) as a drawback, railway line or trunk road within 150 m as a noise note |
| Lifestyle & Community | parks, cafes/restaurants, gyms (`leisure=fitness_centre`), schools/colleges within 2 km, places of worship, library/community centre, mall |

**Night data honesty:** most Indian shops lack `opening_hours` in OSM. If the night checks have too little tagged data, show "Not enough night data on the map" for the night half and do not grade it. Do not infer night safety from day facts.

**Mandatory label** on the Safety & Environment row and its details: "Nearby map facts, not crime data."

### 6.4 Grading (Slice S6)

`area_rules.json` shape (draft numbers; owner will tune):

```json
{
  "version": 1,
  "city_tiers": { "bengaluru": "metro", "jaipur": "smaller", "jodhpur": "smaller" },
  "min_checks_with_data": 2,
  "grade_cutoffs": { "good": 1.5, "okay": 0.75 },
  "checks": {
    "hospital_km":   { "metro": [2, 5],   "smaller": [3, 7] },
    "grocery_km":    { "metro": [0.5, 1.5], "smaller": [1, 2.5] },
    "bus_or_metro_km": { "metro": [0.6, 1.5], "smaller": [1, 2.5] },
    "police_km":     { "metro": [2, 4],   "smaller": [3, 6] }
  },
  "templates": { "fact": "{name} is {km} km away (straight line).", "drawback": "No {thing} found within {km} km on the map." }
}
```

- Each check scores **2 = Good, 1 = Okay, 0 = Weak** using the `[good_max, okay_max]` pair for the city tier.
- Category score = average of checks that have data. If fewer than `min_checks_with_data` → "not enough map data here" (no grade).
- Grade: average ≥ 1.5 Good, ≥ 0.75 Okay, else Weak. Points = `round(average * 5)` out of 10.
- **Fact** = highest-scoring check (ties: nearest). **Drawback** = lowest-scoring check; if all checks are 2, drawback = "No major drawback found among the checks used."
- Add a schema validation test for `area_rules.json` (all tiers present, numbers ascending, all five categories defined).
- Unknown city: no grades; show facts list only if the owner approves later; for now show "Area Report not available for this city yet".

### 6.5 UI states (Slice S8)

Exact strings are in section 7. States per category: `off`, `loading`, `ok`, `unavailable`, `thin_map`, `unsupported_city`, `not_enough_data`. Row layout: category name, grade chip, `x/10`, one-line fact. Tap to expand: criteria used (the thresholds), one fact, one drawback, "Straight-line distances. Map data © OpenStreetMap contributors." Must be keyboard accessible and work in both light and dark styling already used by the drawer.

---

## 7. Exact user-facing strings

| State | String |
|---|---|
| Mode unclear | "Pick rent or sale first to see a price comparison." |
| Area type unknown | "Area type not clear on this page, so no price comparison." |
| Too few listings | "Not enough listings to compare." |
| Unsupported city (both features) | "Not available for this city yet." |
| Area Report off | "Area Report is off. Turn it on in settings to see what is nearby." |
| Loading | "Checking the map…" |
| Map failed | "Area data unavailable right now." |
| Thin map | "Not enough map data here." |
| Night data thin | "Not enough night data on the map." |
| Safety label | "Nearby map facts, not crime data." |
| Missing place | "Not found on the map within {km} km." |
| Footer (on) | "Area Report on: rounded location sent to OpenStreetMap" |

---

## 8. Testing

**Unit tests (JS, `node --test`):**
- Slice S0: mode `unknown` and `sale`/`rent` handling for the price line.
- `localities.js`: haversine, nearest locality, 3 km neighbour list, alias matching, locality files have unique names and valid coordinates.
- `price_compare.js`: weighted median, n gate (7 fails, 8 passes), area-type mismatch excluded, rent mode returns nothing, sign of `diff_pct`.
- `osm_client.js`: query builder output, response parser using recorded fixtures, malformed JSON.
- `area_cache.js`: TTL expiry, LRU eviction at 51 entries, rounding keys.
- `categories.js` and `grades.js`: boundary distances (exactly at thresholds), missing checks, tie-breaking, points rounding, metro vs smaller tier, night data absent.
- **Privacy tests:** zero `fetch` calls with the switch off; coordinates rounded to 3 decimals; footer text matches state; consent denied keeps switch off.
- Wording test: scan all new strings in `area_rules.json` and UI code for forbidden words (section 0 rule 4).

**Fixtures:** record **one real Overpass response** for a flat location in each of 6 places (2 per pilot city) and save under `fixtures/overpass/` with the query, date and attribution note. Add 2 synthetic fixtures: empty map and half-tagged map.

**UI tests (jsdom):** each state in section 6.5 renders the exact string; expand/collapse works; keyboard focus.

**Manual QA (owner or agent with a browser):** 5 real flats per city, each checked against what the owner knows. Record results in `eval/area_report_qa.csv` with columns: city, flat url hash, category, grade shown, owner agrees (y/n), note. Target: owner agrees on ≥ 80% of grades; any disagreement leads to a rules-file change, not a code change.

**Regression:** all existing JS and pytest suites pass; `eval/` signal scripts unchanged; no rule drift.

---

## 9. Slices (do in this order)

| ID | Slice | Depends on | Done when |
|---|---|---|---|
| **S0** | Safety rule: mode `unknown` hides price comparison | none | Test passes; unclear page never shows a comparison |
| **S1** | `price_compare.js` matching and aggregation (pure) | S0 | Unit tests pass incl. n gate and area-type matching |
| **S2** | `localities_*.json` for 3 cities + `localities.js` neighbours | S1 | 5 flats per city show a sensible 3 km neighbour list |
| **S3** | Price check UI line + details | S2 | Exact strings render; wording test passes |
| **S3b** | *(stretch)* size-band matching ±20% via pack schema change | S3 | Only if packs can carry size bands without breaking old packs |
| **S4** | Settings switch, optional host permission, consent copy, footer logic | none (parallel to A) | Privacy tests pass |
| **S5** | Overpass client, cache, failure states, density check | S4 | Fixtures parse; failure states tested; rate limit tested |
| **S6** | `area_rules.json` + `grades.js` | S5 | Schema test and boundary tests pass |
| **S7a-e** | Five category extractors, one commit each | S6 | Each category passes tests on all fixtures |
| **S8** | Area Report UI in Key Observations | S7 | All UI states render; keyboard works |
| **S9** | Docs and policy updates (section 10) | S3, S8 | Docs match behavior |
| **S10** | QA pass and metrics report | S9 | `eval/area_report_qa.csv` filled; summary in report |

Tracks A (S0-S3) and B (S4-S8) are independent; the agent may alternate.

---

## 10. Docs to update (S9)

- `README.md`: new features, supported cities, "Area Report is off by default", OSM attribution.
- `docs/privacy-policy.md`: what is sent when Area Report is on (rounded location to OpenStreetMap servers), what is never sent, how to turn it off.
- `docs/store-listing.md`: permission justification for the optional host permission.
- `docs/threat-model.md`: new data flow, third-party exposure, cache contents, failure modes.
- `docs/architecture.md`: new modules and data flow.
- `docs/buyer-mode-wording-guide.md`: add rules for area and price wording.
- Update test counts only from real runs.

---

## 11. Out of scope now (correctness work, do **before** inviting beta users)

1. Test rent/sale detection on 100+ real pages per portal.
2. Re-check every official dataset record against its source and log the check; do not stamp a single date on everything.
3. Re-run the price-spike simulation with 1,000+ markets, n from 6 to 30, skewed prices, and report rates with intervals.
4. Remove the `localStorage` fallback from `StorageAdapter`; on "context invalidated" show a refresh notice and keep nothing sensitive.
5. Cron jobs, backups, health checks, rate limits for the backend (Stage 2 of the earlier plan).

Both new features depend on item 1.

---

## 12. Report format after every slice

```
Slice: S#  Commit: <hash>
Changed files: ...
Tests added: N   Total JS: x/y   Total pytest: a/b
Deviations from spec: none | list
Open questions / assumptions used: ...
Known gaps: ...
```

---

## 13. Risks and handling

| Risk | Handling |
|---|---|
| OSM gaps in smaller cities | `thin_map` state; "Not found on the map" wording; confidence label |
| Missing place reads as a real drawback | Wording says "on the map", never "does not exist" |
| Overpass overload or slow response | Cache, rate limit, one mirror fallback, clear unavailable state |
| Wrong rent/sale guess | Slice S0 plus the correctness work in section 11 |
| Early sparse listings | "Not enough listings to compare" is correct behavior |
| Privacy promise drift | Footer logic tests, off-by-default, optional host permission, policy updates |
| Straight-line distance misleads (rivers, rail lines) | Label every distance "straight line"; walking routes are a later item |
| Threshold numbers are guesses | Single rules file, QA table, tune from owner agreement |

---

## 14. Definition of done (whole feature)

- All slices S0-S9 merged; S10 QA recorded.
- Both existing and new test suites pass.
- With Area Report off, no map request is ever made.
- Every shown number has a source, a count, and a date where available.
- No forbidden words appear in any new text.
- Docs match the shipped behavior.
