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
    """Initializes SQLite database schema."""
    conn = get_connection(db_file)
    with conn:
        conn.execute("""
            CREATE TABLE IF NOT EXISTS observations (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                url_hash TEXT,
                locality TEXT,
                bhk INTEGER,
                rent INTEGER,
                deposit INTEGER,
                image_hash TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)
        conn.execute("CREATE INDEX IF NOT EXISTS idx_image_hash ON observations(image_hash)")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_locality_bhk ON observations(locality, bhk)")
    conn.close()

def record_observation(
    locality: Optional[str],
    bhk: Optional[int],
    rent: Optional[int],
    deposit: Optional[int],
    image_hash: Optional[str],
    url: Optional[str] = None,
    db_file: str = DB_PATH
) -> int:
    """Inserts a new listing observation (storing no personal data)."""
    conn = get_connection(db_file)
    url_hash = hashlib.sha256(url.encode('utf-8')).hexdigest()[:16] if url else None
    cleaned_locality = locality.strip().lower() if locality else None
    cleaned_hash = image_hash.strip().lower() if image_hash else None

    with conn:
        cursor = conn.execute("""
            INSERT INTO observations (url_hash, locality, bhk, rent, deposit, image_hash)
            VALUES (?, ?, ?, ?, ?, ?)
        """, (url_hash, cleaned_locality, bhk, rent, deposit, cleaned_hash))
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
    cursor = conn.execute("SELECT id, url_hash, image_hash FROM observations WHERE image_hash IS NOT NULL")
    rows = cursor.fetchall()
    conn.close()

    matched_distinct_urls = set()
    total_matches = 0

    for row in rows:
        row_hash = row["image_hash"]
        if row_hash:
            dist = hamming_distance(target_clean, row_hash)
            if dist <= threshold:
                total_matches += 1
                matched_distinct_urls.add(row["url_hash"] or str(row["id"]))

    seen_count = max(len(matched_distinct_urls), 1) if total_matches > 0 else 1
    return {
        "seen_count": seen_count,
        "matched_listings": total_matches
    }

def get_locality_stats(locality: str, bhk: int, db_file: str = DB_PATH) -> Dict[str, Any]:
    """Calculates summary price statistics for a locality and BHK."""
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

    return {
        "locality": locality,
        "bhk": bhk,
        "count": count,
        "median_rent": median_rent,
        "min_rent": min_rent,
        "max_rent": max_rent,
        "median_deposit": median_deposit
    }
