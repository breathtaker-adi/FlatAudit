import os
import pytest
import tempfile
from backend.db import init_db, record_observation, count_seen_hashes, hamming_distance, get_locality_stats

def test_hamming_distance_exact():
    assert hamming_distance("0000000000000000", "0000000000000000") == 0
    assert hamming_distance("ffffffffffffffff", "ffffffffffffffff") == 0
    assert hamming_distance("0000000000000000", "ffffffffffffffff") == 64
    assert hamming_distance("0000000000000000", "0000000000000001") == 1

def test_db_operations_and_duplicate_counting():
    with tempfile.NamedTemporaryFile(suffix=".db", delete=False) as tmp:
        db_path = tmp.name

    try:
        init_db(db_path)

        # Base hash
        hash_a = "a4c28f1107be924d"
        # Near duplicate (2 bits differing)
        hash_near = "a4c28f1107be924f"
        # Distinct hash
        hash_distinct = "5b3d70ee98416db2"

        # Record 1st listing with hash_a
        id1 = record_observation(
            locality="Indiranagar",
            bhk=2,
            rent=40000,
            deposit=150000,
            image_hash=hash_a,
            url="https://portal.com/listing-1",
            db_file=db_path
        )
        assert id1 > 0

        # Query seen count for hash_a -> should be 1
        res1 = count_seen_hashes(hash_a, threshold=10, db_file=db_path)
        assert res1["seen_count"] == 1

        # Record 2nd distinct listing with near duplicate hash
        id2 = record_observation(
            locality="HSR Layout",
            bhk=3,
            rent=12000,
            deposit=25000,
            image_hash=hash_near,
            url="https://portal.com/listing-2",
            db_file=db_path
        )
        assert id2 > 0

        # Now query seen count for hash_a -> should be 2!
        res2 = count_seen_hashes(hash_a, threshold=10, db_file=db_path)
        assert res2["seen_count"] == 2

        # Distinct hash should still only have 0 or 1
        res3 = count_seen_hashes(hash_distinct, threshold=10, db_file=db_path)
        assert res3["seen_count"] == 1

        # Test locality stats
        stats = get_locality_stats("indiranagar", 2, db_file=db_path)
        assert stats["count"] == 1
        assert stats["median_rent"] == 40000

    finally:
        if os.path.exists(db_path):
            os.remove(db_path)
