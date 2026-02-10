#!/usr/bin/env python3
"""
Backfill lightning_round segments from transcripts using Gemini.

Strategy:
- For each transcript, use LLM to detect the lightning round portion
- Insert into segments table with segment_type = 'lightning_round'
- Optionally overwrite existing lightning_round segments
"""
import os
import sys
import json
import re
from pathlib import Path
from typing import Dict, Optional, List

from dotenv import load_dotenv
from supabase import create_client
from tqdm import tqdm

try:
    import google.generativeai as genai
    GEMINI_AVAILABLE = True
except ImportError:
    GEMINI_AVAILABLE = False

load_dotenv()


def _extract_json(text: str) -> str:
    if "```json" in text:
        start = text.find("```json") + 7
        end = text.find("```", start)
        if end > start:
            return text[start:end].strip()
    elif "```" in text:
        start = text.find("```") + 3
        end = text.find("```", start)
        if end > start:
            return text[start:end].strip()
    start = text.find("{")
    end = text.rfind("}") + 1
    if start >= 0 and end > start:
        return text[start:end]
    return text


class LightningRoundSegmentBackfill:
    def __init__(self, episodes_dir: str = "episodes", model_name: str = "models/gemini-2.5-flash"):
        if not GEMINI_AVAILABLE:
            raise ImportError("google-generativeai package is required. Install with: pip install google-generativeai")

        supabase_url = os.getenv("SUPABASE_URL", "https://rhzpjvuutpjtdsbnskdy.supabase.co")
        supabase_key = os.getenv("SUPABASE_KEY", os.getenv("SUPABASE_SERVICE_ROLE_KEY", ""))
        if not supabase_key:
            raise ValueError("SUPABASE_KEY or SUPABASE_SERVICE_ROLE_KEY must be set")

        api_key = os.getenv("GEMINI_API_KEY")
        if not api_key:
            raise ValueError("GEMINI_API_KEY environment variable not set")

        self.supabase = create_client(supabase_url, supabase_key)
        self.episodes_dir = Path(episodes_dir)
        genai.configure(api_key=api_key)
        self.model = genai.GenerativeModel(model_name)

    def _get_episode_id(self, slug: str) -> Optional[str]:
        resp = self.supabase.table("episodes").select("id, slug").eq("slug", slug).execute()
        if resp.data:
            return resp.data[0]["id"]
        resp = self.supabase.table("episodes").select("id").eq("id", slug).execute()
        if resp.data:
            return resp.data[0]["id"]
        return None

    def _has_lightning_round_segment(self, episode_id: str) -> bool:
        resp = self.supabase.table("segments").select("id").eq(
            "episode_id", episode_id
        ).eq("segment_type", "lightning_round").limit(1).execute()
        return bool(resp.data)

    def _build_prompt(self, transcript_tail: str) -> str:
        return f"""Analyze the following transcript and extract ONLY the lightning round section.

Return a JSON object with this schema:
{{
  "has_lightning_round": true or false,
  "content": "verbatim lightning round transcript text or null",
  "start_time": "HH:MM:SS or null",
  "end_time": "HH:MM:SS or null"
}}

Rules:
- If no lightning round, set has_lightning_round=false and content=null
- Preserve exact wording for content (no summaries)
- If timestamps are present in the text, include the first and last timestamps you see
- Return ONLY valid JSON, no markdown

Transcript (tail section):
{transcript_tail}
"""

    def _build_prompt_safe(self, transcript_tail: str) -> str:
        return f"""Analyze the following transcript and extract ONLY the lightning round section.

Return a JSON object with this schema:
{{
  "has_lightning_round": true or false,
  "content_lines": ["line 1", "line 2", ...] or null,
  "start_time": "HH:MM:SS or null",
  "end_time": "HH:MM:SS or null"
}}

Rules:
- If no lightning round, set has_lightning_round=false and content_lines=null
- Preserve exact wording in content_lines (no summaries)
- If timestamps are present in the text, include the first and last timestamps you see
- Return ONLY valid JSON, no markdown

Transcript (tail section):
{transcript_tail}
"""

    def _extract_lightning_round(self, transcript_text: str) -> Dict:
        tail = transcript_text[-30000:]  # lightning round is usually near the end
        prompt = self._build_prompt(tail)
        try:
            response = self.model.generate_content(prompt)
            raw = response.text.strip()
            data = json.loads(_extract_json(raw))
            if isinstance(data, dict):
                return data
        except Exception:
            pass

        # Safe fallback using content_lines to avoid JSON control character issues
        try:
            response = self.model.generate_content(self._build_prompt_safe(tail))
            raw = response.text.strip()
            data = json.loads(_extract_json(raw))
            if isinstance(data, dict):
                content_lines = data.get("content_lines")
                if isinstance(content_lines, list):
                    data["content"] = "\n".join([str(l) for l in content_lines]).strip()
                return data
        except Exception:
            pass

        return {"has_lightning_round": False, "content": None}

    def _insert_segment(self, episode_id: str, content: str, start_time: Optional[str], end_time: Optional[str]):
        record = {
            "episode_id": episode_id,
            "segment_type": "lightning_round",
            "start_time": start_time,
            "end_time": end_time,
            "content": content.strip(),
            "display_order": 0,
        }
        self.supabase.table("segments").insert(record).execute()

    def _load_retry_slugs(self, retry_log: Optional[str]) -> Optional[List[str]]:
        if not retry_log:
            return None
        try:
            text = Path(retry_log).read_text(encoding="utf-8")
            slugs = re.findall(r"Error on ([^:]+):", text)
            return sorted(set(slugs)) if slugs else None
        except Exception:
            return None

    def run(self, overwrite: bool = True, limit: Optional[int] = None, retry_log: Optional[str] = None):
        retry_slugs = self._load_retry_slugs(retry_log)
        if retry_slugs:
            transcript_paths = [self.episodes_dir / slug / "transcript.md" for slug in retry_slugs]
        else:
            transcript_paths = list(self.episodes_dir.glob("*/transcript.md"))
        if limit:
            transcript_paths = transcript_paths[:limit]

        updated = 0
        skipped = 0
        errors = 0

        for path in tqdm(transcript_paths, desc="Backfilling lightning_round segments"):
            if not path.exists():
                skipped += 1
                continue
            slug = path.parent.name
            episode_id = self._get_episode_id(slug)
            if not episode_id:
                skipped += 1
                continue

            try:
                if self._has_lightning_round_segment(episode_id):
                    if not overwrite:
                        skipped += 1
                        continue
                    # delete existing lightning_round segment(s)
                    self.supabase.table("segments").delete().eq("episode_id", episode_id).eq(
                        "segment_type", "lightning_round"
                    ).execute()

                transcript_text = path.read_text(encoding="utf-8")
                extracted = self._extract_lightning_round(transcript_text)

                if not extracted.get("has_lightning_round") or not extracted.get("content"):
                    skipped += 1
                    continue

                self._insert_segment(
                    episode_id,
                    extracted.get("content", ""),
                    extracted.get("start_time"),
                    extracted.get("end_time"),
                )
                updated += 1
            except Exception as e:
                errors += 1
                print(f"Error on {slug}: {e}")

        print("\nDone")
        print(f"Updated: {updated}")
        print(f"Skipped: {skipped}")
        print(f"Errors: {errors}")


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="Backfill lightning_round segments from transcripts")
    parser.add_argument("--episodes-dir", default="episodes", help="Directory containing transcripts")
    parser.add_argument("--overwrite", action="store_true", help="Overwrite existing lightning_round segments")
    parser.add_argument("--limit", type=int, default=None, help="Limit number of episodes")
    parser.add_argument("--retry-log", type=str, default=None, help="Retry only episodes listed in the log")
    args = parser.parse_args()

    backfiller = LightningRoundSegmentBackfill(episodes_dir=args.episodes_dir)
    backfiller.run(overwrite=args.overwrite, limit=args.limit, retry_log=args.retry_log)

