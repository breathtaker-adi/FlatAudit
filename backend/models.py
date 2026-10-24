from typing import Optional, List, Dict, Any
from pydantic import BaseModel, Field

class ObservationCreate(BaseModel):
    url: Optional[str] = Field(None, max_length=1000)
    locality: Optional[str] = Field(None, max_length=200)
    bhk: Optional[int] = Field(None, ge=1, le=10)
    rent: Optional[int] = Field(None, ge=1000, le=5000000)
    deposit: Optional[int] = Field(None, ge=0, le=50000000)
    image_hash: Optional[str] = Field(None, min_length=16, max_length=16)

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
    median_rent: Optional[float]
    min_rent: Optional[int]
    max_rent: Optional[int]
    median_deposit: Optional[float]

class AnalyzeRequest(BaseModel):
    title: Optional[str] = ""
    description: Optional[str] = ""
    locality: Optional[str] = ""
    bhk: Optional[int] = 2
    rent: Optional[int] = None
    deposit: Optional[int] = None
    image_hashes: Optional[List[str]] = Field(default_factory=list)

class SignalDetail(BaseModel):
    fired: bool
    severity: Optional[str] = "low"
    reason: str
    details: Optional[Dict[str, Any]] = None

class AnalyzeResponse(BaseModel):
    badge_label: str  # 'Looks normal' | 'Some signals' | 'Many signals'
    badge_tone: str   # 'ok' | 'warn' | 'bad'
    scam_kill_chain_stage: str
    fired_count: int
    observable_facts: List[str]
    signals: Dict[str, SignalDetail]
