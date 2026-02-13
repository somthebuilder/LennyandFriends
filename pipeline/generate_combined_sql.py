#!/usr/bin/env python3
"""Generate combined SQL INSERT statements from extraction_results.json."""

import json
from pathlib import Path

CACHE_DIR = Path(__file__).parent / ".cache"
PODCAST_UUID = "afe7247b-50e4-4e8b-9b0d-7f02ed206090"


def esc(s):
    if s is None:
        return "NULL"
    return "'" + str(s).replace("'", "''")[:2000] + "'"


def main():
    with open(CACHE_DIR / "extraction_results.json") as f:
        data = json.load(f)

    concepts = data["concepts"]
    insights = data["insights"]
    sql_dir = CACHE_DIR / "sql"
    sql_dir.mkdir(exist_ok=True)

    # ── All Concepts (single file) ──
    values = []
    for c in concepts:
        values.append(
            f"('{PODCAST_UUID}', {esc(c['title'])}, {esc(c['slug'])}, "
            f"{esc(c['summary'])}, {esc(c['summary'])}, 'published', "
            f"{esc(c.get('category', 'product'))}, {esc(c.get('theme_label', 'topical'))}, "
            f"{c['guest_count']}, {c['episode_count']}, 0)"
        )
    sql = (
        "INSERT INTO concepts (podcast_id, title, slug, summary, body, status, "
        "category, theme_label, guest_count, episode_count, valuable_count) VALUES\n"
        + ",\n".join(values) + ";\n"
    )
    with open(sql_dir / "all_concepts.sql", "w", encoding="utf-8") as f:
        f.write(sql)
    print(f"Concepts: {len(values)} rows")

    # ── All Insights (single file) ──
    values = []
    for ins in insights:
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
        + ",\n".join(values) + ";\n"
    )
    with open(sql_dir / "all_insights.sql", "w", encoding="utf-8") as f:
        f.write(sql)
    print(f"Insights: {len(values)} rows")

    # ── All References (single file) ──
    ref_values = []
    for c in concepts:
        slug = c["slug"].replace("'", "''")
        for ref in c.get("references", []):
            ref_values.append(
                f"((SELECT id FROM concepts WHERE slug = '{slug}' LIMIT 1), "
                f"{esc(ref['guest_id'])}, {esc(ref['episode_id'])}, "
                f"{esc(ref.get('quote', ''))}, {ref.get('display_order', 1)})"
            )
    sql = (
        "INSERT INTO concept_references (concept_id, guest_id, episode_id, quote, display_order) VALUES\n"
        + ",\n".join(ref_values) + ";\n"
    )
    with open(sql_dir / "all_refs.sql", "w", encoding="utf-8") as f:
        f.write(sql)
    print(f"References: {len(ref_values)} rows")

    # ── All Evidence (single file) ──
    ev_values = []
    for ins in insights:
        slug = ins["slug"].replace("'", "''")
        concept_a = ins.get("concept_a", "")
        concept_b = ins.get("concept_b", "")
        order = 1
        for c in concepts:
            if c["title"] == concept_a or c["title"] == concept_b:
                for ref in c.get("references", [])[:2]:
                    ev_values.append(
                        f"((SELECT id FROM insights WHERE slug = '{slug}' LIMIT 1), "
                        f"{esc(ref['guest_id'])}, {esc(ref['episode_id'])}, "
                        f"{esc(ref.get('quote', ''))}, {order})"
                    )
                    order += 1
    sql = (
        "INSERT INTO insight_evidence (insight_id, guest_id, episode_id, quote, display_order) VALUES\n"
        + ",\n".join(ev_values) + ";\n"
    )
    with open(sql_dir / "all_evidence.sql", "w", encoding="utf-8") as f:
        f.write(sql)
    print(f"Evidence: {len(ev_values)} rows")
    print("Done!")


if __name__ == "__main__":
    main()
