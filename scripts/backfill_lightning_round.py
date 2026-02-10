#!/usr/bin/env python3
"""
Backfill lightning round answers using Gemini (LLM).

This script scans transcripts and extracts lightning round answers
into the lightning_round_answers table. It is safe to re-run.
"""
import os
import json
from pathlib import Path
from datetime import datetime
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


class LightningRoundBackfiller:
    """Backfill lightning round answers using LLM extraction."""

    def __init__(self, episodes_dir: str = "episodes", model_name: str = "models/gemini-2.5-flash"):
        if not GEMINI_AVAILABLE:
            raise ImportError("google-generativeai package is required. Install with: pip install google-generativeai")

        supabase_url = os.getenv("SUPABASE_URL", "https://rhzpjvuutpjtdsbnskdy.supabase.co")
        supabase_key = os.getenv("SUPABASE_KEY", os.getenv("SUPABASE_SERVICE_ROLE_KEY", ""))
        if not supabase_key:
            raise ValueError("SUPABASE_KEY or SUPABASE_SERVICE_ROLE_KEY must be set")

        self.supabase = create_client(supabase_url, supabase_key)
        self.episodes_dir = Path(episodes_dir)

        api_key = os.getenv("GEMINI_API_KEY")
        if not api_key:
            raise ValueError("GEMINI_API_KEY environment variable not set")

        genai.configure(api_key=api_key)
        self.model = genai.GenerativeModel(model_name)

    def _extract_json(self, text: str) -> str:
        """Extract JSON from LLM response."""
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

    def _build_prompt(self, transcript_tail: str, only_books: bool = False) -> str:
        """Prompt for lightning round extraction."""
        if only_books:
            return f"""Analyze the following transcript and extract ONLY the lightning round book recommendations.

Return a JSON object with exactly this key:
{{
  "books": string or null
}}

Rules:
- Use null if the answer is not present
- Do not hallucinate
- Preserve exact wording from the transcript when possible
- Return ONLY valid JSON, no markdown

Transcript (tail section):
{transcript_tail}
"""

        return f"""Analyze the following transcript and extract ONLY the lightning round answers.

The lightning round has 5 fixed questions:
1) books
2) entertainment
3) interview_question
4) products
5) productivity_tip
6) life_motto (favorite life motto)

Return a JSON object with exactly these keys:
{{
  "books": string or null,
  "entertainment": string or null,
  "interview_question": string or null,
  "products": string or null,
  "productivity_tip": string or null,
  "life_motto": string or null
}}

Rules:
- Use null if the answer is not present
- Do not hallucinate
- Preserve exact wording from the transcript when possible
- Return ONLY valid JSON, no markdown

Transcript (tail section):
{transcript_tail}
"""

    def _extract_lightning_round(self, transcript_text: str, max_retries: int = 3, only_books: bool = False) -> Dict:
        """Extract lightning round answers using LLM."""
        tail = transcript_text[-20000:]  # lightning round is usually near the end
        prompt = self._build_prompt(tail, only_books=only_books)

        for attempt in range(max_retries):
            try:
                response = self.model.generate_content(prompt)
                raw = response.text.strip()
                json_str = self._extract_json(raw)
                data = json.loads(json_str)
                if only_books:
                    return {"books": data.get("books")}

                return {
                    "books": data.get("books"),
                    "entertainment": data.get("entertainment"),
                    "interview_question": data.get("interview_question"),
                    "products": data.get("products"),
                    "productivity_tip": data.get("productivity_tip"),
                    "life_motto": data.get("life_motto"),
                }
            except Exception as e:
                if attempt == max_retries - 1:
                    raise
        return {}

    def _has_values(self, lr: Dict) -> bool:
        """Check if lightning round has any meaningful values."""
        return any(v is not None and str(v).strip() for v in lr.values())

    def _get_episode_id(self, slug: str) -> Optional[str]:
        """Find episode_id by slug or id."""
        resp = self.supabase.table("episodes").select("id, slug").eq("slug", slug).execute()
        if resp.data:
            return resp.data[0]["id"]

        resp = self.supabase.table("episodes").select("id").eq("id", slug).execute()
        if resp.data:
            return resp.data[0]["id"]
        return None

    def _already_has_lightning_round(self, episode_id: str) -> bool:
        """Check if lightning round answers already exist."""
        resp = self.supabase.table("lightning_round_answers").select(
            "books, entertainment, interview_question, products, productivity_tip, life_motto"
        ).eq("episode_id", episode_id).execute()
        if not resp.data:
            return False
        row = resp.data[0]
        return any(row.get(k) for k in ["books", "entertainment", "interview_question", "products", "productivity_tip", "life_motto"])

    def run(self, only_missing: bool = True, only_books: bool = False):
        """Run backfill across all transcripts."""
        transcript_paths = list(self.episodes_dir.glob("*/transcript.md"))
        print(f"Found {len(transcript_paths)} transcripts")

        updated = 0
        skipped = 0
        errors = 0

        for path in tqdm(transcript_paths, desc="Backfilling lightning round"):
            slug = path.parent.name
            episode_id = self._get_episode_id(slug)
            if not episode_id:
                skipped += 1
                continue

            if only_missing and not only_books and self._already_has_lightning_round(episode_id):
                skipped += 1
                continue

            try:
                transcript_text = path.read_text(encoding="utf-8")
                lr = self._extract_lightning_round(transcript_text, only_books=only_books)

                if not self._has_values(lr):
                    skipped += 1
                    continue

                record = {
                    "episode_id": episode_id,
                    "books": lr.get("books"),
                    "entertainment": lr.get("entertainment") if not only_books else None,
                    "interview_question": lr.get("interview_question") if not only_books else None,
                    "products": lr.get("products") if not only_books else None,
                    "productivity_tip": lr.get("productivity_tip") if not only_books else None,
                    "life_motto": lr.get("life_motto") if not only_books else None,
                    "updated_at": datetime.utcnow().isoformat(),
                }

                self.supabase.table("lightning_round_answers").upsert(
                    record, on_conflict="episode_id"
                ).execute()

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

    parser = argparse.ArgumentParser(description="Backfill lightning round answers using LLM")
    parser.add_argument("--episodes-dir", default="episodes", help="Directory containing transcripts")
    parser.add_argument("--all", action="store_true", help="Process all episodes, not just missing")
    parser.add_argument("--only-books", action="store_true", help="Only extract books from lightning round")
    args = parser.parse_args()

    backfiller = LightningRoundBackfiller(episodes_dir=args.episodes_dir)
    backfiller.run(only_missing=not args.all, only_books=args.only_books)

