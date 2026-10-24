from typing import Optional, List, Dict, Any
from pydantic import BaseModel, Field

class ObservationCreate(BaseModel):
    url: Optional[str] = Field(None, max_length=1000)
    portal: Optional[str] = Field(None, max_length=50)
    listing_key: Optional[str] = Field(None, max_length=100)
    locality: Optional[str] = Field(None, max_length=200)
    bhk: Optional[int] = Field(None, ge=1, le=10)
    rent: Optional[int] = Field(None, ge=1000, le=5000000)
    deposit: Optional[int] = Field(None, ge=0, le=50000000)
    area_sqft: Optional[int] = Field(None, ge=50, le=50000)
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
    rent: Optional[int] = None
    deposit: Optional[int] = None
    area_sqft: Optional[int] = None
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
