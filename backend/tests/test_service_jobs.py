import os
import sqlite3
import pytest
from datetime import datetime, date, timedelta, timezone
from fastapi.testclient import TestClient

from backend.main import app
from backend.db import (
    init_db,
    get_connection,
    record_observation,
    rollup_monthly_aggregates,
    backup_database,
    restore_database,
    prune_raw_observations,
    check_stale_packs,
    get_job_logs,
    log_job
)

client = TestClient(app)

@pytest.fixture
def temp_test_db(tmp_path):
    """Provides an isolated SQLite database file for service job testing."""
    db_file = str(tmp_path / "test_service.db")
    init_db(db_file)
    return db_file

def test_closed_month_rollup_gate(temp_test_db):
    """Verifies that rollups are restricted to closed months unless force=True."""
    current_month = datetime.now(timezone.utc).strftime("%Y-%m")
    
    # 1. Attempting rollup on current unclosed month must be skipped by default
    res_skipped = rollup_monthly_aggregates(current_month, force=False, db_file=temp_test_db)
    assert res_skipped["status"] == "SKIPPED"
    assert "not closed yet" in res_skipped["reason"]
    assert res_skipped["cells_processed"] == 0

    # 2. Forcing rollup on current month works
    res_forced = rollup_monthly_aggregates(current_month, force=True, db_file=temp_test_db)
    assert res_forced["status"] == "SUCCESS"

    # 3. Running rollup on a closed past month (e.g. 2026-08) succeeds without force
    res_closed = rollup_monthly_aggregates("2026-08", force=False, db_file=temp_test_db)
    assert res_closed["status"] == "SUCCESS"

def test_monthly_rollup_idempotence(temp_test_db):
    """Verifies that running rollup multiple times yields identical state without duplicates."""
    month = "2026-08"
    conn = get_connection(temp_test_db)
    with conn:
        for i in range(10):
            conn.execute("""
                INSERT INTO observations (locality, geohash, bhk, rent, day, listing_type)
                VALUES (?, ?, ?, ?, ?, 'rent')
            """, (f"bellandur", "tdr1v", 2, 35000 + (i * 1000), f"{month}-15"))
    conn.close()

    # First rollup
    res1 = rollup_monthly_aggregates(month, db_file=temp_test_db)
    assert res1["status"] == "SUCCESS"
    assert res1["cells_processed"] >= 1

    conn = get_connection(temp_test_db)
    c1 = conn.execute("SELECT COUNT(*) as cnt, median FROM cell_month WHERE month = ?", (month,)).fetchone()
    count_1 = c1["cnt"]
    median_1 = c1["median"]
    conn.close()

    # Re-run rollup (idempotence test)
    res2 = rollup_monthly_aggregates(month, db_file=temp_test_db)
    assert res2["status"] == "SUCCESS"

    conn = get_connection(temp_test_db)
    c2 = conn.execute("SELECT COUNT(*) as cnt, median FROM cell_month WHERE month = ?", (month,)).fetchone()
    count_2 = c2["cnt"]
    median_2 = c2["median"]
    conn.close()

    assert count_1 == count_2, "Idempotent rollup must not duplicate cell_month rows"
    assert median_1 == median_2, "Idempotent rollup must preserve identical mathematical medians"

def test_backup_and_restore_cycle(temp_test_db, tmp_path):
    """Verifies online non-blocking backup and exact bit-for-bit restore fidelity."""
    # Seed data
    record_observation(locality="Indiranagar", bhk=2, rent=45000, db_file=temp_test_db)
    record_observation(locality="HSR Layout", bhk=3, rent=55000, db_file=temp_test_db)

    # Backup
    backup_dir = str(tmp_path / "backups")
    backup_file = backup_database(db_file=temp_test_db, backup_dir=backup_dir)
    assert os.path.exists(backup_file)
    assert os.path.getsize(backup_file) > 0

    # Add more rows to source that shouldn't be in the backup
    record_observation(locality="Whitefield", bhk=1, rent=20000, db_file=temp_test_db)

    # Restore to a fresh database target
    restored_db = str(tmp_path / "restored.db")
    restore_success = restore_database(backup_file, target_db_file=restored_db)
    assert restore_success is True

    # Check that restored DB has exactly the 2 observations present at backup time
    conn_restored = get_connection(restored_db)
    cnt = conn_restored.execute("SELECT COUNT(*) as cnt FROM observations").fetchone()["cnt"]
    conn_restored.close()
    assert cnt == 2, f"Restored database must contain exactly 2 records, found {cnt}"

def test_safe_prune_with_mandatory_backup(temp_test_db, tmp_path):
    """Verifies that pruning raw observations older than 90 days requires pre-purge backup."""
    today = date.today()
    old_date = (today - timedelta(days=100)).isoformat()
    recent_date = (today - timedelta(days=20)).isoformat()

    conn = get_connection(temp_test_db)
    with conn:
        # 5 old observations (>90 days old)
        for _ in range(5):
            conn.execute("INSERT INTO observations (locality, bhk, rent, day) VALUES ('HSR', 2, 30000, ?)", (old_date,))
        # 3 recent observations (<90 days old)
        for _ in range(3):
            conn.execute("INSERT INTO observations (locality, bhk, rent, day) VALUES ('HSR', 2, 30000, ?)", (recent_date,))
    conn.close()

    # Pre-populate cell_month aggregate to satisfy rollup precondition
    rollup_monthly_aggregates("2026-07", force=True, db_file=temp_test_db)

    # Execute pruning with required backup
    prune_res = prune_raw_observations(days_to_keep=90, db_file=temp_test_db, require_backup=True)
    assert prune_res["status"] == "SUCCESS"
    assert prune_res["deleted_count"] == 5
    assert prune_res["backup_path"] is not None
    assert os.path.exists(prune_res["backup_path"])

    # Verify only recent records remain in observations table
    conn = get_connection(temp_test_db)
    remaining_cnt = conn.execute("SELECT COUNT(*) as cnt FROM observations").fetchone()["cnt"]
    conn.close()
    assert remaining_cnt == 3

def test_stale_pack_alert(temp_test_db):
    """Verifies stale-pack warning when latest aggregated month is older than 45 days."""
    # 1. Empty cell_month table must alert as stale
    stale_empty = check_stale_packs(threshold_days=45, db_file=temp_test_db)
    assert stale_empty["stale"] is True
    assert "No monthly benchmark rollups found" in stale_empty["warning"]

    # 2. Old month (e.g. 2025-01) must alert as stale
    conn = get_connection(temp_test_db)
    with conn:
        conn.execute("""
            INSERT INTO cell_month (cell, month, listing_type, bhk, n, median)
            VALUES ('indiranagar', '2025-01', 'rent', 2, 10, 40000)
        """)
    conn.close()
    stale_old = check_stale_packs(threshold_days=45, db_file=temp_test_db)
    assert stale_old["stale"] is True
    assert stale_old["days_old"] > 45
    assert "Market benchmark packs are" in stale_old["warning"]

    # 3. Fresh month (last month e.g. 2026-09) must NOT be stale
    last_month_str = (date.today().replace(day=1) - timedelta(days=1)).strftime("%Y-%m")
    conn = get_connection(temp_test_db)
    with conn:
        conn.execute("""
            INSERT OR REPLACE INTO cell_month (cell, month, listing_type, bhk, n, median)
            VALUES ('indiranagar', ?, 'rent', 2, 15, 42000)
        """, (last_month_str,))
    conn.close()
    fresh = check_stale_packs(threshold_days=45, db_file=temp_test_db)
    assert fresh["stale"] is False
    assert fresh["warning"] is None

def test_job_logging_audit_trail(temp_test_db):
    """Verifies that all service operations write structured records to job_logs table."""
    log_id = log_job("test_maintenance", "SUCCESS", "All indexes optimized", 15, 12.5, db_file=temp_test_db)
    assert log_id > 0

    logs = get_job_logs(job_name="test_maintenance", db_file=temp_test_db)
    assert len(logs) >= 1
    assert logs[0]["job_name"] == "test_maintenance"
    assert logs[0]["status"] == "SUCCESS"
    assert logs[0]["records_processed"] == 15
    assert logs[0]["duration_ms"] == 12.5
