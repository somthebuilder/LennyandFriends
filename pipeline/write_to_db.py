#!/usr/bin/env python3
"""
Write extraction results to Supabase via REST API.
Reads pipeline/.cache/extraction_results.json and inserts concepts + insights.
"""

import json
import os
import sys
import time
from pathlib import Path

import requests

SUPABASE_URL = "https://rhzpjvuutpjtdsbnskdy.supabase.co"
# Need service role key for writes (bypasses RLS)
SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_KEY", "")
# Fallback to anon key if no service key
if not SUPABASE_KEY:
    SUPABASE_KEY = os.environ.get(
        "SUPABASE_KEY",
        "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJoenBqdnV1dHBqdGRzYm5za2R5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAxNzQxMjUsImV4cCI6MjA4NTc1MDEyNX0.1PjJnJr33fJ41eavn5e6dSVUDwR0-2D5_d0SqyhndqM",
    )

REST_URL = f"{SUPABASE_URL}/rest/v1"
PODCAST_ID = "afe7247b-50e4-4e8b-9b0d-7f02ed206090"  # Lenny's Podcast UUID
CACHE_DIR = Path(__file__).parent / ".cache"


def headers(prefer="return=representation"):
    return {
        "apikey": SUPABASE_KEY,
        "Authorization": f"Bearer {SUPABASE_KEY}",
        "Content-Type": "application/json",
        "Prefer": prefer,
    }


def insert_batch(table, rows, batch_size=50):
    """Insert rows into a table in batches. Returns list of inserted rows."""
    all_inserted = []
    for i in range(0, len(rows), batch_size):
        batch = rows[i:i + batch_size]
        resp = requests.post(
            f"{REST_URL}/{table}",
            headers=headers(),
            json=batch,
        )
        if resp.status_code not in (200, 201):
            print(f"  ERROR inserting into {table}: {resp.status_code} - {resp.text[:500]}")
            # Try one by one for this batch to find the problem
            for row in batch:
                r = requests.post(f"{REST_URL}/{table}", headers=headers(), json=row)
                if r.status_code in (200, 201):
                    result = r.json()
                    if isinstance(result, list):
                        all_inserted.extend(result)
                    else:
                        all_inserted.append(result)
                else:
                    print(f"    SKIP: {r.status_code} - {r.text[:200]}")
        else:
            result = resp.json()
            if isinstance(result, list):
                all_inserted.extend(result)
            else:
                all_inserted.append(result)
        pct = min(100, int((i + len(batch)) / len(rows) * 100))
        print(f"\r  {table}: {i + len(batch)}/{len(rows)} ({pct}%)", end="", flush=True)
    print()
    return all_inserted


def main():
    # Load results
    results_file = CACHE_DIR / "extraction_results.json"
    if not results_file.exists():
        print("ERROR: extraction_results.json not found!")
        sys.exit(1)

    with open(results_file) as f:
        data = json.load(f)

    concepts = data["concepts"]
    insights = data["insights"]
    print(f"Loaded {len(concepts)} concepts, {len(insights)} insights")

    # ── Insert Concepts ──
    print("\n[1/4] Inserting concepts...")
    concept_rows = []
    for c in concepts:
        concept_rows.append({
            "podcast_id": PODCAST_ID,
            "title": c["title"],
            "slug": c["slug"],
            "summary": c["summary"],
            "body": c["summary"],  # Placeholder, will be expanded by article generation edge function
            "status": "published",
            "category": c["category"],
            "theme_label": c.get("theme_label", "topical"),
            "guest_count": c["guest_count"],
            "episode_count": c["episode_count"],
            "valuable_count": 0,
        })

    inserted_concepts = insert_batch("concepts", concept_rows, batch_size=30)
    print(f"  Inserted {len(inserted_concepts)} concepts")

    # Build slug -> id mapping for references
    concept_id_map = {}
    for ic in inserted_concepts:
        concept_id_map[ic["slug"]] = ic["id"]

    # ── Insert Concept References ──
    print("\n[2/4] Inserting concept references...")
    ref_rows = []
    for c in concepts:
        concept_id = concept_id_map.get(c["slug"])
        if not concept_id:
            continue
        for ref in c.get("references", []):
            ref_rows.append({
                "concept_id": concept_id,
                "guest_id": ref["guest_id"],
                "episode_id": ref["episode_id"],
                "quote": ref.get("quote", "")[:1000],
                "display_order": ref.get("display_order", 1),
            })

    if ref_rows:
        insert_batch("concept_references", ref_rows, batch_size=50)
    print(f"  Inserted {len(ref_rows)} references")

    # ── Insert Insights ──
    print("\n[3/4] Inserting insights...")
    insight_rows = []
    for ins in insights:
        explanation = ins.get("explanation", [])
        if isinstance(explanation, str):
            explanation = [explanation]

        insight_rows.append({
            "podcast_id": PODCAST_ID,
            "title": ins["title"],
            "slug": ins["slug"],
            "takeaway": ins.get("takeaway", ""),
            "signal": ins.get("signal", "high_consensus"),
            "category": ins.get("category", "product"),
            "theme_label": ins.get("category", "product"),
            "explanation": explanation,
            "trend": ins.get("trend", "stable"),
            "guest_count": 0,  # Will be computed from evidence
            "episode_count": 0,
            "valuable_count": 0,
        })

    inserted_insights = insert_batch("insights", insight_rows, batch_size=30)
    print(f"  Inserted {len(inserted_insights)} insights")

    # Build slug -> id mapping for evidence
    insight_id_map = {}
    for ii in inserted_insights:
        insight_id_map[ii["slug"]] = ii["id"]

    # ── Insert Insight Evidence ──
    # For insights, we link them to the concepts they reference
    # Find evidence from the concepts mentioned in each insight
    print("\n[4/4] Inserting insight evidence...")
    evidence_rows = []
    for ins in insights:
        insight_id = insight_id_map.get(ins["slug"])
        if not insight_id:
            continue

        # Find the concepts this insight references
        concept_a_title = ins.get("concept_a", "")
        concept_b_title = ins.get("concept_b", "")

        # Find matching concepts and get their references
        display_order = 1
        for c in concepts:
            if c["title"] == concept_a_title or c["title"] == concept_b_title:
                for ref in c.get("references", [])[:3]:
                    evidence_rows.append({
                        "insight_id": insight_id,
                        "guest_id": ref["guest_id"],
                        "episode_id": ref["episode_id"],
                        "quote": ref.get("quote", "")[:1000],
                        "display_order": display_order,
                    })
                    display_order += 1

    if evidence_rows:
        insert_batch("insight_evidence", evidence_rows, batch_size=50)
    print(f"  Inserted {len(evidence_rows)} evidence rows")

    # ── Summary ──
    print("\n" + "=" * 50)
    print("  DB WRITE COMPLETE")
    print("=" * 50)
    print(f"  Concepts:    {len(inserted_concepts)}")
    print(f"  References:  {len(ref_rows)}")
    print(f"  Insights:    {len(inserted_insights)}")
    print(f"  Evidence:    {len(evidence_rows)}")
    print("=" * 50)


if __name__ == "__main__":
    main()
