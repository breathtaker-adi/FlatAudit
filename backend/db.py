import sqlite3
import hashlib
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
    conn = sqlite3.connect(db_file)
    conn.row_factory = sqlite3.Row
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
