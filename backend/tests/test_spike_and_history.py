import os
import pytest
import tempfile
import sqlite3
from backend.db import (
    init_db,
    record_observation,
    detect_price_spike,
    rollup_monthly_aggregates,
    get_area_trend
)

@pytest.fixture
def temp_db():
    fd, path = tempfile.mkstemp(suffix=".db")
    os.close(fd)
    init_db(path)
    yield path
    if os.path.exists(path):
        os.remove(path)

def test_cell_month_table_and_rollup(temp_db):
    # Insert observations for 2026-09 and 2026-10
    conn = sqlite3.connect(temp_db)
    # September 2026 listings
    conn.execute("""
        INSERT INTO observations (locality, bhk, rent, day, listing_type) VALUES
        ('indiranagar', 2, 38000, '2026-09-05', 'rent'),
        ('indiranagar', 2, 40000, '2026-09-12', 'rent'),
        ('indiranagar', 2, 42000, '2026-09-20', 'rent')
    """)
    conn.commit()
    conn.close()

    rollup_monthly_aggregates('2026-09', db_file=temp_db)

    trend = get_area_trend('indiranagar', 2, listing_type='rent', db_file=temp_db)
    assert trend["months_count"] == 1
    assert trend["history"][0]["month"] == '2026-09'
    assert trend["history"][0]["median"] == 40000
    assert trend["history"][0]["n"] == 3

def test_detect_price_spike_evaluated(temp_db):
    conn = sqlite3.connect(temp_db)
    # Baseline window (-40 days): 6 listings around 30k
    for i in range(6):
        conn.execute("""
            INSERT INTO observations (locality, bhk, rent, day, listing_type, listing_key)
            VALUES ('hsr layout', 2, 30000, date('now', '-40 days'), 'rent', ?)
        """, (f"base_{i}",))

    # Recent window (-5 days): 6 listings around 38k (26.7% spike)
    for i in range(6):
        conn.execute("""
            INSERT INTO observations (locality, bhk, rent, day, listing_type, listing_key)
            VALUES ('hsr layout', 2, 38000, date('now', '-5 days'), 'rent', ?)
        """, (f"recent_{i}",))

    conn.commit()
    conn.close()

    spike = detect_price_spike('hsr layout', 2, listing_type='rent', db_file=temp_db)
    assert spike["status"] == "evaluated"
    assert spike["is_spike"] is True
    assert spike["delta_pct"] >= 20.0
    assert "Market moved +" in spike["verdict"]
    assert spike["sample_recent"] == 6
    assert spike["sample_baseline"] == 6

def test_detect_price_spike_insufficient_data(temp_db):
    conn = sqlite3.connect(temp_db)
    conn.execute("""
        INSERT INTO observations (locality, bhk, rent, day, listing_type)
        VALUES ('koramangala', 2, 45000, date('now', '-5 days'), 'rent')
    """)
    conn.commit()
    conn.close()

    spike = detect_price_spike('koramangala', 2, listing_type='rent', db_file=temp_db)
    assert spike["status"] == "insufficient_data"
    assert spike["is_spike"] is False
