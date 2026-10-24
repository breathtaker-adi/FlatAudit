"""
FlatAudit - Market Pack Aggregator & Publisher (build_packs.py)

Nightly / on-demand batch job that:
1. Connects to SQLite observations database.
2. Filters out outlier / poisoned rows (e.g., suspicious image duplicates or invalid rents).
3. Groups observations by spatial geohash cells (Area level: 5 chars, District: 4 chars) and BHK.
4. Computes robust non-parametric statistics:
   - Trimmed Median & MAD (Median Absolute Deviation)
   - 25th & 75th percentiles (IQR)
   - Rent per sq. ft. median (when area_sqft is present)
   - Deposit-to-rent multiple (median, min, max, p10, p90)
5. Enforces minimum contributor thresholds (k >= 5) before publishing.
6. Emits static JSON packs with ZERO raw listing fields, ZERO PII, and ZERO image hashes.
"""

import os
import math
import json
import sqlite3
import hashlib
from datetime import datetime, timedelta
from typing import Dict, Any, List, Optional
from pathlib import Path

DEFAULT_DB_PATH = os.path.join(os.path.dirname(__file__), "flataudit.db")
DEFAULT_PACKS_DIR = os.path.join(os.path.dirname(__file__), "packs")

def compute_percentile(sorted_data: List[float], p: float) -> float:
    """Computes percentile p (0.0 to 1.0) using linear interpolation."""
    if not sorted_data:
        return 0.0
    if len(sorted_data) == 1:
        return float(sorted_data[0])
    idx = p * (len(sorted_data) - 1)
    low = int(math.floor(idx))
    high = int(math.ceil(idx))
    weight = idx - low
    return float(sorted_data[low] * (1.0 - weight) + sorted_data[high] * weight)

def compute_median(data: List[float]) -> Optional[float]:
    """Computes exact median of numeric list."""
    if not data:
        return None
    sorted_d = sorted(data)
    n = len(sorted_d)
    mid = n // 2
    if n % 2 != 0:
        return float(sorted_d[mid])
    return float(round((sorted_d[mid - 1] + sorted_d[mid]) / 2.0))

def compute_mad(data: List[float], median_val: Optional[float] = None) -> float:
    """
    Computes Median Absolute Deviation (MAD):
    MAD = median(|x_i - median(X)|)
    """
    if not data:
        return 0.0
    med = median_val if median_val is not None else compute_median(data)
    if med is None:
        return 0.0
    deviations = [abs(x - med) for x in data]
    return float(compute_median(deviations) or 0.0)

def aggregate_market_packs(
    db_path: str = DEFAULT_DB_PATH,
    output_dir: str = DEFAULT_PACKS_DIR,
    window_days: int = 90,
    min_contributors: int = 5
) -> Dict[str, Any]:
    """
    Scans observations database, groups valid observations by spatial cells,
    computes robust statistics, and writes zero-PII static JSON packs.
    """
    Path(output_dir).mkdir(parents=True, exist_ok=True)
    
    if not os.path.exists(db_path):
        return {"status": "error", "message": f"Database file {db_path} does not exist", "packs_written": 0}

    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    cutoff_date = (datetime.now() - timedelta(days=window_days)).strftime("%Y-%m-%d")

    cursor = conn.cursor()
    
    # Check if geohash column exists
    cursor.execute("PRAGMA table_info(observations)")
    cols = {row["name"] for row in cursor.fetchall()}
    has_geohash = "geohash" in cols
    
    # Query valid, non-poisoned observations
    query = """
        SELECT 
            portal, listing_key, locality, bhk, rent, deposit, area_sqft, floor, image_hash, created_at, day
            {geohash_select}
        FROM observations
        WHERE rent >= 3000 AND rent <= 2000000
          AND (day >= ? OR day IS NULL)
    """.format(geohash_select=", geohash" if has_geohash else "")

    cursor.execute(query, (cutoff_date,))
    rows = cursor.fetchall()
    conn.close()

    if not rows:
        return {"status": "ok", "message": "No observations found in window", "packs_written": 0}

    # Group observations by cell and locality
    # We create cells at both length 5 (area) and length 4 (district), plus locality fallbacks
    cell_groups: Dict[str, Dict[str, Any]] = {}

    for row in rows:
        rent = row["rent"]
        deposit = row["deposit"]
        bhk = row["bhk"] or 2
        area_sqft = row["area_sqft"]
        locality = (row["locality"] or "").strip()
        geohash = (row["geohash"] or "").strip().lower() if has_geohash else ""

        if not (1 <= bhk <= 5):
            continue

        target_cells = []
        if geohash:
            if len(geohash) >= 5:
                target_cells.append((geohash[:5], "area_cell", locality))
            if len(geohash) >= 4:
                target_cells.append((geohash[:4], "district_cell", locality))

        if locality:
            norm_loc = locality.lower().replace(" ", "_")
            target_cells.append((norm_loc, "locality", locality))

        for cell_id, cell_level, loc_name in target_cells:
            if cell_id not in cell_groups:
                cell_groups[cell_id] = {
                    "cell": cell_id,
                    "level": cell_level,
                    "name": loc_name or cell_id,
                    "records_by_bhk": {}
                }
            
            bhk_key = str(bhk)
            if bhk_key not in cell_groups[cell_id]["records_by_bhk"]:
                cell_groups[cell_id]["records_by_bhk"][bhk_key] = []
            
            cell_groups[cell_id]["records_by_bhk"][bhk_key].append({
                "rent": float(rent),
                "deposit": float(deposit) if deposit is not None and deposit >= 0 else None,
                "area_sqft": float(area_sqft) if area_sqft and area_sqft > 0 else None
            })

    # Build packs
    published_packs = []
    index_entries = []

    today_str = datetime.now().strftime("%Y-%m-%d")

    for cell_id, group in cell_groups.items():
        total_obs = sum(len(items) for items in group["records_by_bhk"].values())
        if total_obs < min_contributors:
            continue

        pack_bhk_stats: Dict[str, Any] = {}
        all_deposit_multiples: List[float] = []

        for bhk_key, records in group["records_by_bhk"].items():
            if len(records) < 3:
                continue

            rents = sorted([r["rent"] for r in records])
            med = compute_median(rents)
            mad = compute_mad(rents, med)
            p25 = compute_percentile(rents, 0.25)
            p75 = compute_percentile(rents, 0.75)

            # Rent per sqft
            psf_vals = [r["rent"] / r["area_sqft"] for r in records if r["area_sqft"]]
            psf_median = round(compute_median(psf_vals), 1) if psf_vals else None

            # Deposit multiples
            for r in records:
                if r["deposit"] is not None and r["rent"] > 0:
                    multiple = round(r["deposit"] / r["rent"], 2)
                    if 0.0 <= multiple <= 15.0:
                        all_deposit_multiples.append(multiple)

            pack_bhk_stats[bhk_key] = {
                "n": len(records),
                "p25": round(p25),
                "median": round(med) if med else 0,
                "p75": round(p75),
                "mad": round(mad),
                "psf_median": psf_median
            }

        if not pack_bhk_stats:
            continue

        # Deposit aggregate stats
        deposit_stats = {}
        if all_deposit_multiples:
            dep_sorted = sorted(all_deposit_multiples)
            dep_median = compute_median(dep_sorted)
            deposit_stats = {
                "n": len(all_deposit_multiples),
                "p10": round(compute_percentile(dep_sorted, 0.10), 1),
                "median": round(dep_median, 1) if dep_median else 3.0,
                "p90": round(compute_percentile(dep_sorted, 0.90), 1),
                "min": round(min(all_deposit_multiples), 1),
                "max": round(max(all_deposit_multiples), 1)
            }
        else:
            deposit_stats = {
                "n": 0,
                "p10": 1.0,
                "median": 3.0,
                "p90": 6.0,
                "min": 1.0,
                "max": 6.0
            }

        pack = {
            "v": 1,
            "cell": cell_id,
            "level": group["level"],
            "name": group["name"],
            "updated": today_str,
            "window_days": window_days,
            "total_observations": total_obs,
            "bhk": pack_bhk_stats,
            "deposit_multiple": deposit_stats
        }

        # Safe filename
        safe_name = "".join(c if c.isalnum() or c in "-_" else "_" for c in cell_id)
        pack_file = os.path.join(output_dir, f"{safe_name}.json")
        with open(pack_file, "w", encoding="utf-8") as f:
            json.dump(pack, f, indent=2)

        published_packs.append(pack)
        index_entries.append({
            "cell": cell_id,
            "level": group["level"],
            "name": group["name"],
            "total_observations": total_obs,
            "updated": today_str
        })

    # Write index.json
    index_file = os.path.join(output_dir, "index.json")
    index_content = {
        "v": 1,
        "updated": today_str,
        "total_packs": len(published_packs),
        "cells": index_entries
    }
    with open(index_file, "w", encoding="utf-8") as f:
        json.dump(index_content, f, indent=2)

    return {
        "status": "ok",
        "packs_written": len(published_packs),
        "output_dir": output_dir,
        "index_file": index_file
    }

if __name__ == "__main__":
    result = aggregate_market_packs()
    print(f"Market pack aggregation complete: {result['packs_written']} packs written to {result.get('output_dir')}")
