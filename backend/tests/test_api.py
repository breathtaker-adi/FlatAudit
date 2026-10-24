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
