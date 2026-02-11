# HDBSCAN Concept & Insight Extraction Pipeline

> Last updated: Feb 11, 2026

---

## Goal

Extract **Concepts** (stable, recurring ideas) and **Insights** (non-obvious relationships between concepts) from 300+ Lenny's Podcast episodes using principled unsupervised ML — not LLM free-form generation.

**Target audience**: People building tech products (PMs, founders, growth leads, eng leaders).

---

## Philosophy

| Principle | Rule |
|-----------|------|
| Concepts come from data | Embeddings → HDBSCAN clustering → LLM only names them |
| Insights come from structure | Co-occurrence graph → contrast/comparison → LLM only interprets |
| No LDA | Topic modeling doesn't work well on conversational text |
| No kNN-only grouping | kNN is for local similarity; HDBSCAN handles global structure |
| No LLM-invented insights | LLM explains structured evidence, never generates from scratch |
| Keywords validate, not drive | TF-IDF keywords confirm clusters; they don't create them |
| Lightning round = signal | Book recs, life mottos, product favorites are valuable content |
| Relevance filter | Every concept must matter to someone building tech products |

---

## Architecture Overview

```
┌──────────────────────────────────────────────────────────┐
│  PHASE 1-4: Python Pipeline (local)                       │
│  pipeline/concept_extraction.py                           │
│                                                           │
│  Supabase DB ──pull──→ Embeddings (10,687 × 1536)        │
│                              ↓                            │
│                     L2 Normalize                          │
│                              ↓                            │
│                   UMAP (1536 → 30 dims)                   │
│                              ↓                            │
│              HDBSCAN (leaf, min_cluster=15)                │
│                              ↓                            │
│          Cluster Analysis (TF-IDF, centroids, reps)       │
│                              ↓                            │
│          Classification & Relevance Scoring               │
│                              ↓                            │
│          Co-occurrence Graph + Community Detection         │
│                              ↓                            │
│          Temporal Analysis                                │
└──────────────────────────┬───────────────────────────────┘
                           │
                    JSON results cache
                           │
┌──────────────────────────┴───────────────────────────────┐
│  PHASE 5: LLM Naming (Python or Edge Function)           │
│                                                           │
│  For each kept cluster:                                   │
│    - Send 5-10 representative chunks to Gemini            │
│    - Get: concept name, one-line definition               │
│    - Validate: can it be named simply? → keep/discard     │
│    - Merge: if two clusters get same name → combine       │
│    - Tag category: product, growth, leadership, etc.      │
└──────────────────────────┬───────────────────────────────┘
                           │
┌──────────────────────────┴───────────────────────────────┐
│  PHASE 6: Write Concepts to DB                            │
│                                                           │
│  Insert into `concepts` table:                            │
│    - title, slug, definition, category, subcategory       │
│    - relevance_score, guest_count, episode_count          │
│  Insert into `concept_references` table:                  │
│    - All chunk_ids in the cluster → reference rows        │
└──────────────────────────┬───────────────────────────────┘
                           │
┌──────────────────────────┴───────────────────────────────┐
│  PHASE 7: Generate Concept Articles                       │
│  (Existing Edge Function: generate_concept_article v11)   │
│                                                           │
│  For each concept:                                        │
│    - KNN enrich with 12 similar chunks                    │
│    - 3-batch sectioned assembly (9 sections)              │
│    - 800-1200 words, inline interview quotes              │
│    - Same format as existing articles                     │
└──────────────────────────┬───────────────────────────────┘
                           │
┌──────────────────────────┴───────────────────────────────┐
│  PHASE 8: Extract Insights from Co-occurrence Graph       │
│                                                           │
│  Source 1: Within-community concept pairs                 │
│    → "Why do [Concept A] and [Concept B] always appear    │
│       together? What's the relationship?"                 │
│                                                           │
│  Source 2: Cross-community bridges                        │
│    → "Why does [Career Growth] connect to [AI Tools]?     │
│       What's the unexpected link?"                        │
│                                                           │
│  Source 3: Absence patterns                               │
│    → "[Pricing] and [PMF] rarely co-occur — why?"         │
│                                                           │
│  Source 4: Temporal patterns                              │
│    → "AI discussions exploded in recent episodes"         │
│                                                           │
│  Source 5: Lightning round aggregation                    │
│    → "The 72 most-recommended books by Lenny's guests"    │
│    → "Common life mottos among 109 product leaders"       │
│                                                           │
│  Each insight:                                            │
│    - Must reference ≥2 concepts                           │
│    - Must have supporting evidence (chunks)               │
│    - LLM interprets, does NOT invent                      │
│    - Gets same 800+ word article treatment                │
└──────────────────────────────────────────────────────────┘
```

---

## Pipeline Parameters (Current Best)

| Parameter | Value | Rationale |
|-----------|-------|-----------|
| `min_tokens` | 50 | Filter very short chunks (greetings, transitions) |
| `reduction` | UMAP | Non-linear manifold learning; PCA loses too much info |
| `n_components` | 30 | UMAP target dims; enough structure for HDBSCAN |
| `UMAP n_neighbors` | 15 | Balance local vs global structure |
| `UMAP min_dist` | 0.0 | Tight clusters (clustering mode, not visualization) |
| `UMAP metric` | cosine | Text embedding similarity metric |
| `min_cluster_size` | 15 | Lenient — allows smaller niche concepts |
| `min_samples` | 8 | Controls noise sensitivity |
| `cluster_method` | leaf | Fine-grained clusters (vs eom=broader) |
| `relevance_threshold` | 0.3 | Min tech-product relevance score to keep |
| `min_guests_to_keep` | 3 | Concept must span 3+ guests (unless lightning round) |

---

## Dry Run Results (Feb 11, 2026)

### Data
- **10,687 chunks** (min 50 tokens) from **302 episodes**, **280 guests**
- **1,536-dim embeddings** (Gemini text-embedding-004)

### Clustering
- **UMAP**: 23 seconds (1536 → 30 dims)
- **HDBSCAN**: 0.7 seconds
- **191 raw clusters**, 41.2% noise
- **Silhouette score**: 0.542 (good)

### Classification
| Category | Count | Description |
|----------|-------|-------------|
| Topical (kept) | 133 | Cross-guest concepts — the core output |
| Lightning round (kept) | 10 | Book recs, mottos, favorites — audience goldmines |
| Case study (dropped) | 48 | 1-2 guest deep dives — too narrow for concepts |
| **Total kept** | **143** | Before merging and LLM naming |

### Domain Breakdown (143 kept)
| Domain | Count | Examples |
|--------|-------|---------|
| Product | 64 | PM skills, roadmaps, OKRs, retention, experiments |
| Leadership | 19 | Coaching, feedback, org design, CEO playbook |
| Engineering | 15 | AI/agents, dev tools, data infra |
| Personal Growth | 15 | Career paths, writing, speaking, interviews |
| Startup | 10 | Fundraising, PMF, YC, pivots |
| Growth | 10 | SEO, PLG, marketplaces, paid, activation |
| Wisdom | 7 | Book recs, life mottos, favorites |
| Marketing | 3 | Brand, positioning, category creation |

### Co-occurrence Graph
- **191 nodes, 4000+ edges**
- **374 significant pairs** (3+ shared episodes between kept concepts)
- **99 strong pairs** (5+ shared episodes)
- **3 major communities** + 2 small ones

---

## Estimated Final Output

| | Before Merge | After Merge + LLM Naming |
|--|---|---|
| Topical concepts | 133 | ~55-65 |
| Lightning round concepts | 10 | ~6-8 |
| **Total concepts** | 143 | **~60-75** |
| Co-occurrence pairs (3+ eps) | 374 | ~150-200 |
| **Estimated insights** | — | **~45-65** |
| **Total articles** | — | **~105-140** |

### Comparison with Previous Approach
| | Old (LLM-only) | New (HDBSCAN) |
|--|---|---|
| Concepts | 20 | ~60-75 |
| Insights | 12 | ~45-65 |
| Discovery | LLM free-form sampling | Embedding clusters |
| Reproducible | No (random sampling) | Yes (deterministic) |
| Article format | Same 9 sections, 800+ words | Same 9 sections, 800+ words |

---

## Current Progress

### ✅ Completed
- [x] Pipeline script (`pipeline/concept_extraction.py`)
- [x] Data pull + caching from Supabase
- [x] L2 normalization
- [x] UMAP dimensionality reduction (installed `umap-learn`)
- [x] HDBSCAN clustering with tuned parameters
- [x] TF-IDF keyword extraction per cluster
- [x] Representative chunk selection (cosine to centroid)
- [x] Co-occurrence graph + community detection
- [x] Cluster classification (topical / lightning_round / case_study / noise)
- [x] Tech-product relevance scoring (8 domains)
- [x] Lightning round preservation (not filtered as noise)
- [x] Dry run report generation
- [x] Multiple parameter tuning runs (PCA→UMAP, eom→leaf, strict→lenient)

### 🔲 Next Steps
- [ ] **Phase 5: LLM Naming** — Send representative chunks to Gemini, get concept name + definition for each kept cluster. Merge clusters that get identical/near-identical names.
- [ ] **Phase 6: DB Write** — Insert named concepts into `concepts` table with proper references.
- [ ] **Phase 7: Article Generation** — Run `generate_concept_article` v11 for each new concept (same as existing pipeline).
- [ ] **Phase 8: Insight Extraction** — Use co-occurrence graph communities + pairs to generate structured insights. LLM interprets but doesn't invent.
- [ ] **Phase 9: Insight Articles** — Generate 800+ word articles for each insight.

---

## File Locations

| File | Purpose |
|------|---------|
| `pipeline/concept_extraction.py` | Main pipeline script (Phases 1-4b) |
| `pipeline/requirements.txt` | Python dependencies |
| `pipeline/.cache/embeddings.npz` | Cached embeddings (binary) |
| `pipeline/.cache/metadata.json` | Cached chunk metadata + texts |
| `pipeline/.cache/dry_run_results.json` | Latest dry run results |
| `pipeline/.cache/full_run_classified.log` | Full run log with classification |
| `docs/hdbscan-pipeline-plan.md` | This file — full plan |
| `docs/resume-concept-generation.md` | Previous approach (LLM-only, for reference) |
| `supabase/functions/generate_concept_article/` | Edge Function for article generation (reuse) |

---

## CLI Reference

```bash
# Quick sample run
python3 pipeline/concept_extraction.py --dry-run --sample 3000

# Full dataset, lenient params (current best)
python3 pipeline/concept_extraction.py --dry-run \
  --min-tokens 50 \
  --reduction umap \
  --n-components 30 \
  --min-cluster-size 15 \
  --min-samples 8 \
  --cluster-method leaf

# Stricter (fewer, broader concepts)
python3 pipeline/concept_extraction.py --dry-run \
  --min-tokens 50 \
  --reduction umap \
  --n-components 30 \
  --min-cluster-size 30 \
  --min-samples 15 \
  --cluster-method eom

# Force re-pull from Supabase (ignore cache)
python3 pipeline/concept_extraction.py --dry-run --force-refresh
```

