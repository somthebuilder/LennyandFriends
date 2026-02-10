#!/usr/bin/env python3
"""
Transcript Structuring Pipeline

Ingests all episode transcripts, extracts structured data using LLM,
and stores in normalized database tables.
"""
import os
import sys
import json
import hashlib
import re
from pathlib import Path
from typing import Dict, List, Optional
from datetime import datetime
import traceback

# Add parent directory to path
sys.path.insert(0, str(Path(__file__).parent.parent))

from dotenv import load_dotenv
from tqdm import tqdm
from supabase import create_client, Client
from pydantic import ValidationError

from src.transcript_ingestion.llm_extractor import LLMTranscriptExtractor
from src.transcript_ingestion.schemas import (
    TranscriptExtractionSchema,
    GuestSchema,
    EpisodeSchema,
    SegmentSchema,
    LightningRoundSchema,
    SponsorMentionSchema,
    OutroLinksSchema
)

load_dotenv()


class TranscriptIngestionPipeline:
    """Main pipeline for ingesting transcripts."""
    
    def __init__(self, episodes_dir: str = "episodes", use_supabase: bool = True):
        """Initialize pipeline."""
        self.episodes_dir = Path(episodes_dir)
        self.use_supabase = use_supabase
        
        # Initialize Supabase client
        if use_supabase:
            supabase_url = os.getenv("SUPABASE_URL", "https://rhzpjvuutpjtdsbnskdy.supabase.co")
            supabase_key = os.getenv("SUPABASE_KEY", os.getenv("SUPABASE_SERVICE_ROLE_KEY", ""))
            if not supabase_key:
                raise ValueError("SUPABASE_KEY or SUPABASE_SERVICE_ROLE_KEY must be set")
            self.supabase: Client = create_client(supabase_url, supabase_key)
        else:
            self.supabase = None
        
        # Initialize LLM extractor
        self.extractor = LLMTranscriptExtractor()
        
        # Track processed transcripts (for idempotency)
        self.processed_hashes: Dict[str, str] = {}
    
    def get_transcript_hash(self, transcript_path: Path) -> str:
        """Calculate hash of transcript content for idempotency."""
        content = transcript_path.read_text(encoding='utf-8')
        return hashlib.sha256(content.encode()).hexdigest()

    def _slugify(self, value: str) -> str:
        """Generate a stable, URL-friendly ID for text values."""
        if not value:
            return "unknown"
        slug = value.strip().lower()
        slug = re.sub(r"[^a-z0-9]+", "-", slug)
        slug = re.sub(r"-+", "-", slug).strip("-")
        return slug or "unknown"

    def _normalize_segment_type(self, segment_type: str) -> str:
        """Normalize segment types to allowed values."""
        if not segment_type:
            return "interview"
        value = segment_type.strip().lower()

        # Normalize common variants
        if value in {"intro", "introduction", "opening", "cold_open"}:
            return "intro"
        if value in {"sponsor", "sponsors", "ad", "ads", "advertisement", "break"}:
            return "sponsor"
        if value in {"lightning_round", "lightning", "lightning-round", "rapid_fire"}:
            return "lightning_round"
        if value in {"outro", "closing", "wrap_up", "wrap-up"}:
            return "outro"

        # Default to interview
        return "interview"
    
    def is_already_processed(self, transcript_path: Path) -> bool:
        """Check if transcript has already been processed."""
        if not self.use_supabase:
            return False
        
        try:
            transcript_hash = self.get_transcript_hash(transcript_path)
            episode_slug = transcript_path.parent.name
            
            # Check if episode exists with this hash
            response = self.supabase.table("episodes").select("id, transcript_hash").eq("slug", episode_slug).execute()
            if not response.data:
                response = self.supabase.table("episodes").select("id, transcript_hash").eq("id", episode_slug).execute()
            
            if response.data:
                existing_hash = response.data[0].get("transcript_hash")
                if existing_hash == transcript_hash:
                    return True
            
            return False
        except Exception as e:
            print(f"Error checking if processed: {e}")
            return False
    
    def ensure_tables_exist(self):
        """Ensure all required tables exist in database."""
        if not self.use_supabase:
            return
        
        print("📋 Ensuring database tables exist...")
        
        # This would typically be done via migrations, but for now we'll just check
        # In production, use Supabase migrations
        tables = [
            "guests", "episodes", "segments", 
            "lightning_round_answers", "sponsor_mentions"
        ]
        
        for table in tables:
            try:
                # Try to select from table to check if it exists
                self.supabase.table(table).select("id").limit(1).execute()
                print(f"  ✅ Table '{table}' exists")
            except Exception as e:
                print(f"  ⚠️  Table '{table}' may not exist: {e}")
                print(f"     Please create it using a migration")
    
    def upsert_guest(self, guest_data: Dict) -> str:
        """Upsert guest and return guest_id."""
        if not self.use_supabase:
            return f"guest-{self._slugify(guest_data['full_name'])}"
        
        try:
            # Check if guest exists
            response = self.supabase.table("guests").select("id").eq("full_name", guest_data["full_name"]).execute()

            guest_id = self._slugify(guest_data["full_name"])
            if response.data:
                guest_id = response.data[0]["id"]
            
            guest_record = {
                "full_name": guest_data["full_name"],
                "current_role": guest_data.get("current_role"),
                "current_company": guest_data.get("current_company"),
                "previous_roles": json.dumps(guest_data.get("previous_roles", [])),
                "fun_facts": json.dumps(guest_data.get("fun_facts", [])),
            }
            
            if response.data:
                # Update existing
                self.supabase.table("guests").update(guest_record).eq("id", guest_id).execute()
                return guest_id
            else:
                # Insert new
                guest_record["id"] = guest_id
                result = self.supabase.table("guests").insert(guest_record).execute()
                return result.data[0]["id"]
        except Exception as e:
            print(f"Error upserting guest: {e}")
            # Fallback to slug-based ID
            return f"guest-{guest_data['full_name'].lower().replace(' ', '-')}"
    
    def insert_episode(self, episode_slug: str, guest_id: str, episode_data: Dict, transcript_hash: str) -> str:
        """Insert episode and return episode_id."""
        if not self.use_supabase:
            return f"episode-{episode_slug}"
        
        try:
            # Parse publish_date
            publish_date = None
            if episode_data.get("publish_date"):
                try:
                    publish_date = datetime.fromisoformat(episode_data["publish_date"].replace("Z", "+00:00")).date().isoformat()
                except:
                    pass
            
            # Prefer existing id if present, otherwise use slug as id
            episode_id = episode_slug
            existing = self.supabase.table("episodes").select("id").eq("slug", episode_slug).execute()
            if existing.data:
                episode_id = existing.data[0]["id"]

            episode_record = {
                "id": episode_id,
                "slug": episode_slug,
                "guest_id": guest_id,
                "title": episode_data["title"],
                "publish_date": publish_date,
                "description": episode_data.get("description"),
                "youtube_url": episode_data.get("youtube_url"),
                "video_id": episode_data.get("video_id"),
                "duration_seconds": episode_data.get("duration_seconds"),
                "view_count": episode_data.get("view_count"),
                "channel": episode_data.get("channel", "Lenny's Podcast"),
                "keywords": json.dumps(episode_data.get("keywords", [])),
                "cold_open_quote": episode_data.get("cold_open_quote"),
                "transcript_hash": transcript_hash,
            }
            
            # Upsert by slug
            response = self.supabase.table("episodes").select("id").eq("slug", episode_slug).execute()
            if not response.data:
                response = self.supabase.table("episodes").select("id").eq("id", episode_id).execute()
            
            if response.data:
                episode_id = response.data[0]["id"]
                self.supabase.table("episodes").update(episode_record).eq("id", episode_id).execute()
            else:
                result = self.supabase.table("episodes").insert(episode_record).execute()
                episode_id = result.data[0]["id"]
            
            return episode_id
        except Exception as e:
            print(f"Error inserting episode: {e}")
            traceback.print_exc()
            return f"episode-{episode_slug}"
    
    def insert_segments(self, episode_id: str, segments: List[Dict]):
        """Insert segments for an episode."""
        if not self.use_supabase or not segments:
            return
        
        try:
            # Delete existing segments
            self.supabase.table("segments").delete().eq("episode_id", episode_id).execute()
            
            # Insert new segments
            segment_records = []
            for idx, segment in enumerate(segments):
                normalized_type = self._normalize_segment_type(segment.get("segment_type", ""))
                segment_records.append({
                    "episode_id": episode_id,
                    "segment_type": normalized_type,
                    "start_time": segment.get("start_time"),
                    "end_time": segment.get("end_time"),
                    "content": segment["content"],
                    "display_order": idx,
                })
            
            if segment_records:
                self.supabase.table("segments").insert(segment_records).execute()
        except Exception as e:
            print(f"Error inserting segments: {e}")
    
    def insert_lightning_round(self, episode_id: str, lightning_round: Optional[Dict]):
        """Insert lightning round answers."""
        if not self.use_supabase or not lightning_round:
            return
        
        try:
            # Delete existing
            self.supabase.table("lightning_round_answers").delete().eq("episode_id", episode_id).execute()
            
            # Insert
            record = {
                "episode_id": episode_id,
                "books": lightning_round.get("books"),
                "entertainment": lightning_round.get("entertainment"),
                "interview_question": lightning_round.get("interview_question"),
                "products": lightning_round.get("products"),
                "productivity_tip": lightning_round.get("productivity_tip"),
                "life_motto": lightning_round.get("life_motto"),
            }
            
            self.supabase.table("lightning_round_answers").insert(record).execute()
        except Exception as e:
            print(f"Error inserting lightning round: {e}")
    
    def insert_sponsors(self, episode_id: str, sponsors: List[Dict]):
        """Insert sponsor mentions."""
        if not self.use_supabase or not sponsors:
            return
        
        try:
            # Delete existing
            self.supabase.table("sponsor_mentions").delete().eq("episode_id", episode_id).execute()
            
            # Insert
            sponsor_records = []
            for idx, sponsor in enumerate(sponsors):
                sponsor_records.append({
                    "episode_id": episode_id,
                    "sponsor_name": sponsor["sponsor_name"],
                    "ad_content": sponsor["ad_content"],
                    "cta_url": sponsor.get("cta_url"),
                    "position": sponsor["position"],
                    "display_order": idx,
                })
            
            if sponsor_records:
                self.supabase.table("sponsor_mentions").insert(sponsor_records).execute()
        except Exception as e:
            print(f"Error inserting sponsors: {e}")
    
    def process_transcript(self, transcript_path: Path, max_retries: int = 3, force: bool = False) -> bool:
        """Process a single transcript."""
        episode_slug = transcript_path.parent.name
        
        try:
            # Check if already processed
            if not force and self.is_already_processed(transcript_path):
                print(f"  ⏭️  Skipping {episode_slug} (already processed)")
                return True
            
            # Read transcript
            transcript_content = transcript_path.read_text(encoding='utf-8')
            transcript_hash = self.get_transcript_hash(transcript_path)
            
            # Extract structured data using LLM
            print(f"  🤖 Extracting data from {episode_slug}...")
            extraction_data = None
            
            for attempt in range(max_retries):
                try:
                    extraction_data = self.extractor.extract(transcript_path, transcript_content)
                    break
                except Exception as e:
                    if attempt < max_retries - 1:
                        print(f"     Retry {attempt + 1}/{max_retries}...")
                        continue
                    else:
                        raise
            
            # Validate extraction
            try:
                extraction = TranscriptExtractionSchema(**extraction_data)
            except ValidationError as e:
                print(f"  ❌ Validation error: {e}")
                return False
            
            # Upsert guest
            guest_id = self.upsert_guest(extraction_data["guest"])
            print(f"  👤 Guest: {extraction_data['guest']['full_name']}")
            
            # Insert episode
            episode_id = self.insert_episode(
                episode_slug,
                guest_id,
                extraction_data["episode"],
                transcript_hash
            )
            print(f"  📺 Episode: {extraction_data['episode']['title'][:60]}...")
            
            # Insert segments
            self.insert_segments(episode_id, extraction_data.get("segments", []))
            print(f"  📝 Segments: {len(extraction_data.get('segments', []))}")
            
            # Insert lightning round
            self.insert_lightning_round(episode_id, extraction_data.get("lightning_round"))
            if extraction_data.get("lightning_round"):
                print(f"  ⚡ Lightning round extracted")
            
            # Insert sponsors
            self.insert_sponsors(episode_id, extraction_data.get("sponsors", []))
            if extraction_data.get("sponsors"):
                print(f"  💰 Sponsors: {len(extraction_data['sponsors'])}")
            
            print(f"  ✅ Successfully processed {episode_slug}")
            return True
            
        except Exception as e:
            print(f"  ❌ Error processing {episode_slug}: {e}")
            traceback.print_exc()
            return False
    
    def run(self):
        """Run the full ingestion pipeline."""
        print("🚀 Starting Transcript Ingestion Pipeline")
        print("=" * 60)
        
        # Ensure tables exist
        if self.use_supabase:
            self.ensure_tables_exist()
        
        # Find all transcripts
        transcript_paths = list(self.episodes_dir.glob("*/transcript.md"))
        print(f"\n📁 Found {len(transcript_paths)} transcripts")
        
        if not transcript_paths:
            print("❌ No transcripts found!")
            return
        
        # Process each transcript
        success_count = 0
        error_count = 0
        
        for transcript_path in tqdm(transcript_paths, desc="Processing transcripts"):
            success = self.process_transcript(transcript_path)
            if success:
                success_count += 1
            else:
                error_count += 1
        
        print("\n" + "=" * 60)
        print(f"✅ Successfully processed: {success_count}")
        print(f"❌ Errors: {error_count}")
        print(f"📊 Total: {len(transcript_paths)}")


if __name__ == "__main__":
    import argparse
    
    parser = argparse.ArgumentParser(description="Ingest podcast transcripts")
    parser.add_argument("--episodes-dir", default="episodes", help="Directory containing episode transcripts")
    parser.add_argument("--no-supabase", action="store_true", help="Skip Supabase (for testing)")
    
    args = parser.parse_args()
    
    pipeline = TranscriptIngestionPipeline(
        episodes_dir=args.episodes_dir,
        use_supabase=not args.no_supabase
    )
    
    pipeline.run()

