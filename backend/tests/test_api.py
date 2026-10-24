import pytest
from fastapi.testclient import TestClient
from backend.main import app
from backend.db import init_db

client = TestClient(app)

def test_health_check():
    response = client.get("/api/v1/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "healthy"
    assert data["privacy"] == "no-pii-stored"

def test_observe_and_seen_endpoints():
    sample_hash = "f1e2d3c4b5a69788"
    payload = {
        "url": "https://example.com/flat-123",
        "locality": "Indiranagar",
        "bhk": 2,
        "rent": 42000,
        "deposit": 150000,
        "image_hash": sample_hash
    }

    obs_res = client.post("/api/v1/observe", json=payload)
    assert obs_res.status_code == 201
    obs_data = obs_res.json()
    assert obs_data["status"] == "recorded"
    assert obs_data["seen_count"] >= 1

    # Query /seen
    seen_res = client.get(f"/api/v1/seen?hash={sample_hash}&threshold=10")
    assert seen_res.status_code == 200
    seen_data = seen_res.json()
    assert seen_data["hash"] == sample_hash
    assert seen_data["seen_count"] >= 1

def test_analyze_endpoint_normal_listing():
    payload = {
        "title": "2 BHK Flat in Indiranagar near 100ft road",
        "description": "Family or bachelors. Modular kitchen and power backup.",
        "locality": "Indiranagar, Bangalore",
        "bhk": 2,
        "rent": 42000,
        "deposit": 150000,
        "image_hashes": ["0123456789abcdef"]
    }
    res = client.post("/api/v1/analyze", json=payload)
    assert res.status_code == 200
    data = res.json()
    assert data["badge_label"] == "Looks normal"
    assert data["badge_tone"] == "ok"
    assert len(data["observable_facts"]) == 0

def test_analyze_endpoint_scam_signals():
    payload = {
        "title": "Urgent 3 BHK Flat in HSR Layout",
        "description": "Army officer urgent transfer duty posting. Gate pass visiting token 2500 refundable upon gate entry.",
        "locality": "HSR Layout, Bangalore",
        "bhk": 3,
        "rent": 12000,
        "deposit": 25000,
        "image_hashes": []
    }
    res = client.post("/api/v1/analyze", json=payload)
    assert res.status_code == 200
    data = res.json()
    assert data["badge_label"] == "Many signals"
    assert data["badge_tone"] == "bad"
    assert data["fired_count"] >= 2
    assert "Stage 3" in data["scam_kill_chain_stage"]

    # Verify no defamatory labels
    for fact in data["observable_facts"]:
        assert "scammer" not in fact.lower()
        assert "fraud" not in fact.lower()

def test_cross_portal_matches_and_deduplication():
    shared_hash = "a1b2c3d4e5f60718"

    # 1. Record listing on MagicBricks at ₹40,000
    client.post("/api/v1/observe", json={
        "portal": "magicbricks",
        "listing_key": "mb:cross-1",
        "locality": "Indiranagar",
        "bhk": 2,
        "rent": 40000,
        "deposit": 120000,
        "area_sqft": 1250,
        "floor": 3,
        "image_hash": shared_hash
    })

    # 2. Query matches from NoBroker perspective (where rent is ₹42,000)
    match_res = client.get(
        f"/api/v1/matches?rent=42000&portal=nobroker&listing_key=nb:cross-2&locality=Indiranagar&bhk=2&area_sqft=1250&floor=3&image_hash={shared_hash}"
    )
    assert match_res.status_code == 200
    match_data = match_res.json()
    assert match_data["match_count"] >= 1
    best_match = match_data["matches"][0]
    assert best_match["portal"] == "magicbricks"
    assert best_match["rent"] == 40000
    assert best_match["rent_delta"] == -2000  # 2,000 cheaper on magicbricks
    assert "Matching photo fingerprint" in best_match["reasons"][0]
    assert "Same locality and BHK" in best_match["reasons"][1]

def test_locality_stats_sample_size():
    res = client.get("/api/v1/locality-stats?locality=indiranagar&bhk=2")
    assert res.status_code == 200
    data = res.json()
    assert "sample_size" in data
    assert "confidence" in data
    assert data["sample_size"] >= 1

def test_observe_sale_listing():
    sale_payload = {
        "portal": "nobroker",
        "listing_key": "nb-sale-electronic-city-101",
        "listing_type": "sale",
        "locality": "Electronic City, Bangalore",
        "bhk": 2,
        "price": 12500000,
        "price_per_sqft": 10162,
        "area_sqft": 1230,
        "area_type": "carpet",
        "possession_status": "ready_to_move",
        "rera_id": "PRM/KA/RERA/1251/310/PR/171015/000451",
        "floor": 4,
        "image_hash": "a1b2c3d4e5f60718"
    }
    res = client.post("/api/v1/observe", json=sale_payload)
    assert res.status_code == 201
    data = res.json()
    assert data["status"] == "recorded"
    assert data["seen_count"] >= 1


