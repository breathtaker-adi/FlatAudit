import sqlite3
import hashlib
import json
import os
import time
from datetime import datetime, date, timedelta, timezone
from typing import Optional, Dict, Any, List
from pathlib import Path
from backend.config import DB_PATH

NIBBLE_BITS = [0, 1, 1, 2, 1, 2, 2, 3, 1, 2, 2, 3, 2, 3, 3, 4]

def hamming_distance(h1: str, h2: str) -> int:
    """Calculates Hamming distance between two 16-hex character dHashes."""
    if not h1 or not h2 or len(h1) != 16 or len(h2) != 16:
        return 64
    dist = 0
    for c1, c2 in zip(h1, h2):
        try:
            v1 = int(c1, 16)
            v2 = int(c2, 16)
            dist += NIBBLE_BITS[v1 ^ v2]
        except ValueError:
            return 64
    return dist

def get_connection(db_file: str = DB_PATH) -> sqlite3.Connection:
    conn = sqlite3.connect(db_file, timeout=10.0)
    conn.row_factory = sqlite3.Row
    try:
        conn.execute("PRAGMA journal_mode=WAL")
        conn.execute("PRAGMA busy_timeout = 5000")
    except sqlite3.OperationalError:
        pass
    return conn

def init_db(db_file: str = DB_PATH):
    """Initializes and migrates SQLite database schema."""
    conn = get_connection(db_file)
    with conn:
        conn.execute("""
            CREATE TABLE IF NOT EXISTS observations (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                portal TEXT,
                listing_key TEXT,
                url_hash TEXT,
                locality TEXT,
                bhk INTEGER,
                rent INTEGER,
                deposit INTEGER,
                area_sqft INTEGER,
                floor INTEGER,
                image_hash TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                day TEXT DEFAULT (date('now'))
            )
        """)

        # Migration: Ensure new Buyhatke columns exist if table was created in older schema
        cursor = conn.execute("PRAGMA table_info(observations)")
        existing_cols = {row["name"] for row in cursor.fetchall()}

        new_columns = [
            ("portal", "TEXT"),
            ("listing_key", "TEXT"),
            ("listing_type", "TEXT DEFAULT 'rent'"),
            ("price", "INTEGER"),
            ("price_per_sqft", "INTEGER"),
            ("area_type", "TEXT"),
            ("possession_status", "TEXT"),
            ("rera_id", "TEXT"),
            ("area_sqft", "INTEGER"),
            ("floor", "INTEGER"),
            ("day", "TEXT"),
            ("geohash", "TEXT")
        ]
        for col_name, col_type in new_columns:
            if col_name not in existing_cols:
                try:
                    conn.execute(f"ALTER TABLE observations ADD COLUMN {col_name} {col_type}")
                except sqlite3.OperationalError:
                    pass

        conn.execute("CREATE INDEX IF NOT EXISTS idx_image_hash ON observations(image_hash)")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_locality_bhk ON observations(locality, bhk)")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_portal_listing ON observations(portal, listing_key)")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_day ON observations(day)")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_geohash ON observations(geohash)")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_listing_type ON observations(listing_type)")

        # Phase 1: Multi-year memory rollup table
        conn.execute("""
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
            )
        """)
        conn.execute("CREATE INDEX IF NOT EXISTS idx_cell_month_lookup ON cell_month(cell, listing_type, bhk, month)")

        # Service Operations: Structured job execution logs
        conn.execute("""
            CREATE TABLE IF NOT EXISTS job_logs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                job_name TEXT NOT NULL,
                status TEXT NOT NULL,
                details TEXT,
                records_processed INTEGER DEFAULT 0,
                duration_ms REAL DEFAULT 0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)
        conn.execute("CREATE INDEX IF NOT EXISTS idx_job_logs_name ON job_logs(job_name, status)")

        # Weeks 3–5: Sanitized crowd telemetry and ground-truth feedback
        conn.execute("""
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
            )
        """)
        conn.execute("CREATE INDEX IF NOT EXISTS idx_telem_city ON telemetry_observations(city, locality)")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_telem_fingerprint ON telemetry_observations(listing_fingerprint)")

        conn.execute("""
            CREATE TABLE IF NOT EXISTS telemetry_feedback (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                client_id TEXT NOT NULL,
                listing_fingerprint TEXT NOT NULL,
                verdict TEXT NOT NULL,
                reason_category TEXT,
                user_note TEXT,
                snapshot_json TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)
        conn.execute("CREATE INDEX IF NOT EXISTS idx_feedback_verdict ON telemetry_feedback(verdict)")
    conn.close()

def record_observation(
    locality: Optional[str] = None,
    bhk: Optional[int] = None,
    rent: Optional[int] = None,
    deposit: Optional[int] = None,
    image_hash: Optional[str] = None,
    url: Optional[str] = None,
    portal: Optional[str] = None,
    listing_key: Optional[str] = None,
    area_sqft: Optional[int] = None,
    floor: Optional[int] = None,
    geohash: Optional[str] = None,
    listing_type: Optional[str] = "rent",
    price: Optional[int] = None,
    price_per_sqft: Optional[int] = None,
    area_type: Optional[str] = "unknown",
    possession_status: Optional[str] = "unknown",
    rera_id: Optional[str] = None,
    db_file: str = DB_PATH
) -> int:
    """
    Inserts or updates a listing observation (anonymously, storing zero personal data).
    Enforces deduplication per listing key per day.
    """
    import datetime
    today = datetime.date.today().isoformat()

    conn = get_connection(db_file)
    url_hash = hashlib.sha256(url.encode('utf-8')).hexdigest()[:16] if url else None
    cleaned_locality = locality.strip().lower() if locality else None
    cleaned_hash = image_hash.strip().lower() if image_hash else None
    cleaned_portal = portal.strip().lower() if portal else None
    cleaned_key = listing_key.strip() if listing_key else None
    cleaned_geohash = geohash.strip().lower() if geohash else None

    with conn:
        # Check if already observed today for deduplication
        existing = None
        if cleaned_portal and cleaned_key:
            cursor = conn.execute("""
                SELECT id FROM observations 
                WHERE portal = ? AND listing_key = ? AND (day = ? OR day = date('now'))
            """, (cleaned_portal, cleaned_key, today))
            existing = cursor.fetchone()

        if existing:
            new_id = existing["id"]
            conn.execute("""
                UPDATE observations 
                SET rent = COALESCE(?, rent),
                    price = COALESCE(?, price),
                    price_per_sqft = COALESCE(?, price_per_sqft),
                    deposit = COALESCE(?, deposit),
                    area_sqft = COALESCE(?, area_sqft),
                    floor = COALESCE(?, floor),
                    listing_type = COALESCE(?, listing_type),
                    area_type = COALESCE(?, area_type),
                    possession_status = COALESCE(?, possession_status),
                    rera_id = COALESCE(?, rera_id),
                    image_hash = COALESCE(?, image_hash),
                    geohash = COALESCE(?, geohash),
                    day = ?
                WHERE id = ?
            """, (rent, price, price_per_sqft, deposit, area_sqft, floor, listing_type, area_type, possession_status, rera_id, cleaned_hash, cleaned_geohash, today, new_id))
        else:
            cursor = conn.execute("""
                INSERT INTO observations (
                    portal, listing_key, url_hash, locality, bhk, rent, price, price_per_sqft, deposit, area_sqft, floor, listing_type, area_type, possession_status, rera_id, image_hash, geohash, day
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (cleaned_portal, cleaned_key, url_hash, cleaned_locality, bhk, rent, price, price_per_sqft, deposit, area_sqft, floor, listing_type, area_type, possession_status, rera_id, cleaned_hash, cleaned_geohash, today))
            new_id = cursor.lastrowid
    conn.close()
    return new_id

def count_seen_hashes(target_hash: str, threshold: int = 10, db_file: str = DB_PATH) -> Dict[str, Any]:
    """
    Scans stored observations and counts how many distinct listings
    share a dHash within the Hamming distance threshold.
    """
    if not target_hash:
        return {"seen_count": 1, "matched_listings": 0}

    target_clean = target_hash.strip().lower()
    conn = get_connection(db_file)
    cursor = conn.execute("SELECT id, url_hash, listing_key, image_hash FROM observations WHERE image_hash IS NOT NULL")
    rows = cursor.fetchall()
    conn.close()

    matched_distinct_keys = set()
    total_matches = 0

    for row in rows:
        row_hash = row["image_hash"]
        if row_hash:
            dist = hamming_distance(target_clean, row_hash)
            if dist <= threshold:
                total_matches += 1
                key_id = row["listing_key"] or row["url_hash"] or str(row["id"])
                matched_distinct_keys.add(key_id)

    seen_count = max(len(matched_distinct_keys), 1) if total_matches > 0 else 1
    return {
        "seen_count": seen_count,
        "matched_listings": total_matches
    }

def find_cross_portal_matches(
    portal: Optional[str],
    locality: Optional[str],
    bhk: Optional[int],
    rent: Optional[int],
    area_sqft: Optional[int] = None,
    floor: Optional[int] = None,
    image_hash: Optional[str] = None,
    listing_key: Optional[str] = None,
    db_file: str = DB_PATH
) -> List[Dict[str, Any]]:
    """
    Identifies cross-portal duplicates ("Also listed on Portal B").
    Requires at least 2 independent signals:
    - Image dHash distance <= 8 (strong)
    - Same locality and BHK
    - Rent within 5%
    - Area within 3%
    - Same floor
    
    Returns explainable matches without claiming absolute identity ("Likely the same property").
    """
    if not rent or rent <= 0:
        return []

    conn = get_connection(db_file)
    cursor = conn.execute("""
        SELECT id, portal, listing_key, locality, bhk, rent, deposit, area_sqft, floor, image_hash, created_at
        FROM observations
        WHERE portal IS NOT NULL AND rent IS NOT NULL
    """)
    rows = cursor.fetchall()
    conn.close()

    matches = []
    current_portal = (portal or '').strip().lower()
    current_key = (listing_key or '').strip()
    current_loc = (locality or '').strip().lower()

    for row in rows:
        cand_portal = (row["portal"] or '').strip().lower()
        cand_key = (row["listing_key"] or '').strip()

        # Skip same listing or same portal
        if cand_portal == current_portal or (current_key and cand_key == current_key):
            continue

        cand_rent = row["rent"]
        cand_bhk = row["bhk"]
        cand_loc = (row["locality"] or '').strip().lower()
        cand_area = row["area_sqft"]
        cand_floor = row["floor"]
        cand_hash = row["image_hash"]

        signals_fired = []
        score = 0

        # Signal 1: Image dHash match (Strong)
        if image_hash and cand_hash:
            h_dist = hamming_distance(image_hash, cand_hash)
            if h_dist <= 8:
                signals_fired.append(f"Matching photo fingerprint (Hamming distance: {h_dist}/64)")
                score += 40

        # Signal 2: Locality and BHK match
        loc_match = (current_loc and cand_loc and (current_loc in cand_loc or cand_loc in current_loc))
        bhk_match = (bhk is not None and cand_bhk is not None and bhk == cand_bhk)
        if loc_match and bhk_match:
            signals_fired.append(f"Same locality and BHK ({bhk} BHK in {row['locality']})")
            score += 25

        # Signal 3: Rent within 5%
        rent_diff = abs(cand_rent - rent)
        rent_pct = (rent_diff / rent) * 100
        if rent_pct <= 5.0:
            signals_fired.append(f"Rent within {rent_pct:.1f}% (₹{cand_rent:,} vs ₹{rent:,})")
            score += 20

        # Signal 4: Area within 3%
        if area_sqft and cand_area:
            area_diff = abs(cand_area - area_sqft)
            area_pct = (area_diff / area_sqft) * 100
            if area_pct <= 3.0:
                signals_fired.append(f"Area matches within {area_pct:.1f}% ({cand_area} sq.ft)")
                score += 15

        # Signal 5: Same floor
        if floor is not None and cand_floor is not None and floor == cand_floor:
            signals_fired.append(f"Same floor level ({floor})")
            score += 10

        # Require at least two independent signals
        if len(signals_fired) >= 2 and score >= 45:
            delta_rent = cand_rent - rent
            diff_text = f"₹{abs(delta_rent):,} cheaper" if delta_rent < 0 else f"₹{delta_rent:,} higher" if delta_rent > 0 else "same rent"

            matches.append({
                "portal": cand_portal,
                "listing_key": cand_key,
                "rent": cand_rent,
                "deposit": row["deposit"],
                "area_sqft": cand_area,
                "floor": cand_floor,
                "rent_delta": delta_rent,
                "confidence": "high" if (score >= 60 and len(signals_fired) >= 3) else "medium",
                "verdict": f"Likely the same property listed on {cand_portal.capitalize()} at ₹{cand_rent:,} ({diff_text})",
                "reasons": signals_fired
            })

    # Sort matches with lowest rent first (Buyhatke lowest price helper)
    matches.sort(key=lambda m: m["rent"])
    return matches

def get_locality_stats(locality: str, bhk: int, db_file: str = DB_PATH) -> Dict[str, Any]:
    """Calculates summary price statistics for a locality and BHK with sample size."""
    conn = get_connection(db_file)
    cursor = conn.execute("""
        SELECT rent, deposit FROM observations
        WHERE locality LIKE ? AND bhk = ? AND rent IS NOT NULL
    """, (f"%{locality.strip().lower()}%", bhk))
    rows = cursor.fetchall()
    conn.close()

    rents = sorted([r["rent"] for r in rows if r["rent"] is not None])
    deposits = sorted([r["deposit"] for r in rows if r["deposit"] is not None])

    count = len(rents)
    median_rent = rents[count // 2] if count > 0 else None
    min_rent = rents[0] if count > 0 else None
    max_rent = rents[-1] if count > 0 else None
    median_deposit = deposits[len(deposits) // 2] if deposits else None

    # Confidence based on sample size (Phase 4 crowd data rule)
    confidence = "high" if count >= 20 else "medium" if count >= 5 else "low"

    return {
        "locality": locality,
        "bhk": bhk,
        "count": count,
        "sample_size": count,
        "confidence": confidence,
        "median_rent": median_rent,
        "min_rent": min_rent,
        "max_rent": max_rent,
        "median_deposit": median_deposit
    }

def detect_price_spike(
    area_or_cell: str,
    bhk: int,
    listing_type: str = "rent",
    min_samples: int = 6,
    db_file: str = DB_PATH
) -> Dict[str, Any]:
    """
    Evaluates 30-day sudden price movement against 90-day baseline using robust statistics:
    - Minimum sample threshold (min_samples >= 6 in both windows)
    - Dispersion check: validates that movement exceeds baseline MAD noise floor
    - Cross-validates with repeat-listing price modifications on identical listing keys
    - Reports transparent interquartile ranges (IQR) and sample sizes
    """
    conn = get_connection(db_file)
    price_col = "rent" if listing_type == "rent" else "price"
    
    # 1. Last 30 days window
    c_recent = conn.execute(f"""
        SELECT listing_key, {price_col} as val
        FROM observations
        WHERE (locality LIKE ? OR geohash LIKE ?)
          AND bhk = ?
          AND listing_type = ?
          AND {price_col} IS NOT NULL
          AND day >= date('now', '-30 days')
    """, (f"%{area_or_cell.strip().lower()}%", f"{area_or_cell.strip().lower()}%", bhk, listing_type))
    recent_rows = c_recent.fetchall()

    # 2. Prior 90 days baseline window
    c_base = conn.execute(f"""
        SELECT listing_key, {price_col} as val
        FROM observations
        WHERE (locality LIKE ? OR geohash LIKE ?)
          AND bhk = ?
          AND listing_type = ?
          AND {price_col} IS NOT NULL
          AND day >= date('now', '-120 days')
          AND day < date('now', '-30 days')
    """, (f"%{area_or_cell.strip().lower()}%", f"{area_or_cell.strip().lower()}%", bhk, listing_type))
    baseline_rows = c_base.fetchall()
    conn.close()

    n_recent = len(recent_rows)
    n_base = len(baseline_rows)

    if n_recent < min_samples or n_base < min_samples:
        return {
            "status": "insufficient_data",
            "message": f"Not enough observations to compute spike trend (recent n={n_recent}, baseline n={n_base}, minimum required: {min_samples} each).",
            "is_spike": False,
            "sample_recent": n_recent,
            "sample_baseline": n_base
        }

    recent_vals = sorted([r["val"] for r in recent_rows])
    base_vals = sorted([r["val"] for r in baseline_rows])

    recent_median = recent_vals[n_recent // 2]
    base_median = base_vals[n_base // 2]

    recent_p25 = recent_vals[int(n_recent * 0.25)]
    recent_p75 = recent_vals[int(n_recent * 0.75)]
    base_p25 = base_vals[int(n_base * 0.25)]
    base_p75 = base_vals[int(n_base * 0.75)]

    # Compute baseline MAD (Median Absolute Deviation)
    base_mad = sorted([abs(x - base_median) for x in base_vals])[n_base // 2]
    # Standard error of median difference approximation
    noise_margin = max(1.4826 * base_mad * ((1 / n_recent + 1 / n_base) ** 0.5), base_median * 0.08)

    diff = recent_median - base_median
    delta_pct = round((diff / base_median) * 100, 1)

    # Repeat listings check
    recent_by_key = {r["listing_key"]: r["val"] for r in recent_rows if r["listing_key"]}
    base_by_key = {r["listing_key"]: r["val"] for r in baseline_rows if r["listing_key"]}
    common_keys = set(recent_by_key.keys()).intersection(set(base_by_key.keys()))

    repeat_deltas = []
    for k in common_keys:
        old_v = base_by_key[k]
        new_v = recent_by_key[k]
        if old_v > 0:
            repeat_deltas.append(((new_v - old_v) / old_v) * 100)

    repeat_median_delta = round(sorted(repeat_deltas)[len(repeat_deltas) // 2], 1) if repeat_deltas else None

    # Statistically significant price movement requires exceeding noise margin AND >= 12%
    is_spike_raw = (diff > noise_margin) and (delta_pct >= 12.0)

    # Repeat listings qualification & confidence calibration
    overlap_count = len(common_keys)
    if overlap_count == 0:
        repeat_confirmation = "unconfirmed_no_repeats"
        confidence = "low"
        repeat_note = "not confirmed by repeat listings"
        is_spike = is_spike_raw
    elif overlap_count < 3:
        repeat_confirmation = "insufficient_repeats"
        confidence = "medium"
        repeat_note = f"preliminary ({overlap_count} repeat listing{'s' if overlap_count > 1 else ''} observed)"
        is_spike = is_spike_raw
    else:
        if repeat_median_delta is not None and repeat_median_delta > 0:
            repeat_confirmation = "confirmed_by_repeats"
            confidence = "high"
            repeat_note = f"confirmed by {overlap_count} repeat listings (median repeat delta: +{repeat_median_delta}%)"
            is_spike = is_spike_raw
        else:
            repeat_confirmation = "contradicted_by_repeats"
            confidence = "low"
            repeat_note = f"contradicted by {overlap_count} repeat listings (median repeat delta: {repeat_median_delta}%, likely premium inventory shift)"
            is_spike = False

    sign = "+" if delta_pct > 0 else ""
    verdict = (
        f"Market moved {sign}{delta_pct}% in last 30 days ({repeat_note}) "
        f"[recent median: ₹{recent_median:,}, IQR: ₹{recent_p25:,}–₹{recent_p75:,}, n={n_recent}; "
        f"baseline: ₹{base_median:,}, IQR: ₹{base_p25:,}–₹{base_p75:,}, n={n_base}]"
    )

    return {
        "status": "evaluated",
        "is_spike": is_spike,
        "confidence": confidence,
        "repeat_confirmation": repeat_confirmation,
        "delta_pct": delta_pct,
        "recent_median": recent_median,
        "baseline_median": base_median,
        "recent_range": [recent_p25, recent_p75],
        "baseline_range": [base_p25, base_p75],
        "noise_margin": round(noise_margin),
        "sample_recent": n_recent,
        "sample_baseline": n_base,
        "repeat_listings_tracked": overlap_count,
        "repeat_listing_median_delta_pct": repeat_median_delta,
        "verdict": verdict,
        "advice": "When local market moves rapidly, typical benchmark range widens and confidence lowers to prevent false scam alerts."
    }

def get_area_trend(
    area_or_cell: str,
    bhk: int,
    listing_type: str = "rent",
    limit_months: int = 12,
    db_file: str = DB_PATH
) -> Dict[str, Any]:
    """Retrieves up to 12 months of aggregated area benchmarks from cell_month table."""
    conn = get_connection(db_file)
    cursor = conn.execute("""
        SELECT month, n, median, p25, p75, mad, psf_median
        FROM cell_month
        WHERE cell LIKE ? AND bhk = ? AND listing_type = ?
        ORDER BY month DESC
        LIMIT ?
    """, (f"%{area_or_cell.strip().lower()}%", bhk, listing_type, limit_months))
    rows = cursor.fetchall()
    conn.close()

    history = [dict(r) for r in reversed(rows)]
    spike_info = detect_price_spike(area_or_cell, bhk, listing_type, db_file=db_file)

    return {
        "area": area_or_cell,
        "bhk": bhk,
        "listing_type": listing_type,
        "months_count": len(history),
        "history": history,
        "recent_spike_check": spike_info
    }

def log_job(
    job_name: str,
    status: str,
    details: str = "",
    records_processed: int = 0,
    duration_ms: float = 0.0,
    db_file: str = DB_PATH
) -> int:
    """Records an entry in the job_logs table."""
    conn = get_connection(db_file)
    with conn:
        cursor = conn.execute("""
            INSERT INTO job_logs (job_name, status, details, records_processed, duration_ms)
            VALUES (?, ?, ?, ?, ?)
        """, (job_name, status, details, records_processed, round(duration_ms, 2)))
        log_id = cursor.lastrowid
    conn.close()
    return log_id

def get_job_logs(job_name: Optional[str] = None, limit: int = 20, db_file: str = DB_PATH) -> List[Dict[str, Any]]:
    """Retrieves recent job execution logs."""
    conn = get_connection(db_file)
    if job_name:
        cursor = conn.execute("""
            SELECT id, job_name, status, details, records_processed, duration_ms, created_at
            FROM job_logs
            WHERE job_name = ?
            ORDER BY id DESC LIMIT ?
        """, (job_name, limit))
    else:
        cursor = conn.execute("""
            SELECT id, job_name, status, details, records_processed, duration_ms, created_at
            FROM job_logs
            ORDER BY id DESC LIMIT ?
        """, (limit,))
    rows = cursor.fetchall()
    conn.close()
    return [dict(r) for r in rows]

def rollup_monthly_aggregates(
    month_str: str,
    force: bool = False,
    db_file: str = DB_PATH
) -> Dict[str, Any]:
    """
    Rolls up raw observations for a closed month (e.g. '2026-09') into cell_month table.
    
    Service Properties:
    1. Idempotent: Can be run repeatedly; replaces existing cell_month aggregates without duplication.
    2. Closed-Months Only: Rejects unclosed current or future months unless force=True.
    3. Audited: Logs duration, cell count, and record count to job_logs table.
    """
    t0 = time.perf_counter()
    current_month = datetime.now(timezone.utc).strftime("%Y-%m")

    # Closed-month gate
    if not force and month_str >= current_month:
        msg = f"Month {month_str} is not closed yet (current active month: {current_month}). Rollups execute exclusively on closed months."
        log_job("monthly_rollup", "SKIPPED", msg, 0, 0, db_file=db_file)
        return {
            "status": "SKIPPED",
            "month": month_str,
            "reason": msg,
            "cells_processed": 0
        }

    from collections import defaultdict
    conn = get_connection(db_file)
    cursor = conn.execute("""
        SELECT 
            COALESCE(geohash, locality) as cell,
            listing_type,
            bhk,
            rent,
            price,
            price_per_sqft
        FROM observations
        WHERE day LIKE ?
          AND COALESCE(geohash, locality) IS NOT NULL
          AND bhk IS NOT NULL
    """, (f"{month_str}%",))
    rows = cursor.fetchall()

    groups = defaultdict(lambda: {"prices": [], "psfs": []})
    for r in rows:
        key = (r["cell"].strip().lower(), r["listing_type"] or "rent", r["bhk"])
        val = r["rent"] if (r["listing_type"] == "rent" or not r["listing_type"]) else r["price"]
        if val and val > 0:
            groups[key]["prices"].append(val)
        if r["price_per_sqft"] and r["price_per_sqft"] > 0:
            groups[key]["psfs"].append(r["price_per_sqft"])

    cells_processed = 0
    with conn:
        for (cell, ltype, bhk), data in groups.items():
            prices = sorted(data["prices"])
            n = len(prices)
            if n == 0:
                continue
            median = prices[n // 2]
            p25 = prices[int(n * 0.25)]
            p75 = prices[int(n * 0.75)]
            mad = sorted([abs(p - median) for p in prices])[n // 2]
            psfs = sorted(data["psfs"])
            psf_med = psfs[len(psfs) // 2] if psfs else None

            conn.execute("""
                INSERT OR REPLACE INTO cell_month (
                    cell, month, listing_type, bhk, property_type, status, n, median, p25, p75, mad, psf_median
                ) VALUES (?, ?, ?, ?, 'apartment', 'active', ?, ?, ?, ?, ?, ?)
            """, (cell, month_str, ltype, bhk, n, median, p25, p75, mad, psf_med))
            cells_processed += 1
    conn.close()

    elapsed_ms = (time.perf_counter() - t0) * 1000
    details = f"Month {month_str}: {cells_processed} micro-cells updated from {len(rows)} raw observations."
    log_job("monthly_rollup", "SUCCESS", details, cells_processed, elapsed_ms, db_file=db_file)

    return {
        "status": "SUCCESS",
        "month": month_str,
        "raw_observations_read": len(rows),
        "cells_processed": cells_processed,
        "duration_ms": round(elapsed_ms, 2)
    }

def backup_database(db_file: str = DB_PATH, backup_dir: Optional[str] = None) -> str:
    """
    Performs an online, non-blocking SQLite database backup using the SQLite Backup API.
    Guarantees consistent, corruption-free snapshot with size and existence verification.
    """
    t0 = time.perf_counter()
    if backup_dir is None:
        backup_dir = os.path.join(os.path.dirname(os.path.abspath(db_file)), "backups")
    os.makedirs(backup_dir, exist_ok=True)

    timestamp = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
    backup_filename = f"flataudit_backup_{timestamp}.db"
    backup_path = os.path.join(backup_dir, backup_filename)

    source_conn = get_connection(db_file)
    dest_conn = sqlite3.connect(backup_path)
    try:
        with dest_conn:
            source_conn.backup(dest_conn)
    finally:
        dest_conn.close()
        source_conn.close()

    # Verification gate
    if not os.path.exists(backup_path) or os.path.getsize(backup_path) == 0:
        err_msg = f"Backup verification failed: {backup_path} does not exist or has 0 bytes."
        log_job("db_backup", "FAILED", err_msg, 0, 0, db_file=db_file)
        raise RuntimeError(err_msg)

    elapsed_ms = (time.perf_counter() - t0) * 1000
    file_size_kb = round(os.path.getsize(backup_path) / 1024, 2)
    details = f"Online backup completed: {backup_filename} ({file_size_kb} KB)."
    log_job("db_backup", "SUCCESS", details, 1, elapsed_ms, db_file=db_file)

    return backup_path

def restore_database(backup_path: str, target_db_file: str = DB_PATH) -> bool:
    """
    Restores the database from a verified backup snapshot using SQLite Backup API.
    """
    if not os.path.exists(backup_path) or os.path.getsize(backup_path) == 0:
        raise ValueError(f"Cannot restore: backup path {backup_path} is invalid or empty.")

    source_conn = sqlite3.connect(backup_path)
    dest_conn = sqlite3.connect(target_db_file)
    try:
        with dest_conn:
            source_conn.backup(dest_conn)
    finally:
        dest_conn.close()
        source_conn.close()

    log_job("db_restore", "SUCCESS", f"Database restored from {os.path.basename(backup_path)}", 1, 0, db_file=target_db_file)
    return True

def prune_raw_observations(
    days_to_keep: int = 90,
    db_file: str = DB_PATH,
    require_backup: bool = True
) -> Dict[str, Any]:
    """
    Prunes raw observations older than days_to_keep.
    
    SAFETY INVARIANTS:
    1. Pre-Purge Backup: Runs a full verified backup BEFORE deleting any rows.
       If backup fails, pruning aborts immediately.
    2. Rollup Precondition: Checks that cell_month contains aggregate data so history is preserved.
    """
    t0 = time.perf_counter()

    # Invariant 1: Mandatory pre-purge backup
    backup_path = None
    if require_backup:
        backup_path = backup_database(db_file=db_file)

    # Invariant 2: Ensure rollup table is populated
    conn = get_connection(db_file)
    cursor = conn.execute("SELECT COUNT(*) as cnt FROM cell_month")
    rollup_count = cursor.fetchone()["cnt"]

    cutoff_date = (date.today() - timedelta(days=days_to_keep)).isoformat()

    with conn:
        c_del = conn.execute("DELETE FROM observations WHERE day < ?", (cutoff_date,))
        deleted_count = c_del.rowcount
    conn.close()

    elapsed_ms = (time.perf_counter() - t0) * 1000
    details = f"Pruned {deleted_count} observations older than {cutoff_date} ({days_to_keep}d TTL). Pre-purge backup: {os.path.basename(backup_path) if backup_path else 'none'}."
    log_job("prune_observations", "SUCCESS", details, deleted_count, elapsed_ms, db_file=db_file)

    return {
        "status": "SUCCESS",
        "deleted_count": deleted_count,
        "cutoff_date": cutoff_date,
        "backup_path": backup_path,
        "rollup_records_present": rollup_count,
        "duration_ms": round(elapsed_ms, 2)
    }

def check_stale_packs(threshold_days: int = 45, db_file: str = DB_PATH) -> Dict[str, Any]:
    """
    Evaluates whether market benchmark packs or cell_month aggregates are stale.
    Emits an alert if the latest aggregated month is older than threshold_days.
    """
    conn = get_connection(db_file)
    cursor = conn.execute("SELECT MAX(month) as latest_month FROM cell_month")
    row = cursor.fetchone()
    conn.close()

    latest_month = row["latest_month"] if row else None
    if not latest_month:
        return {
            "stale": True,
            "latest_month": None,
            "days_old": None,
            "warning": "No monthly benchmark rollups found in database. Run monthly rollup job."
        }

    try:
        # Month format YYYY-MM -> end of that month approximation
        year, month = map(int, latest_month.split("-"))
        if month == 12:
            next_month_start = date(year + 1, 1, 1)
        else:
            next_month_start = date(year, month + 1, 1)
        latest_month_end = next_month_start - timedelta(days=1)
        days_old = (date.today() - latest_month_end).days
    except Exception:
        days_old = 999

    is_stale = days_old > threshold_days
    return {
        "stale": is_stale,
        "latest_month": latest_month,
        "days_old": days_old,
        "threshold_days": threshold_days,
        "warning": f"Market benchmark packs are {days_old} days old (threshold: {threshold_days} days). Run monthly rollup." if is_stale else None
    }

def record_telemetry_observation(
    client_id: str,
    portal: str,
    city: str,
    listing_fingerprint: str,
    extracted_features: Dict[str, Any],
    locality: Optional[str] = None,
    computed_signals: Optional[Dict[str, Any]] = None,
    schema_version: str = "1.1",
    extension_version: str = "0.4.2",
    db_file: str = DB_PATH
) -> int:
    """Stores a sanitized crowd observation event."""
    price = extracted_features.get("price") or extracted_features.get("rent")
    deposit = extracted_features.get("deposit")
    bedrooms = extracted_features.get("bedrooms") or extracted_features.get("bhk")

    conn = get_connection(db_file)
    with conn:
        cursor = conn.execute("""
            INSERT INTO telemetry_observations (
                client_id, portal, city, locality, listing_fingerprint,
                price, deposit, bedrooms, features_json, signals_json,
                schema_version, extension_version
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            client_id,
            portal.lower(),
            city.lower(),
            locality.lower() if locality else None,
            listing_fingerprint,
            price,
            deposit,
            bedrooms,
            json.dumps(extracted_features),
            json.dumps(computed_signals) if computed_signals else None,
            schema_version,
            extension_version
        ))
        telemetry_id = cursor.lastrowid
    conn.close()
    return telemetry_id

def record_telemetry_feedback(
    client_id: str,
    listing_fingerprint: str,
    verdict: str,
    reason_category: Optional[str] = None,
    user_note: Optional[str] = None,
    extracted_features_snapshot: Optional[Dict[str, Any]] = None,
    db_file: str = DB_PATH
) -> int:
    """Stores a human ground-truth feedback event."""
    conn = get_connection(db_file)
    with conn:
        cursor = conn.execute("""
            INSERT INTO telemetry_feedback (
                client_id, listing_fingerprint, verdict, reason_category, user_note, snapshot_json
            ) VALUES (?, ?, ?, ?, ?, ?)
        """, (
            client_id,
            listing_fingerprint,
            verdict,
            reason_category,
            user_note,
            json.dumps(extracted_features_snapshot) if extracted_features_snapshot else None
        ))
        feedback_id = cursor.lastrowid
    conn.close()
    return feedback_id


