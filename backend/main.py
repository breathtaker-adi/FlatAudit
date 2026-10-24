import re
from typing import Dict, Any, List
from contextlib import asynccontextmanager
from fastapi import FastAPI, Query, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware

from backend.config import CORS_ORIGINS, DB_PATH
from backend.db import init_db, record_observation, count_seen_hashes, get_locality_stats
from backend.models import (
    ObservationCreate,
    ObservationResponse,
    SeenResponse,
    LocalityStatsResponse,
    AnalyzeRequest,
    AnalyzeResponse,
    SignalDetail
)

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Initialize DB schema on startup
    init_db(DB_PATH)
    yield

# Ensure DB is initialized immediately upon import
init_db(DB_PATH)

app = FastAPI(
    title="FlatAudit - Listing Trust Analyzer API",
    description="Privacy-preserving rental listing fraud signal evaluation engine and image fingerprint registry.",
    version="1.0.0",
    lifespan=lifespan
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["*"],
)

LOCALITY_BENCHMARKS = {
    'indiranagar': {'bhk1': 22000, 'bhk2': 40000, 'bhk3': 65000, 'deposit_months': (3, 6), 'city': 'Bangalore'},
    'hsr layout': {'bhk1': 18000, 'bhk2': 32000, 'bhk3': 52000, 'deposit_months': (3, 6), 'city': 'Bangalore'},
    'koramangala': {'bhk1': 22000, 'bhk2': 42000, 'bhk3': 68000, 'deposit_months': (3, 6), 'city': 'Bangalore'},
    'whitefield': {'bhk1': 16000, 'bhk2': 28000, 'bhk3': 45000, 'deposit_months': (2, 5), 'city': 'Bangalore'},
    'bellandur': {'bhk1': 18000, 'bhk2': 32000, 'bhk3': 50000, 'deposit_months': (2, 5), 'city': 'Bangalore'},
    'powai': {'bhk1': 34000, 'bhk2': 55000, 'bhk3': 85000, 'deposit_months': (2, 4), 'city': 'Mumbai'},
    'andheri': {'bhk1': 30000, 'bhk2': 50000, 'bhk3': 75000, 'deposit_months': (2, 4), 'city': 'Mumbai'},
    'bandra': {'bhk1': 45000, 'bhk2': 75000, 'bhk3': 130000, 'deposit_months': (2, 5), 'city': 'Mumbai'},
    'cyber city': {'bhk1': 25000, 'bhk2': 42000, 'bhk3': 62000, 'deposit_months': (1, 3), 'city': 'Gurgaon'},
    'dlf phase 2': {'bhk1': 24000, 'bhk2': 40000, 'bhk3': 60000, 'deposit_months': (1, 3), 'city': 'Gurgaon'},
    'sector 56': {'bhk1': 16000, 'bhk2': 28000, 'bhk3': 42000, 'deposit_months': (1, 2), 'city': 'Gurgaon'},
    'hinjawadi': {'bhk1': 14000, 'bhk2': 23000, 'bhk3': 35000, 'deposit_months': (1, 3), 'city': 'Pune'},
    'wakad': {'bhk1': 15000, 'bhk2': 24000, 'bhk3': 36000, 'deposit_months': (1, 3), 'city': 'Pune'}
}

PHRASE_PATTERNS = [
    {
        "category": "advance_fee",
        "severity": "high",
        "regex": re.compile(r"gate\s*pass|visiting\s*token|token\s*before\s*(?:visit|viewing|seeing|inspection)|entry\s*(?:pass|slip)|visiting\s*card\s*charge|courier\s*clearance|refundable\s*upon\s*gate\s*entry", re.I),
        "desc": "advance token/pass fee required before physical visit"
    },
    {
        "category": "military_impersonation",
        "severity": "high",
        "regex": re.compile(r"(?:army|military|defence|defense|cisf|crpf)\s*officer|(?:transferred|posted)\s*to\s*(?:srinagar|border|cantt)|military\s*camp|urgent\s*duty\s*posting", re.I),
        "desc": "military/defense transfer pretext"
    },
    {
        "category": "absentee_pretext",
        "severity": "medium",
        "regex": re.compile(r"relocated\s*(?:abroad|permanently|overseas)|money\s*is\s*not\s*my\s*motive|keys?\s*(?:are\s*)?(?:with|deposited\s*at)\s*courier|key\s*courier", re.I),
        "desc": "remote owner unavailable with courier key delivery pretext"
    },
    {
        "category": "urgency_bait",
        "severity": "medium",
        "regex": re.compile(r"(?:traveling|leaving)\s*out\s*of\s*country\s*tonight|100%\s*refundable\s*if\s*you\s*do\s*not\s*like|whatsapp\s*immediately\s*for\s*upi", re.I),
        "desc": "high-pressure urgency or unusual refund assurance"
    }
]

@app.get("/api/v1/health")
def health_check():
    return {
        "status": "healthy",
        "service": "flataudit-api",
        "version": "1.0.0",
        "privacy": "no-pii-stored"
    }

@app.post("/api/v1/observe", response_model=ObservationResponse, status_code=status.HTTP_201_CREATED)
def observe_listing(payload: ObservationCreate):
    """
    Records listing observable parameters (anonymously, storing no contact numbers or photos).
    Returns seen duplicate count for the image hash if provided.
    """
    obs_id = record_observation(
        locality=payload.locality,
        bhk=payload.bhk,
        rent=payload.rent,
        deposit=payload.deposit,
        image_hash=payload.image_hash,
        url=payload.url
    )

    seen_count = 1
    if payload.image_hash:
        match_info = count_seen_hashes(payload.image_hash, threshold=10)
        seen_count = match_info["seen_count"]

    return {
        "status": "recorded",
        "id": obs_id,
        "seen_count": seen_count
    }

@app.get("/api/v1/seen", response_model=SeenResponse)
def get_seen_hash(
    hash: str = Query(..., min_length=16, max_length=16, description="16-character hex dHash"),
    threshold: int = Query(10, ge=0, le=30, description="Max hamming distance threshold")
):
    """
    Checks how many listings share a similar 64-bit dHash within threshold.
    """
    res = count_seen_hashes(hash, threshold=threshold)
    return {
        "hash": hash,
        "seen_count": res["seen_count"],
        "matched_listings": res["matched_listings"],
        "threshold": threshold
    }

@app.get("/api/v1/locality-stats", response_model=LocalityStatsResponse)
def get_locality_price_stats(
    locality: str = Query(..., min_length=2),
    bhk: int = Query(2, ge=1, le=5)
):
    """
    Returns empirical distribution stats for a given locality and BHK.
    """
    stats = get_locality_stats(locality, bhk)
    return stats

@app.post("/api/v1/analyze", response_model=AnalyzeResponse)
def analyze_listing_endpoint(req: AnalyzeRequest):
    """
    Evaluates listing against observable threat signals:
    - Price outlier (z-score / deviation against locality median)
    - Deposit ratio compared to market norms
    - Advance-fee / identity-pretext phrasing
    - Stolen/reused image dHash fingerprint duplicate count
    """
    full_text = f"{req.title or ''} {req.description or ''}"
    fired_signals: List[Dict[str, Any]] = []

    # 1. Price Signal
    price_fired = False
    price_reason = "Rent amount not provided or unparsed"
    if req.rent and req.rent > 0 and req.locality:
        norm_loc = req.locality.lower()
        matched_bench = None
        for k, v in LOCALITY_BENCHMARKS.items():
            if k in norm_loc:
                matched_bench = (k, v)
                break

        if matched_bench:
            loc_key, bench_data = matched_bench
            bhk_key = f"bhk{min(max(req.bhk or 2, 1), 3)}"
            median_rent = bench_data.get(bhk_key, 35000)
            diff_pct = round(((req.rent - median_rent) / median_rent) * 100)

            if diff_pct <= -38:
                price_fired = True
                price_reason = f"Rent of ₹{req.rent:,} is {abs(diff_pct)}% below the {loc_key.upper()} {req.bhk}BHK median (₹{median_rent:,})"
                fired_signals.append({
                    "id": "price",
                    "severity": "high" if diff_pct <= -50 else "medium",
                    "reason": price_reason,
                    "details": {"diff_pct": diff_pct, "median": median_rent}
                })
            else:
                price_reason = f"Rent of ₹{req.rent:,} is within normal bounds for {loc_key.upper()} (median: ₹{median_rent:,})"

    # 2. Deposit Signal
    deposit_fired = False
    deposit_reason = "Deposit details not specified"
    if req.deposit is not None and req.rent and req.rent > 0:
        ratio = round(req.deposit / req.rent, 1)
        if req.deposit == 0:
            deposit_fired = True
            deposit_reason = "Listing advertises zero security deposit, atypical for this market"
            fired_signals.append({"id": "deposit", "severity": "medium", "reason": deposit_reason})
        elif ratio < 0.8:
            deposit_fired = True
            deposit_reason = f"Deposit of ₹{req.deposit:,} is only {ratio}x monthly rent (expected 2.0x-5.0x)"
            fired_signals.append({"id": "deposit", "severity": "low", "reason": deposit_reason})
        elif ratio > 10:
            deposit_fired = True
            deposit_reason = f"Deposit of ₹{req.deposit:,} is {ratio}x monthly rent (unusually high)"
            fired_signals.append({"id": "deposit", "severity": "medium", "reason": deposit_reason})
        else:
            deposit_reason = f"Deposit ratio of {ratio}x monthly rent is within normal bounds"

    # 3. Phrase Signal
    phrase_matches = []
    phrase_fired = False
    phrase_severity = "low"
    for group in PHRASE_PATTERNS:
        match = group["regex"].search(full_text)
        if match:
            phrase_matches.append(group["desc"])
            if group["severity"] == "high":
                phrase_severity = "high"
            elif group["severity"] == "medium" and phrase_severity != "high":
                phrase_severity = "medium"

    if phrase_matches:
        phrase_fired = True
        phrase_reason = f"Found {len(phrase_matches)} suspicious advance-fee phrase pattern(s): {', '.join(phrase_matches)}"
        fired_signals.append({"id": "phrase", "severity": phrase_severity, "reason": phrase_reason})
    else:
        phrase_reason = "No advance-fee or identity-pretext phrases detected"

    # 4. Image Seen Signal
    image_fired = False
    image_reason = "No image hashes provided"
    max_seen = 1
    if req.image_hashes:
        for h in req.image_hashes:
            seen_res = count_seen_hashes(h, threshold=10)
            if seen_res["seen_count"] > max_seen:
                max_seen = seen_res["seen_count"]

        if max_seen > 1:
            image_fired = True
            image_reason = f"Photo fingerprint has appeared across {max_seen} distinct listings in the registry"
            fired_signals.append({
                "id": "image",
                "severity": "high" if max_seen > 3 else "medium",
                "reason": image_reason,
                "details": {"seen_count": max_seen}
            })
        else:
            image_reason = "Photo has not been observed across conflicting listings"

    # Composite Evaluation
    high_count = sum(1 for s in fired_signals if s.get("severity") == "high")
    total_fired = len(fired_signals)

    if high_count >= 2 or total_fired >= 3:
        badge_label = "Many signals"
        badge_tone = "bad"
        headline_summary = "High Risk: Multiple scam signals flagged. Exercise extreme caution."
    elif high_count == 1 or total_fired >= 1:
        badge_label = "Some signals"
        badge_tone = "warn"
        headline_summary = "Notice: One or more unusual signals found. Review carefully."
    else:
        badge_label = "Looks normal"
        badge_tone = "ok"
        headline_summary = "This listing looks normal. No major red flags detected."

    # Determine Kill Chain Stage
    if any(s["id"] == "phrase" for s in fired_signals):
        kill_chain = "Stage 3: The Excuse (Advance fee / Token request)"
    elif any(s["id"] in ("price", "image") for s in fired_signals):
        kill_chain = "Stage 1: Fake Listing (Bait price / Stolen photos)"
    else:
        kill_chain = "Stage 0: Unflagged"

    human_points = [
        {
            "category": "Rent Pricing",
            "icon": "💰",
            "fired": price_fired,
            "point": f"Monthly rent (₹{req.rent:,}) is below normal market rate" if price_fired else "Rent aligns with local market rates",
            "reason": price_reason
        },
        {
            "category": "Security Deposit",
            "icon": "📑",
            "fired": deposit_fired,
            "point": "Deposit ratio deviates from regional norms" if deposit_fired else "Deposit matches customary city standards",
            "reason": deposit_reason
        },
        {
            "category": "Terms & Phrasing",
            "icon": "💬",
            "fired": phrase_fired,
            "point": "Suspicious advance-fee wording or identity pretexts detected" if phrase_fired else "No advance payment or transfer pretexts detected",
            "reason": phrase_reason
        },
        {
            "category": "Photo Authenticity",
            "icon": "🖼️",
            "fired": image_fired,
            "point": f"Photo fingerprint reused across {max_seen} listings" if image_fired else "Photo appears unique to this listing",
            "reason": image_reason
        }
    ]

    safety_advice = [
        "Never transfer any token fee, gate entry pass fee, or courier charge via UPI before you physically enter and tour the apartment.",
        "Always request to meet the owner, building security guard, or society manager in person at the property gate first.",
        "If the poster claims to be an Army/CISF officer who cannot meet due to transfer, treat it with extreme caution."
    ]

    return {
        "badge_label": badge_label,
        "badge_tone": badge_tone,
        "headline_summary": headline_summary,
        "scam_kill_chain_stage": kill_chain,
        "fired_count": total_fired,
        "observable_facts": [s["reason"] for s in fired_signals],
        "human_readable_points": human_points,
        "safety_advice": safety_advice,
        "signals": {
            "price": SignalDetail(fired=price_fired, reason=price_reason),
            "deposit": SignalDetail(fired=deposit_fired, reason=deposit_reason),
            "phrase": SignalDetail(fired=phrase_fired, reason=phrase_reason),
            "duplicate_image": SignalDetail(fired=image_fired, reason=image_reason)
        }
    }
