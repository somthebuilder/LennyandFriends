#!/usr/bin/env python3
"""Generate long-form concept articles by invoking Supabase Edge Function one concept at a time."""

from __future__ import annotations

import argparse
import json
import os
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from typing import Any


def request_json(url: str, method: str, payload: dict[str, Any] | None, headers: dict[str, str]) -> Any:
    data = None if payload is None else json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(url, data=data, method=method, headers=headers)
    with urllib.request.urlopen(req, timeout=240) as resp:
        body = resp.read().decode("utf-8")
    return json.loads(body) if body else None


def main() -> int:
    parser = argparse.ArgumentParser(description="Batch-generate long-form concept pages.")
    parser.add_argument("--podcast-slug", default="lennys-podcast")
    parser.add_argument("--limit", type=int, default=6)
    parser.add_argument("--min-existing-words", type=int, default=850)
    parser.add_argument("--target-words", type=int, default=1200)
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--sleep-seconds", type=float, default=1.5)
    parser.add_argument("--force", action="store_true")
    args = parser.parse_args()

    supabase_url = os.getenv("SUPABASE_URL")
    supabase_key = os.getenv("SUPABASE_ANON_KEY") or os.getenv("SUPABASE_PUBLISHABLE_KEY")
    if not supabase_url or not supabase_key:
        print("Missing SUPABASE_URL and/or SUPABASE_ANON_KEY (or SUPABASE_PUBLISHABLE_KEY).", file=sys.stderr)
        return 1

    rest_headers = {
        "apikey": supabase_key,
        "Authorization": f"Bearer {supabase_key}",
        "Content-Type": "application/json",
    }

    podcast_query = urllib.parse.urlencode({"slug": f"eq.{args.podcast_slug}", "select": "id"})
    podcast_url = f"{supabase_url}/rest/v1/podcasts?{podcast_query}"
    podcasts = request_json(podcast_url, "GET", None, rest_headers) or []
    if not podcasts:
        print(f"Podcast not found: {args.podcast_slug}", file=sys.stderr)
        return 1
    podcast_id = podcasts[0]["id"]

    concept_query = urllib.parse.urlencode(
        {
            "podcast_id": f"eq.{podcast_id}",
            "select": "id,title,body",
            "order": "updated_at.asc",
            "limit": str(max(1, args.limit * 3)),
        }
    )
    concepts_url = f"{supabase_url}/rest/v1/concepts?{concept_query}"
    concepts = request_json(concepts_url, "GET", None, rest_headers) or []
    if not concepts:
        print("No concepts found.")
        return 0

    selected: list[dict[str, Any]] = []
    for concept in concepts:
        words = len((concept.get("body") or "").split())
        if args.force or words < args.min_existing_words:
            selected.append(concept)
        if len(selected) >= args.limit:
            break

    if not selected:
        print("No concepts matched filter; nothing to generate.")
        return 0

    fn_url = f"{supabase_url}/functions/v1/generate_concept_article"
    fn_headers = {
        "apikey": supabase_key,
        "Authorization": f"Bearer {supabase_key}",
        "Content-Type": "application/json",
    }

    ok = 0
    failed = 0
    for index, concept in enumerate(selected, start=1):
        payload = {
            "podcastSlug": args.podcast_slug,
            "conceptId": concept["id"],
            "targetWords": args.target_words,
            "minWords": args.min_existing_words,
            "dryRun": args.dry_run,
            "force": args.force,
        }
        print(f"[{index}/{len(selected)}] {concept['title']}")
        try:
            result = request_json(fn_url, "POST", payload, fn_headers)
            print(json.dumps(result, indent=2))
            ok += 1
        except urllib.error.HTTPError as err:
            body = err.read().decode("utf-8", errors="ignore")
            print(f"HTTP {err.code}: {body}", file=sys.stderr)
            failed += 1
        except Exception as err:  # noqa: BLE001
            print(f"ERROR: {err}", file=sys.stderr)
            failed += 1
        time.sleep(max(0.0, args.sleep_seconds))

    print(f"Done. success={ok} failed={failed}")
    return 0 if failed == 0 else 2


if __name__ == "__main__":
    raise SystemExit(main())

