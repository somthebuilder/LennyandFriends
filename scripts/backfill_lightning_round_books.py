#!/usr/bin/env python3
"""
Backfill lightning round books using lightning_round segments and Gemini.

Strategy:
- Pull lightning_round segment content from segments table
- Use Gemini to extract book titles + authors + short summary + genre
- Upsert into lightning_round_books
- Update lightning_round_answers.books with cleaned list
"""
import os
import sys
import json
from datetime import datetime
from typing import Dict, List, Optional

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
    start = text.find("[")
    end = text.rfind("]") + 1
    if start >= 0 and end > start:
        return text[start:end]
    return text


def _dedupe_books(items: List[Dict]) -> List[Dict]:
    seen = set()
    deduped = []
    for item in items:
        title = (item.get("title") or "").strip().lower()
        author = (item.get("author") or "").strip().lower()
        key = f"{title}::{author}"
        if not title:
            continue
        if key in seen:
            continue
        seen.add(key)
        deduped.append(item)
    return deduped


class LightningRoundBooksBackfill:
    def __init__(self, model_name: str = "models/gemini-2.5-flash"):
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
        genai.configure(api_key=api_key)
        self.model = genai.GenerativeModel(model_name)

    def _fetch_lightning_round_segments(self) -> Dict[str, List[Dict]]:
        """Fetch all lightning_round segments with pagination."""
        all_rows = []
        page_size = 1000
        offset = 0
        while True:
            resp = self.supabase.table("segments").select(
                "episode_id, content, display_order"
            ).eq("segment_type", "lightning_round").range(offset, offset + page_size - 1).execute()
            if not resp.data:
                break
            all_rows.extend(resp.data)
            offset += page_size

        grouped: Dict[str, List[Dict]] = {}
        for row in all_rows:
            grouped.setdefault(row["episode_id"], []).append(row)
        for ep_id in grouped:
            grouped[ep_id] = sorted(grouped[ep_id], key=lambda r: r.get("display_order", 0))
        return grouped

    def _build_prompt(self, content: str) -> str:
        return f"""Analyze the lightning round transcript and extract ALL book recommendations.

Return a JSON array with this schema:
[
  {{
    "title": "Book title",
    "author": "Author name or null",
    "summary": "1-2 sentence summary",
    "genre": "short genre label (1-3 words)"
  }}
]

Rules:
- Use null if author is not mentioned
- Do not hallucinate or invent books
- Keep the summary short and faithful to context
- If multiple books are mentioned, include each
- Return ONLY valid JSON, no markdown

Transcript:
{content}
"""

    def _extract_books(self, content: str) -> List[Dict]:
        response = self.model.generate_content(self._build_prompt(content))
        raw = response.text.strip()
        data = json.loads(_extract_json(raw))
        if not isinstance(data, list):
            return []
        cleaned = []
        for item in data:
            if not isinstance(item, dict):
                continue
            cleaned.append({
                "title": item.get("title"),
                "author": item.get("author"),
                "summary": item.get("summary"),
                "genre": item.get("genre"),
            })
        return _dedupe_books(cleaned)

    def _episode_has_books(self, episode_id: str) -> bool:
        resp = self.supabase.table("lightning_round_books").select("id").eq("episode_id", episode_id).limit(1).execute()
        return bool(resp.data)

    def _upsert_books(self, episode_id: str, books: List[Dict], overwrite: bool):
        if not books:
            return
        if overwrite:
            self.supabase.table("lightning_round_books").delete().eq("episode_id", episode_id).execute()

        records = []
        for idx, b in enumerate(books):
            records.append({
                "episode_id": episode_id,
                "book_title": b.get("title"),
                "author": b.get("author"),
                "summary": b.get("summary"),
                "genre": b.get("genre"),
                "display_order": idx,
            })

        if records:
            self.supabase.table("lightning_round_books").insert(records).execute()

        # Update lightning_round_answers.books with cleaned list
        book_list = []
        for b in books:
            title = b.get("title")
            author = b.get("author")
            if not title:
                continue
            book_list.append(f"{title} — {author}" if author else title)
        books_text = "; ".join(book_list)

        # Upsert only books field
        existing = self.supabase.table("lightning_round_answers").select("id").eq("episode_id", episode_id).execute()
        if existing.data:
            self.supabase.table("lightning_round_answers").update({
                "books": books_text,
                "updated_at": datetime.utcnow().isoformat(),
            }).eq("episode_id", episode_id).execute()
        else:
            self.supabase.table("lightning_round_answers").insert({
                "episode_id": episode_id,
                "books": books_text,
                "updated_at": datetime.utcnow().isoformat(),
            }).execute()

    def run(self, overwrite: bool = True, limit: Optional[int] = None):
        grouped = self._fetch_lightning_round_segments()
        episode_ids = list(grouped.keys())
        if limit:
            episode_ids = episode_ids[:limit]

        updated = 0
        skipped = 0
        errors = 0

        for ep_id in tqdm(episode_ids, desc="Backfilling lightning round books"):
            try:
                if not overwrite and self._episode_has_books(ep_id):
                    skipped += 1
                    continue

                content = "\n\n".join([r.get("content", "") for r in grouped.get(ep_id, [])]).strip()
                if not content:
                    skipped += 1
                    continue

                books = self._extract_books(content)
                if not books:
                    skipped += 1
                    continue

                self._upsert_books(ep_id, books, overwrite=overwrite)
                updated += 1
            except Exception as e:
                errors += 1
                print(f"Error on {ep_id}: {e}")

        print("\nDone")
        print(f"Updated: {updated}")
        print(f"Skipped: {skipped}")
        print(f"Errors: {errors}")


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="Backfill lightning round books from segments")
    parser.add_argument("--overwrite", action="store_true", help="Overwrite existing lightning_round_books")
    parser.add_argument("--limit", type=int, default=None, help="Limit number of episodes")
    args = parser.parse_args()

    backfiller = LightningRoundBooksBackfill()
    backfiller.run(overwrite=args.overwrite, limit=args.limit)

