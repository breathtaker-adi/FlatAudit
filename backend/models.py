from typing import Optional, List, Dict, Any
from pydantic import BaseModel, Field

class ObservationCreate(BaseModel):
    url: Optional[str] = Field(None, max_length=1000)
    portal: Optional[str] = Field(None, max_length=50)
    listing_key: Optional[str] = Field(None, max_length=100)
    locality: Optional[str] = Field(None, max_length=200)
    bhk: Optional[int] = Field(None, ge=1, le=10)
    listing_type: Optional[str] = Field("rent", max_length=20)
    rent: Optional[int] = Field(None, ge=1000, le=5000000)
    price: Optional[int] = Field(None, ge=100000, le=1000000000)
    price_per_sqft: Optional[int] = Field(None, ge=500, le=500000)
    deposit: Optional[int] = Field(None, ge=0, le=50000000)
    area_sqft: Optional[int] = Field(None, ge=50, le=50000)
    area_type: Optional[str] = Field("unknown", max_length=50)
    possession_status: Optional[str] = Field("unknown", max_length=50)
    rera_id: Optional[str] = Field(None, max_length=100)
    floor: Optional[int] = Field(None, ge=-2, le=200)
    image_hash: Optional[str] = Field(None, min_length=16, max_length=16)
    geohash: Optional[str] = Field(None, max_length=20)

class ObservationResponse(BaseModel):
    status: str
    id: int
    seen_count: int

class SeenResponse(BaseModel):
    hash: str
    seen_count: int
    matched_listings: int
    threshold: int

class LocalityStatsResponse(BaseModel):
    locality: str
    bhk: int
    count: int
    sample_size: int
    confidence: str
    median_rent: Optional[float]
    min_rent: Optional[int]
    max_rent: Optional[int]
    median_deposit: Optional[float]

class CrossPortalMatchItem(BaseModel):
    portal: str
    listing_key: Optional[str]
    rent: int
    deposit: Optional[int]
    area_sqft: Optional[int]
    floor: Optional[int]
    rent_delta: int
    confidence: str
    verdict: str
    reasons: List[str]

class CrossPortalMatchResponse(BaseModel):
    target_portal: Optional[str]
    match_count: int
    lowest_rent: Optional[int]
    matches: List[CrossPortalMatchItem]

class AnalyzeRequest(BaseModel):
    title: Optional[str] = ""
    description: Optional[str] = ""
    locality: Optional[str] = ""
    bhk: Optional[int] = 2
    listing_type: Optional[str] = "rent"
    rent: Optional[int] = None
    price: Optional[int] = None
    price_per_sqft: Optional[int] = None
    deposit: Optional[int] = None
    area_sqft: Optional[int] = None
    area_type: Optional[str] = "unknown"
    possession_status: Optional[str] = "unknown"
    rera_id: Optional[str] = None
    floor: Optional[int] = None
    portal: Optional[str] = None
    listing_key: Optional[str] = None
    image_hashes: Optional[List[str]] = Field(default_factory=list)

class SignalDetail(BaseModel):
    fired: bool
    severity: Optional[str] = "low"
    reason: str
    details: Optional[Dict[str, Any]] = None

class HumanReadablePoint(BaseModel):
    category: str
    icon: str
    fired: bool
    point: str
    reason: str

class AnalyzeResponse(BaseModel):
    badge_label: str  # 'Looks normal' | 'Some signals' | 'Many signals'
    badge_tone: str   # 'ok' | 'warn' | 'bad'
    headline_summary: Optional[str] = ""
    scam_kill_chain_stage: str
    fired_count: int
    observable_facts: List[str]
    human_readable_points: Optional[List[HumanReadablePoint]] = Field(default_factory=list)
    safety_advice: Optional[List[str]] = Field(default_factory=list)
    signals: Dict[str, SignalDetail]
    cross_portal_matches: Optional[List[CrossPortalMatchItem]] = Field(default_factory=list)

class TelemetryObservationCreate(BaseModel):
    client_id: str = Field(..., max_length=100)
    portal: str = Field(..., max_length=50)
    city: str = Field(..., max_length=50)
    locality: Optional[str] = Field(None, max_length=100)
    listing_fingerprint: str = Field(..., min_length=16, max_length=128)
    extracted_features: Dict[str, Any]
    computed_signals: Optional[Dict[str, Any]] = None
    schema_version: str = "1.1"
    extension_version: str = "0.4.2"
    timestamp: Optional[str] = None

class TelemetryObservationResponse(BaseModel):
    status: str
    telemetry_id: int
    client_id: str

class TelemetryFeedbackCreate(BaseModel):
    client_id: str = Field(..., max_length=100)
    listing_fingerprint: str = Field(..., min_length=16, max_length=128)
    verdict: str = Field(..., max_length=50)  # "false_positive", "missed_scam", "accurate"
    reason_category: Optional[str] = Field(None, max_length=100)
    user_note: Optional[str] = Field(None, max_length=1000)
    extracted_features_snapshot: Optional[Dict[str, Any]] = None
    timestamp: Optional[str] = None

class TelemetryFeedbackResponse(BaseModel):
    status: str
    feedback_id: int
    alert_dispatched: bool

