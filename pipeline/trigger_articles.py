#!/usr/bin/env python3
"""
Trigger article generation for all concepts via the generate_concept_article edge function.
Processes concepts in parallel (with rate limiting) and tracks progress.
"""

import json
import os
import sys
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

import requests

SUPABASE_URL = "https://rhzpjvuutpjtdsbnskdy.supabase.co"
ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJoenBqdnV1dHBqdGRzYm5za2R5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAxNzQxMjUsImV4cCI6MjA4NTc1MDEyNX0.1PjJnJr33fJ41eavn5e6dSVUDwR0-2D5_d0SqyhndqM"
EDGE_FN_URL = f"{SUPABASE_URL}/functions/v1/generate_concept_article"

# Rate limiting: Gemini 2.0 Flash allows ~15 RPM on free tier, much higher on paid
# Each concept = ~4 Gemini calls (3 batches + 1 summary)
# Conservative: 2 concepts at a time with 8s delay between = ~30 calls/min
CONCURRENCY = 2
DELAY_BETWEEN_BATCHES = 8  # seconds between launching batches

CACHE_DIR = Path(__file__).parent / ".cache"
PROGRESS_FILE = CACHE_DIR / "article_progress.json"


def load_progress():
    """Load previously completed slugs to allow resume."""
    if PROGRESS_FILE.exists():
        with open(PROGRESS_FILE) as f:
            return json.load(f)
    return {"completed": [], "failed": [], "skipped": []}


def save_progress(progress):
    with open(PROGRESS_FILE, "w") as f:
        json.dump(progress, f, indent=2)


def generate_article(slug, force=False):
    """Call the edge function for a single concept."""
    try:
        resp = requests.post(
            EDGE_FN_URL,
            headers={
                "Authorization": f"Bearer {ANON_KEY}",
                "Content-Type": "application/json",
                "apikey": ANON_KEY,
            },
            json={
                "conceptSlug": slug,
                "podcastSlug": "lennys-podcast",
                "force": force,
                "geminiOnly": True,
                "knnChunks": 12,
                "minWords": 800,
            },
            timeout=120,
        )

        if resp.status_code == 200:
            data = resp.json()
            if data.get("skipped"):
                return {"status": "skipped", "slug": slug, "reason": data.get("reason", "")}
            return {
                "status": "ok",
                "slug": slug,
                "words": data.get("totalWords", 0),
                "model": data.get("primaryModel", "unknown"),
                "storedRefs": data.get("storedRefs", 0),
                "knnRefs": data.get("knnRefs", 0),
            }
        else:
            return {"status": "error", "slug": slug, "code": resp.status_code, "msg": resp.text[:300]}

    except requests.Timeout:
        return {"status": "timeout", "slug": slug}
    except Exception as e:
        return {"status": "error", "slug": slug, "msg": str(e)[:300]}


def main():
    force = "--force" in sys.argv

    # Get all concept slugs
    print("Fetching concept slugs from Supabase...")
    resp = requests.get(
        f"{SUPABASE_URL}/rest/v1/concepts",
        headers={
            "apikey": ANON_KEY,
            "Authorization": f"Bearer {ANON_KEY}",
        },
        params={
            "select": "slug,title",
            "podcast_id": "eq.afe7247b-50e4-4e8b-9b0d-7f02ed206090",
            "order": "guest_count.desc",
        },
    )

    if resp.status_code != 200:
        print(f"ERROR fetching concepts: {resp.status_code} - {resp.text[:300]}")
        sys.exit(1)

    concepts = resp.json()
    print(f"Found {len(concepts)} concepts to process\n")

    # Load progress for resume capability
    progress = load_progress()
    already_done = set(progress["completed"] + progress["skipped"])

    remaining = [c for c in concepts if c["slug"] not in already_done]
    if not remaining:
        print("All concepts already processed! Use --force to regenerate.")
        return

    print(f"Already done: {len(already_done)}, Remaining: {len(remaining)}")
    print(f"Concurrency: {CONCURRENCY}, Delay: {DELAY_BETWEEN_BATCHES}s")
    print(f"Estimated time: ~{len(remaining) * (DELAY_BETWEEN_BATCHES / CONCURRENCY + 15) / 60:.0f} minutes")
    print("=" * 60)

    completed = 0
    failed = 0
    total_words = 0
    start_time = time.time()

    # Process in batches of CONCURRENCY
    for i in range(0, len(remaining), CONCURRENCY):
        batch = remaining[i:i + CONCURRENCY]

        with ThreadPoolExecutor(max_workers=CONCURRENCY) as executor:
            futures = {executor.submit(generate_article, c["slug"], force): c for c in batch}

            for future in as_completed(futures):
                concept = futures[future]
                result = future.result()

                if result["status"] == "ok":
                    completed += 1
                    total_words += result.get("words", 0)
                    progress["completed"].append(result["slug"])
                    elapsed = time.time() - start_time
                    rate = completed / (elapsed / 60) if elapsed > 0 else 0
                    eta = (len(remaining) - completed - failed) / rate if rate > 0 else 0
                    print(
                        f"  [{completed + failed}/{len(remaining)}] "
                        f"{result['slug'][:50]:50s} "
                        f"{result['words']:4d}w "
                        f"refs={result['storedRefs']}+{result['knnRefs']} "
                        f"[{rate:.1f}/min, ETA {eta:.0f}m]"
                    )
                elif result["status"] == "skipped":
                    progress["skipped"].append(result["slug"])
                    print(f"  [{completed + failed}/{len(remaining)}] SKIP {result['slug'][:50]} - {result.get('reason', '')}")
                else:
                    failed += 1
                    progress["failed"].append({"slug": result["slug"], "error": result.get("msg", "")[:200]})
                    print(f"  [{completed + failed}/{len(remaining)}] FAIL {result['slug'][:50]} - {result.get('msg', '')[:100]}")

        # Save progress after each batch
        save_progress(progress)

        # Rate limit delay between batches
        if i + CONCURRENCY < len(remaining):
            time.sleep(DELAY_BETWEEN_BATCHES)

    # Final summary
    elapsed = time.time() - start_time
    print("\n" + "=" * 60)
    print(f"  ARTICLE GENERATION COMPLETE")
    print("=" * 60)
    print(f"  Completed:  {completed}")
    print(f"  Failed:     {failed}")
    print(f"  Skipped:    {len(progress['skipped'])}")
    print(f"  Total words: {total_words:,}")
    print(f"  Avg words:  {total_words // max(1, completed)}")
    print(f"  Time:       {elapsed / 60:.1f} minutes")
    print("=" * 60)

    save_progress(progress)

    if failed > 0:
        print(f"\nFailed concepts ({failed}):")
        for f_item in progress["failed"][-10:]:
            print(f"  - {f_item['slug']}: {f_item['error'][:80]}")
        print("\nRerun the script to retry failed concepts.")


if __name__ == "__main__":
    main()
