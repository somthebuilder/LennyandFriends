#!/usr/bin/env python3
"""Generate SQL INSERT statements from extraction_results.json for Supabase."""

import json
import sys
from pathlib import Path

CACHE_DIR = Path(__file__).parent / ".cache"
PODCAST_UUID = "afe7247b-50e4-4e8b-9b0d-7f02ed206090"


def esc(s):
    """Escape single quotes for SQL."""
    if s is None:
        return "NULL"
    return "'" + str(s).replace("'", "''")[:2000] + "'"


def main():
    with open(CACHE_DIR / "extraction_results.json") as f:
        data = json.load(f)

    concepts = data["concepts"]
    insights = data["insights"]

    # Generate concept INSERT batches (20 per file)
    batch_size = 20
    sql_dir = CACHE_DIR / "sql"
    sql_dir.mkdir(exist_ok=True)

    # ── Concepts ──
    for batch_idx in range(0, len(concepts), batch_size):
        batch = concepts[batch_idx:batch_idx + batch_size]
        values = []
        for c in batch:
            values.append(
                f"('{PODCAST_UUID}', {esc(c['title'])}, {esc(c['slug'])}, "
                f"{esc(c['summary'])}, {esc(c['summary'])}, 'published', "
                f"{esc(c.get('category', 'product'))}, {esc(c.get('theme_label', 'topical'))}, "
                f"{c['guest_count']}, {c['episode_count']}, 0)"
            )
        sql = (
            "INSERT INTO concepts (podcast_id, title, slug, summary, body, status, "
            "category, theme_label, guest_count, episode_count, valuable_count) VALUES\n"
            + ",\n".join(values) + "\n"
            "RETURNING id, slug;\n"
        )
        out = sql_dir / f"concepts_{batch_idx:03d}.sql"
        with open(out, "w", encoding="utf-8") as f:
            f.write(sql)

    print(f"Generated {len(concepts)} concept INSERTs in {(len(concepts)-1)//batch_size + 1} files")

    # ── Insights ──
    for batch_idx in range(0, len(insights), batch_size):
        batch = insights[batch_idx:batch_idx + batch_size]
        values = []
        for ins in batch:
            explanation = ins.get("explanation", [])
            if isinstance(explanation, str):
                explanation = [explanation]
            explanation_json = json.dumps(explanation).replace("'", "''")

            values.append(
                f"('{PODCAST_UUID}', {esc(ins['title'])}, {esc(ins['slug'])}, "
                f"{esc(ins.get('takeaway', ''))}, {esc(ins.get('signal', 'high_consensus'))}, "
                f"0, 0, '{explanation_json}'::jsonb, "
                f"{esc(ins.get('trend', 'stable'))}, {esc(ins.get('category', 'product'))}, "
                f"{esc(ins.get('category', 'product'))}, 0)"
            )
        sql = (
            "INSERT INTO insights (podcast_id, title, slug, takeaway, signal, "
            "guest_count, episode_count, explanation, trend, category, theme_label, valuable_count) VALUES\n"
            + ",\n".join(values) + "\n"
            "RETURNING id, slug;\n"
        )
        out = sql_dir / f"insights_{batch_idx:03d}.sql"
        with open(out, "w", encoding="utf-8") as f:
            f.write(sql)

    print(f"Generated {len(insights)} insight INSERTs in {(len(insights)-1)//batch_size + 1} files")

    # ── Concept References (needs concept IDs first - generate template) ──
    # We'll generate a single SQL that uses subqueries to match by slug
    ref_values = []
    for c in concepts:
        slug = c["slug"].replace("'", "''")
        for ref in c.get("references", []):
            ref_values.append(
                f"((SELECT id FROM concepts WHERE slug = '{slug}' LIMIT 1), "
                f"{esc(ref['guest_id'])}, {esc(ref['episode_id'])}, "
                f"{esc(ref.get('quote', ''))}, {ref.get('display_order', 1)})"
            )

    # Batch these too
    for batch_idx in range(0, len(ref_values), batch_size * 2):
        batch = ref_values[batch_idx:batch_idx + batch_size * 2]
        sql = (
            "INSERT INTO concept_references (concept_id, guest_id, episode_id, quote, display_order) VALUES\n"
            + ",\n".join(batch) + ";\n"
        )
        out = sql_dir / f"refs_{batch_idx:03d}.sql"
        with open(out, "w", encoding="utf-8") as f:
            f.write(sql)

    print(f"Generated {len(ref_values)} reference INSERTs")

    # ── Insight Evidence ──
    evidence_values = []
    for ins in insights:
        slug = ins["slug"].replace("'", "''")
        concept_a = ins.get("concept_a", "")
        concept_b = ins.get("concept_b", "")

        # Find matching concepts for evidence
        for c in concepts:
            if c["title"] == concept_a or c["title"] == concept_b:
                for ref in c.get("references", [])[:2]:
                    evidence_values.append(
                        f"((SELECT id FROM insights WHERE slug = '{slug}' LIMIT 1), "
                        f"{esc(ref['guest_id'])}, {esc(ref['episode_id'])}, "
                        f"{esc(ref.get('quote', ''))}, {len(evidence_values) % 10 + 1})"
                    )

    for batch_idx in range(0, len(evidence_values), batch_size * 2):
        batch = evidence_values[batch_idx:batch_idx + batch_size * 2]
        sql = (
            "INSERT INTO insight_evidence (insight_id, guest_id, episode_id, quote, display_order) VALUES\n"
            + ",\n".join(batch) + ";\n"
        )
        out = sql_dir / f"evidence_{batch_idx:03d}.sql"
        with open(out, "w", encoding="utf-8") as f:
            f.write(sql)

    print(f"Generated {len(evidence_values)} evidence INSERTs")
    print(f"\nAll SQL files in: {sql_dir}")


if __name__ == "__main__":
    main()
