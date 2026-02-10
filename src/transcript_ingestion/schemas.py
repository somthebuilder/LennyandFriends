"""
Pydantic schemas for transcript ingestion pipeline.
"""
from typing import List, Optional, Dict, Any
from pydantic import BaseModel, Field
from datetime import date


class GuestSchema(BaseModel):
    """Guest information."""
    full_name: str
    current_role: Optional[str] = None
    current_company: Optional[str] = None
    previous_roles: List[str] = Field(default_factory=list)
    fun_facts: List[str] = Field(default_factory=list)


class EpisodeSchema(BaseModel):
    """Episode metadata."""
    title: str
    publish_date: Optional[str] = None  # ISO date string
    description: Optional[str] = None
    youtube_url: Optional[str] = None
    video_id: Optional[str] = None
    duration_seconds: Optional[float] = None
    view_count: Optional[int] = None
    channel: str = "Lenny's Podcast"
    keywords: List[str] = Field(default_factory=list)
    cold_open_quote: Optional[str] = None


class SegmentSchema(BaseModel):
    """Transcript segment."""
    segment_type: str  # intro, sponsor, interview, lightning_round, outro
    start_time: Optional[str] = None  # HH:MM:SS format
    end_time: Optional[str] = None
    content: str


class LightningRoundSchema(BaseModel):
    """Lightning round answers."""
    books: Optional[str] = None
    entertainment: Optional[str] = None
    interview_question: Optional[str] = None
    products: Optional[str] = None
    productivity_tip: Optional[str] = None
    life_motto: Optional[str] = None


class SponsorMentionSchema(BaseModel):
    """Sponsor advertisement."""
    sponsor_name: str
    ad_content: str
    cta_url: Optional[str] = None
    position: str  # first_break or mid_break


class OutroLinksSchema(BaseModel):
    """Outro section links and CTAs."""
    social_links: Dict[str, str] = Field(default_factory=dict)  # platform -> url
    website: Optional[str] = None
    listener_asks: List[str] = Field(default_factory=list)


class TranscriptExtractionSchema(BaseModel):
    """Complete extraction schema for LLM."""
    guest: GuestSchema
    episode: EpisodeSchema
    segments: List[SegmentSchema] = Field(default_factory=list)
    lightning_round: Optional[LightningRoundSchema] = None
    sponsors: List[SponsorMentionSchema] = Field(default_factory=list)
    outro: Optional[OutroLinksSchema] = None

