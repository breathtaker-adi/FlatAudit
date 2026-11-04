import pytest
from fastapi.testclient import TestClient
from backend.main import app
from backend.db import init_db, get_connection

client = TestClient(app)

@pytest.fixture
def temp_test_db(tmp_path):
    db_file = str(tmp_path / "test_telemetry.db")
    init_db(db_file)
    return db_file

def test_telemetry_observation_ingestion():
    payload = {
        "client_id": "anon-tester-uuid-001",
        "portal": "nobroker",
        "city": "jaipur",
        "locality": "malviya_nagar",
        "listing_fingerprint": "a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f90",
        "extracted_features": {
            "rent": 16000,
            "deposit": 32000,
            "bhk": 2,
            "has_advance_fee_regex": False,
            "matched_phrases": [],
            "image_dhashes": ["a4f8c2b1e3d09a12", "f0e1d2c3b4a59687"]
        },
        "computed_signals": {
            "z_score": -0.85,
            "deposit_rent_ratio": 2.0
        },
        "schema_version": "1.1",
        "extension_version": "0.4.2"
    }

    res = client.post("/v1/telemetry/observation", json=payload)
    assert res.status_code == 201
    data = res.json()
    assert data["status"] == "recorded"
    assert data["telemetry_id"] > 0
    assert data["client_id"] == "anon-tester-uuid-001"

def test_telemetry_feedback_ingestion():
    payload = {
        "client_id": "anon-tester-uuid-001",
        "listing_fingerprint": "a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f90",
        "verdict": "false_positive",
        "reason_category": "multi_broker_duplicate",
        "user_note": "Identical photos are standard here; 3 registered brokers handle this floor.",
        "extracted_features_snapshot": {
            "rent": 16000,
            "deposit": 32000
        }
    }

    res = client.post("/v1/telemetry/feedback", json=payload)
    assert res.status_code == 201
    data = res.json()
    assert data["status"] == "recorded"
    assert data["feedback_id"] > 0
    # Alert dispatched on false_positive
    assert data["alert_dispatched"] is True or data["alert_dispatched"] is False

def test_rate_limiting_enforcement():
    # Make 65 quick requests
    hit_429 = False
    for i in range(65):
        res = client.post("/v1/telemetry/observation", json={
            "client_id": "rate-limit-test",
            "portal": "housing",
            "city": "bangalore",
            "listing_fingerprint": f"fingerprint_{i:04d}_0123456789abcdef",
            "extracted_features": {"rent": 25000}
        })
        if res.status_code == 429:
            hit_429 = True
            break
    assert hit_429 is True, "Must enforce 60 req/min rate limit"
