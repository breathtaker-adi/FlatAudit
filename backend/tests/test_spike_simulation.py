import os
import math
import random
import tempfile
import sqlite3
import pytest
from backend.db import init_db, detect_price_spike

def wilson_score_interval(k: int, n: int, confidence: float = 0.95):
    """Computes exact Wilson score confidence interval for binomial proportion k/n."""
    if n == 0:
        return (0.0, 0.0)
    z = 1.95996  # 95% confidence
    p_hat = k / n
    denominator = 1 + (z ** 2) / n
    center = (p_hat + (z ** 2) / (2 * n)) / denominator
    spread = (z * math.sqrt((p_hat * (1 - p_hat) / n) + (z ** 2) / (4 * (n ** 2)))) / denominator
    lower = max(0.0, center - spread)
    upper = min(1.0, center + spread)
    return (round(lower * 100, 2), round(upper * 100, 2))

@pytest.fixture
def sim_db():
    fd, path = tempfile.mkstemp(suffix=".db")
    os.close(fd)
    init_db(path)
    yield path
    if os.path.exists(path):
        os.remove(path)

def test_large_scale_spike_simulation_1000_markets(sim_db):
    """
    Simulates 1,000 distinct micro-markets under realistic noisy conditions:
    - 800 Stationary Markets (H0):
        * n varying dynamically from 6 to 30 per window
        * Right-skewed log-normal pricing distribution
        * Seasonal ±3% drift
        * Luxury listing composition shifts (1-2 expensive listings randomly introduced)
    - 200 True Surge Markets (H1):
        * Organic +15% to +30% price jumps
        * Repeat listing confirmations
    Computes empirical False Positive Rate (FPR) and True Positive Rate (TPR)
    with 95% Wilson score confidence intervals.
    """
    random.seed(1337)
    conn = sqlite3.connect(sim_db)

    # 1. Generate 800 Stationary Markets
    for m in range(800):
        area = f"stat_cell_{m}"
        base_rent = random.randint(22000, 55000)
        n_base = random.randint(6, 25)
        n_recent = random.randint(6, 25)

        # Baseline window: log-normal scatter around base_rent
        for k in range(n_base):
            # Log-normal noise: median ~ base_rent, right-skewed
            noise = math.exp(random.gauss(0, 0.12))
            val = int(base_rent * noise)
            day_offset = random.randint(35, 115)
            conn.execute("""
                INSERT INTO observations (locality, bhk, rent, day, listing_type, listing_key)
                VALUES (?, 2, ?, date('now', ?), 'rent', ?)
            """, (area, val, f"-{day_offset} days", f"{area}_key_{k}"))

        # Recent window: stationary baseline with seasonal drift ±3%
        seasonal_drift = random.uniform(0.97, 1.03)
        # Inject luxury outlier into 10% of stationary markets
        has_luxury_shift = (m % 10 == 0)

        for k in range(n_recent):
            noise = math.exp(random.gauss(0, 0.12))
            val = int(base_rent * seasonal_drift * noise)
            # Luxury outlier (single listing 2x normal)
            if has_luxury_shift and k == 0:
                val = int(base_rent * 2.1)
            day_offset = random.randint(2, 28)
            # Keep key same for repeat check if k < 3
            l_key = f"{area}_key_{k}" if k < 3 else f"{area}_newkey_{k}"
            conn.execute("""
                INSERT INTO observations (locality, bhk, rent, day, listing_type, listing_key)
                VALUES (?, 2, ?, date('now', ?), 'rent', ?)
            """, (area, val, f"-{day_offset} days", l_key))

    # 2. Generate 200 True Surge Markets
    for m in range(200):
        area = f"surge_cell_{m}"
        base_rent = random.randint(22000, 50000)
        n_base = random.randint(6, 25)
        n_recent = random.randint(6, 25)
        hike = random.uniform(1.15, 1.30)

        for k in range(n_base):
            noise = math.exp(random.gauss(0, 0.10))
            val = int(base_rent * noise)
            day_offset = random.randint(35, 115)
            conn.execute("""
                INSERT INTO observations (locality, bhk, rent, day, listing_type, listing_key)
                VALUES (?, 2, ?, date('now', ?), 'rent', ?)
            """, (area, val, f"-{day_offset} days", f"{area}_key_{k}"))

        for k in range(n_recent):
            noise = math.exp(random.gauss(0, 0.10))
            val = int(base_rent * hike * noise)
            day_offset = random.randint(2, 28)
            l_key = f"{area}_key_{k}" if k < 4 else f"{area}_newkey_{k}"
            conn.execute("""
                INSERT INTO observations (locality, bhk, rent, day, listing_type, listing_key)
                VALUES (?, 2, ?, date('now', ?), 'rent', ?)
            """, (area, val, f"-{day_offset} days", l_key))

    conn.commit()
    conn.close()

    # 3. Evaluate 800 Stationary Markets (False Positives)
    false_positives = 0
    for m in range(800):
        area = f"stat_cell_{m}"
        res = detect_price_spike(area, 2, listing_type='rent', min_samples=6, db_file=sim_db)
        if res.get("is_spike", False):
            false_positives += 1

    # 4. Evaluate 200 True Surge Markets (True Positives)
    true_positives = 0
    for m in range(200):
        area = f"surge_cell_{m}"
        res = detect_price_spike(area, 2, listing_type='rent', min_samples=6, db_file=sim_db)
        if res.get("is_spike", False):
            true_positives += 1

    fpr_pct = (false_positives / 800) * 100
    tpr_pct = (true_positives / 200) * 100
    fpr_ci = wilson_score_interval(false_positives, 800)
    tpr_ci = wilson_score_interval(true_positives, 200)

    print(f"\n[1,000-Market Simulation Results]")
    print(f"Stationary Markets (N=800): False Positives = {false_positives} ({fpr_pct:.2f}%, 95% CI: [{fpr_ci[0]}%, {fpr_ci[1]}%])")
    print(f"Surge Markets (N=200): True Positives = {true_positives} ({tpr_pct:.2f}%, 95% CI: [{tpr_ci[0]}%, {tpr_ci[1]}%])")

    # Benchmarks: FPR must be <= 5.0%, and TPR must be >= 80.0%
    assert fpr_pct <= 5.0, f"False Positive Rate too high: {fpr_pct:.2f}% (limit: 5.0%)"
    assert tpr_pct >= 80.0, f"True Positive Rate too low: {tpr_pct:.2f}% (target: >= 80.0%)"
