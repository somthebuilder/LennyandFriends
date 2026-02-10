#!/usr/bin/env python3
"""
Backfill missing transcript-derived data using Gemini.

This script scans populated tables for missing data and re-extracts
from transcripts using the LLM, then fills in gaps.
"""
import os
import sys
import json
from pathlib import Path
from typing import Dict, List, Set, Optional
from datetime import datetime

from dotenv import load_dotenv
from supabase import create_client
from tqdm import tqdm

sys.path.insert(0, str(Path(__file__).parent.parent))
from src.transcript_ingestion.llm_extractor import LLMTranscriptExtractor

load_dotenv()


def _is_missing(value) -> bool:
    if value is None:
        return True
    if isinstance(value, str) and value.strip() == "":
        return True
    if isinstance(value, list) and len(value) == 0:
        return True
    if isinstance(value, dict) and len(value) == 0:
        return True
    return False


def normalize_segment_type(raw: str) -> str:
    """Normalize segment types to allowed values."""
    if not raw:
        return "interview"
    s = raw.strip().lower()
    s = s.replace("-", " ").replace("_", " ")
    if "sponsor" in s or "ad" in s or "advert" in s:
        return "sponsor"
    if "intro" in s:
        return "intro"
    if "outro" in s or "closing" in s:
        return "outro"
    if "lightning" in s:
        return "lightning_round"
    return "interview"


class MissingDataBackfiller:
    def __init__(self, episodes_dir: str = "episodes"):
        supabase_url = os.getenv("SUPABASE_URL", "https://rhzpjvuutpjtdsbnskdy.supabase.co")
        supabase_key = os.getenv("SUPABASE_KEY", os.getenv("SUPABASE_SERVICE_ROLE_KEY", ""))
        if not supabase_key:
            raise ValueError("SUPABASE_KEY or SUPABASE_SERVICE_ROLE_KEY must be set")

        self.supabase = create_client(supabase_url, supabase_key)
        self.episodes_dir = Path(episodes_dir)
        self.extractor = LLMTranscriptExtractor()

    def _get_episode_id(self, slug: str) -> Optional[str]:
        resp = self.supabase.table("episodes").select("id, slug").eq("slug", slug).execute()
        if resp.data:
            return resp.data[0]["id"]
        resp = self.supabase.table("episodes").select("id").eq("id", slug).execute()
        if resp.data:
            return resp.data[0]["id"]
        return None

    def _episodes_missing_data(self) -> Set[str]:
        missing = set()

        # Episodes missing key metadata
        resp = self.supabase.table("episodes").select(
            "id, slug, description, youtube_url, publish_date, cold_open_quote"
        ).execute()
        for row in resp.data or []:
            if any(_is_missing(row.get(k)) for k in ["description", "youtube_url", "publish_date", "cold_open_quote"]):
                missing.add(row.get("slug") or row.get("id"))

        # Episodes missing segments
        resp = self.supabase.table("episodes").select("id, slug").execute()
        episodes = resp.data or []
        for row in episodes:
            ep_id = row["id"]
            segs = self.supabase.table("segments").select("id").eq("episode_id", ep_id).limit(1).execute()
            if not segs.data:
                missing.add(row.get("slug") or row.get("id"))

        # Episodes missing lightning round
        for row in episodes:
            ep_id = row["id"]
            lr = self.supabase.table("lightning_round_answers").select("id").eq("episode_id", ep_id).limit(1).execute()
            if not lr.data:
                missing.add(row.get("slug") or row.get("id"))

        # Episodes missing sponsors
        for row in episodes:
            ep_id = row["id"]
            sm = self.supabase.table("sponsor_mentions").select("id").eq("episode_id", ep_id).limit(1).execute()
            if not sm.data:
                missing.add(row.get("slug") or row.get("id"))

        return missing

    def _guest_missing_role_company(self, guest_id: str) -> bool:
        resp = self.supabase.table("guests").select("current_company, current_role").eq("id", guest_id).execute()
        if not resp.data:
            return True
        row = resp.data[0]
        return _is_missing(row.get("current_company")) or _is_missing(row.get("current_role"))

    def _update_episode_fields(self, episode_id: str, data: Dict):
        if not data:
            return
        self.supabase.table("episodes").update(data).eq("id", episode_id).execute()

    def _upsert_guest(self, guest_data: Dict):
        guest_id = guest_data.get("full_name", "").strip().lower().replace(" ", "-")
        record = {
            "id": guest_id,
            "full_name": guest_data.get("full_name"),
            "current_role": guest_data.get("current_role"),
            "current_company": guest_data.get("current_company"),
            "previous_roles": json.dumps(guest_data.get("previous_roles", [])),
            "fun_facts": json.dumps(guest_data.get("fun_facts", [])),
        }
        self.supabase.table("guests").upsert(record, on_conflict="id").execute()
        return guest_id

    def _insert_segments_if_missing(self, episode_id: str, segments: List[Dict]):
        existing = self.supabase.table("segments").select("id").eq("episode_id", episode_id).limit(1).execute()
        if existing.data:
            return
        records = []
        for idx, seg in enumerate(segments or []):
            records.append({
                "episode_id": episode_id,
                "segment_type": normalize_segment_type(seg.get("segment_type")),
                "start_time": seg.get("start_time"),
                "end_time": seg.get("end_time"),
                "content": seg.get("content") or "",
                "display_order": idx,
            })
        if records:
            self.supabase.table("segments").insert(records).execute()

    def _upsert_lightning_round(self, episode_id: str, lr: Dict):
        if not lr:
            return
        record = {
            "episode_id": episode_id,
            "books": lr.get("books"),
            "entertainment": lr.get("entertainment"),
            "interview_question": lr.get("interview_question"),
            "products": lr.get("products"),
            "productivity_tip": lr.get("productivity_tip"),
            "life_motto": lr.get("life_motto"),
            "updated_at": datetime.utcnow().isoformat(),
        }
        # Only upsert if any value is present
        if any(not _is_missing(v) for v in record.values()):
            self.supabase.table("lightning_round_answers").upsert(record, on_conflict="episode_id").execute()

    def _insert_sponsors_if_missing(self, episode_id: str, sponsors: List[Dict]):
        existing = self.supabase.table("sponsor_mentions").select("id").eq("episode_id", episode_id).limit(1).execute()
        if existing.data:
            return
        records = []
        for idx, s in enumerate(sponsors or []):
            records.append({
                "episode_id": episode_id,
                "sponsor_name": s.get("sponsor_name"),
                "ad_content": s.get("ad_content"),
                "cta_url": s.get("cta_url"),
                "position": s.get("position"),
                "display_order": idx,
            })
        if records:
            self.supabase.table("sponsor_mentions").insert(records).execute()

    def run(self):
        missing_slugs = self._episodes_missing_data()
        print(f"Found {len(missing_slugs)} episodes with missing data")

        updated = 0
        errors = 0

        for slug in tqdm(sorted(missing_slugs), desc="Backfilling missing data"):
            transcript_path = self.episodes_dir / slug / "transcript.md"
            if not transcript_path.exists():
                continue

            try:
                transcript_text = transcript_path.read_text(encoding="utf-8")
                extraction = self.extractor.extract(transcript_path, transcript_text)

                episode_id = self._get_episode_id(slug)
                if not episode_id:
                    continue

                # Upsert guest if missing role/company
                if extraction.get("guest"):
                    guest_id = self._upsert_guest(extraction["guest"])
                else:
                    guest_id = None

                # Update episode fields if missing
                episode_updates = {}
                if extraction.get("episode"):
                    ep = extraction["episode"]
                    if not _is_missing(ep.get("description")):
                        episode_updates["description"] = ep.get("description")
                    if not _is_missing(ep.get("youtube_url")):
                        episode_updates["youtube_url"] = ep.get("youtube_url")
                    if not _is_missing(ep.get("publish_date")):
                        episode_updates["publish_date"] = ep.get("publish_date")
                    if not _is_missing(ep.get("cold_open_quote")):
                        episode_updates["cold_open_quote"] = ep.get("cold_open_quote")
                if episode_updates:
                    self._update_episode_fields(episode_id, episode_updates)

                # Insert missing segments/sponsors/lightning round
                self._insert_segments_if_missing(episode_id, extraction.get("segments", []))
                self._insert_sponsors_if_missing(episode_id, extraction.get("sponsors", []))
                self._upsert_lightning_round(episode_id, extraction.get("lightning_round") or {})

                updated += 1
            except Exception as e:
                errors += 1
                print(f"Error on {slug}: {e}")

        print("\nDone")
        print(f"Updated: {updated}")
        print(f"Errors: {errors}")


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="Backfill missing transcript-derived data")
    parser.add_argument("--episodes-dir", default="episodes", help="Directory containing transcripts")
    args = parser.parse_args()

    backfiller = MissingDataBackfiller(episodes_dir=args.episodes_dir)
    backfiller.run()
#!/usr/bin/env python3
"""
Backfill missing episode data using LLM extraction.

Scans populated tables for missing data and re-runs extraction
for those episodes (segments, lightning round, sponsors, metadata).
"""
import os
from pathlib import Path
from typing import Dict, List, Set, Any, Optional

from dotenv import load_dotenv
from supabase import create_client
from tqdm import tqdm

from scripts.ingest_transcripts import TranscriptIngestionPipeline

load_dotenv()


class MissingDataBackfiller:
    """Scan tables and backfill missing data."""

    def __init__(self, episodes_dir: str = "episodes"):
        supabase_url = os.getenv("SUPABASE_URL", "https://rhzpjvuutpjtdsbnskdy.supabase.co")
        supabase_key = os.getenv("SUPABASE_KEY", os.getenv("SUPABASE_SERVICE_ROLE_KEY", ""))
        if not supabase_key:
            raise ValueError("SUPABASE_KEY or SUPABASE_SERVICE_ROLE_KEY must be set")

        self.supabase = create_client(supabase_url, supabase_key)
        self.episodes_dir = Path(episodes_dir)
        self.pipeline = TranscriptIngestionPipeline(episodes_dir=episodes_dir, use_supabase=True)

    def _fetch_all(self, table: str, columns: str) -> List[Dict[str, Any]]:
        """Fetch all rows from a table using pagination."""
        results = []
        page_size = 1000
        offset = 0
        while True:
            response = self.supabase.table(table).select(columns).range(offset, offset + page_size - 1).execute()
            data = response.data or []
            if not data:
                break
            results.extend(data)
            offset += page_size
        return results

    def _has_lightning_values(self, row: Dict[str, Any]) -> bool:
        return any(
            row.get(k)
            for k in ["books", "entertainment", "interview_question", "products", "productivity_tip", "life_motto"]
        )

    def scan_missing(self) -> Dict[str, List[str]]:
        """Scan DB and return lists of episode slugs with missing data."""
        episodes = self._fetch_all(
            "episodes",
            "id,slug,description,youtube_url,video_id,duration_seconds,view_count,keywords,cold_open_quote",
        )
        segments = self._fetch_all("segments", "episode_id")
        sponsors = self._fetch_all("sponsor_mentions", "episode_id")
        lightning = self._fetch_all(
            "lightning_round_answers",
            "episode_id,books,entertainment,interview_question,products,productivity_tip,life_motto",
        )

        # Build maps
        episode_by_id = {e["id"]: e for e in episodes}
        segment_counts: Dict[str, int] = {}
        sponsor_counts: Dict[str, int] = {}
        lightning_by_episode: Dict[str, Dict[str, Any]] = {}

        for s in segments:
            segment_counts[s["episode_id"]] = segment_counts.get(s["episode_id"], 0) + 1
        for s in sponsors:
            sponsor_counts[s["episode_id"]] = sponsor_counts.get(s["episode_id"], 0) + 1
        for l in lightning:
            lightning_by_episode[l["episode_id"]] = l

        missing_segments = []
        missing_sponsors = []
        missing_lightning = []
        missing_metadata = []

        for ep_id, ep in episode_by_id.items():
            slug = ep.get("slug") or ep_id

            if segment_counts.get(ep_id, 0) == 0:
                missing_segments.append(slug)

            if sponsor_counts.get(ep_id, 0) == 0:
                missing_sponsors.append(slug)

            lr = lightning_by_episode.get(ep_id)
            if not lr or not self._has_lightning_values(lr):
                missing_lightning.append(slug)

            keywords = ep.get("keywords")
            keywords_empty = False
            if keywords is None:
                keywords_empty = True
            elif isinstance(keywords, list) and len(keywords) == 0:
                keywords_empty = True

            if (
                ep.get("description") is None
                or ep.get("youtube_url") is None
                or ep.get("video_id") is None
                or ep.get("duration_seconds") is None
                or ep.get("view_count") is None
                or ep.get("cold_open_quote") is None
                or keywords_empty
            ):
                missing_metadata.append(slug)

        return {
            "missing_segments": missing_segments,
            "missing_sponsors": missing_sponsors,
            "missing_lightning": missing_lightning,
            "missing_metadata": missing_metadata,
        }

    def backfill(self, limit: Optional[int] = None) -> Dict[str, List[str]]:
        """Backfill missing data by re-running extraction."""
        missing = self.scan_missing()

        # Combine all slugs to reprocess
        slugs: Set[str] = set()
        for items in missing.values():
            slugs.update(items)

        slugs_list = sorted(slugs)
        if limit:
            slugs_list = slugs_list[:limit]

        if not slugs_list:
            print("✅ No missing data found.")
            return missing

        print(f"🔁 Reprocessing {len(slugs_list)} episodes with missing data...")

        processed = 0
        skipped = 0

        for slug in tqdm(slugs_list, desc="Backfilling episodes"):
            transcript_path = self.episodes_dir / slug / "transcript.md"
            if not transcript_path.exists():
                skipped += 1
                continue
            self.pipeline.process_transcript(transcript_path, force=True)
            processed += 1

        print(f"✅ Backfill complete. Processed: {processed}, Skipped: {skipped}")
        return missing


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="Backfill missing transcript data")
    parser.add_argument("--episodes-dir", default="episodes", help="Directory containing transcripts")
    parser.add_argument("--limit", type=int, help="Limit number of episodes to reprocess")
    args = parser.parse_args()

    backfiller = MissingDataBackfiller(episodes_dir=args.episodes_dir)
    backfiller.backfill(limit=args.limit)

