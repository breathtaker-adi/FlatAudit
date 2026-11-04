import os
import glob
import json
import pytest

FIXTURES_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "../../tests/fixtures/rajasthan"))
VERIFIED_LOG_PATH = os.path.abspath(os.path.join(os.path.dirname(__file__), "../../tests/fixtures/verified_sources.log"))

def get_verified_fixture_ids():
    ids = set()
    if os.path.exists(VERIFIED_LOG_PATH):
        with open(VERIFIED_LOG_PATH, "r", encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith("#"):
                    parts = line.split("\t")
                    if parts:
                        ids.add(parts[0])
    return ids

sale_files = glob.glob(os.path.join(FIXTURES_DIR, "sale", "*.json"))
rent_files = glob.glob(os.path.join(FIXTURES_DIR, "rent", "*.json"))

@pytest.mark.parametrize("filepath", sale_files)
def test_rajasthan_sale_fixtures(filepath):
    """Verifies that Rajasthan sale fixtures conform to schema and ground truth expectations."""
    with open(filepath, "r", encoding="utf-8") as f:
        data = json.load(f)

    fixture_id = data["id"]
    assert fixture_id.startswith("RAJ-SALE-")
    assert "extracted_features" in data
    assert "ground_truth" in data

    # Verify audit trail in verified_sources.log
    verified_ids = get_verified_fixture_ids()
    # Normalize ID matching (e.g. RAJ-SALE-JAI-001 vs RJ-SALE-JAI-001)
    matched = any(fixture_id.replace("RAJ-", "RJ-") == vid or fixture_id == vid for vid in verified_ids)
    assert matched, f"Fixture {fixture_id} must have an entry in verified_sources.log"

    # Evaluates Raj-RERA dossier if present
    features = data["extracted_features"]
    dossier = features.get("raj_rera_dossier")
    if dossier:
        funds = dossier.get("funds_withdrawn_pct", 0)
        costs = dossier.get("cost_incurred_pct", 0)
        divergence = funds - costs
        if divergence > 10.0:
            assert "ESCROW_OVERDRAWN" in data["ground_truth"]["expected_flags"]
        
        qpr_lag = dossier.get("qpr_filing_lag_days", 0)
        if qpr_lag > 90:
            assert "COMPLIANCE_NON_REPORTING" in data["ground_truth"]["expected_flags"]

@pytest.mark.parametrize("filepath", rent_files)
def test_rajasthan_rent_fixtures(filepath):
    """Verifies that Rajasthan rental fixtures conform to expected fraud signals and edge cases."""
    with open(filepath, "r", encoding="utf-8") as f:
        data = json.load(f)

    fixture_id = data["id"]
    assert fixture_id.startswith("RAJ-RENT-")
    assert "extracted_features" in data
    assert "ground_truth" in data

    classification = data["ground_truth"]["classification"]
    features = data["extracted_features"]

    if classification == "suspicious":
        # Must have at least one fraud marker
        has_fraud_signal = bool(features.get("regex_matches") or features.get("corpus_duplicate_count", 0) > 1)
        assert has_fraud_signal, f"Suspicious fixture {fixture_id} must contain fraud signal attributes"
    elif classification == "normal":
        # Must not contain scam regex triggers
        assert len(features.get("regex_matches", [])) == 0, f"Clean fixture {fixture_id} must not fire scam regex"
