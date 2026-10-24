"""
Unit tests for Market Pack Aggregator and Static API (build_packs.py and main.py)
Validates:
- Aggregation of spatial cells (geohash & locality)
- Calculation of non-parametric stats (trimmed median, MAD, PSF median, deposit multiples)
- Minimum contributor thresholds enforcement
- Zero-PII guarantee (ensures NO raw listing URLs, phone numbers, image hashes, or titles leak into packs)
- ETag and 304 caching support
"""

import os
import json
import tempfile
import pytest
from fastapi.testclient import TestClient

from backend.main import app
from backend.db import init_db, record_observation
from backend.build_packs import aggregate_market_packs

client = TestClient(app)

@pytest.fixture
def test_env():
    with tempfile.TemporaryDirectory() as temp_dir:
        db_path = os.path.join(temp_dir, "test_packs.db")
        packs_dir = os.path.join(temp_dir, "packs")
        init_db(db_path)
        yield {
            "db_path": db_path,
            "packs_dir": packs_dir
        }

def test_market_pack_aggregation_and_zero_pii(test_env):
    db_path = test_env["db_path"]
    packs_dir = test_env["packs_dir"]

    # Seed observations for Indiranagar (geohash tdr1yc, locality indiranagar)
    # 7 observations for 2BHK: rents: 38k, 40k, 40k, 42k, 44k, 45k, 41k
    rents = [38000, 40000, 40000, 42000, 44000, 45000, 41000]
    for idx, r in enumerate(rents):
        record_observation(
            locality="Indiranagar",
            bhk=2,
            rent=r,
            deposit=r * 4,
            area_sqft=1150,
            floor=3,
            geohash="tdr1yc",
            url=f"https://example.com/listing_{idx}?secret_token=abc12345",
            portal="nobroker",
            listing_key=f"nb-{idx}",
            image_hash="a1b2c3d4e5f60718",
            db_file=db_path
        )

    # 2 observations for 3BHK: below minimum contributor threshold for that BHK
    record_observation(
        locality="Indiranagar",
        bhk=3,
        rent=70000,
        deposit=280000,
        area_sqft=1800,
        geohash="tdr1yc",
        url="https://example.com/listing_3bhk_1",
        portal="nobroker",
        listing_key="nb-3bhk-1",
        db_file=db_path
    )
    record_observation(
        locality="Indiranagar",
        bhk=3,
        rent=72000,
        deposit=288000,
        area_sqft=1850,
        geohash="tdr1yc",
        url="https://example.com/listing_3bhk_2",
        portal="nobroker",
        listing_key="nb-3bhk-2",
        db_file=db_path
    )

    # Run aggregator with min_contributors = 5
    res = aggregate_market_packs(
        db_path=db_path,
        output_dir=packs_dir,
        min_contributors=5
    )

    assert res["status"] == "ok"
    assert res["packs_written"] > 0

    # Verify index.json exists
    index_file = os.path.join(packs_dir, "index.json")
    assert os.path.exists(index_file)
    with open(index_file, "r", encoding="utf-8") as f:
        idx_data = json.load(f)
        assert idx_data["v"] == 1
        assert len(idx_data["cells"]) > 0

    # Scan EVERY generated pack file for zero PII / raw fields
    FORBIDDEN_FIELDS = [
        "url", "listing_key", "phone", "contact", "owner", "image_hash", 
        "secret_token", "description", "title", "tenant", "landlord"
    ]

    for fname in os.listdir(packs_dir):
        if not fname.endswith(".json"):
            continue
        file_path = os.path.join(packs_dir, fname)
        with open(file_path, "r", encoding="utf-8") as f:
            raw_text = f.read().lower()
            data = json.loads(raw_text)

        # Check for forbidden raw field keys or values
        for forbidden in FORBIDDEN_FIELDS:
            assert forbidden not in raw_text, f"Forbidden field '{forbidden}' found in {fname}"

        # If it's a cell pack (not index.json)
        if fname != "index.json":
            assert "bhk" in data
            assert "deposit_multiple" in data
            assert data["v"] == 1
            # 2BHK should have aggregated stats
            assert "2" in data["bhk"]
            bhk2 = data["bhk"]["2"]
            assert bhk2["n"] == 7
            assert bhk2["median"] == 41000
            assert bhk2["mad"] >= 0
            assert bhk2["psf_median"] > 0
            # 3BHK had only 2 observations (< 3), so it must NOT be published
            assert "3" not in data["bhk"]

def test_packs_api_etag_caching(test_env, monkeypatch):
    packs_dir = test_env["packs_dir"]
    os.makedirs(packs_dir, exist_ok=True)

    # Create dummy pack
    dummy_pack = {
        "v": 1,
        "cell": "tdr1y",
        "level": "area_cell",
        "name": "Indiranagar",
        "bhk": {"2": {"n": 15, "median": 42000, "mad": 3000}},
        "deposit_multiple": {"median": 4.0}
    }
    with open(os.path.join(packs_dir, "tdr1y.json"), "w", encoding="utf-8") as f:
        json.dump(dummy_pack, f)

    index_data = {
        "v": 1,
        "total_packs": 1,
        "cells": [{"cell": "tdr1y", "level": "area_cell", "name": "Indiranagar"}]
    }
    with open(os.path.join(packs_dir, "index.json"), "w", encoding="utf-8") as f:
        json.dump(index_data, f)

    # Monkeypatch PACKS_DIR in main
    import backend.main as main_mod
    monkeypatch.setattr(main_mod, "PACKS_DIR", packs_dir)

    # 1. Fetch index.json
    res1 = client.get("/api/v1/packs/index.json")
    assert res1.status_code == 200
    assert "ETag" in res1.headers
    etag = res1.headers["ETag"]

    # 2. Re-fetch with matching If-None-Match header -> 304 Not Modified
    res2 = client.get("/api/v1/packs/index.json", headers={"If-None-Match": etag})
    assert res2.status_code == 304

    # 3. Fetch cell pack
    res3 = client.get("/api/v1/packs/tdr1y")
    assert res3.status_code == 200
    data = res3.json()
    assert data["cell"] == "tdr1y"
    cell_etag = res3.headers["ETag"]

    # Re-fetch cell pack with If-None-Match
    res4 = client.get("/api/v1/packs/tdr1y", headers={"If-None-Match": cell_etag})
    assert res4.status_code == 304

    # 4. Unknown cell returns 404
    res5 = client.get("/api/v1/packs/nonexistent_cell")
    assert res5.status_code == 404
