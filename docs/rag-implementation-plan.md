# Espresso RAG Implementation Plan

Status: Draft v1  
Owner: Product + Engineering  
Scope: Lenny's Podcast first, multi-knowledge-base ready

## 1) Purpose

This document defines the production implementation plan for Espresso RAG:

- Ship a grounded, citation-first chat and concept/insight experience for Lenny's Podcast.
- Make onboarding a new knowledge base at least 90% repeatable through config and runbooks.
- Align implementation with `Updated_Final_PRD.md` and current codebase realities.

## 2) Architecture Decision (Phase 0)

### Decision

Use **Next.js API routes + Supabase** as the canonical runtime for podcast-page chat and retrieval.

### Rationale

- Matches PRD constraint: no additional custom backend service required for product runtime.
- Current podcast page already calls Next.js API routes (`/api/chat`, `/api/concepts`).
- Keeps auth, RLS, and deployment in one path.

### Boundary

- **Runtime path (production):** `frontend/app/api/*` + `frontend/lib/*`
- **Offline path (batch processing):** `scripts/*` and `src/*` for ingestion/extraction/distillation jobs
- **Legacy FastAPI path:** retained short-term, but not the primary path for podcast page

## 3) Current State Summary

### Ready

- Podcast page UI shell and tabbed experience (`Insights`, `Concepts`, `Chat`)
- Ingestion data in Supabase (`episodes`, `segments`, `themes`, `theme_extractions`, books)
- TS utilities for embeddings/vector search/intelligence in `frontend/lib`

### Not Ready (must complete)

- `frontend/app/api/chat/route.ts` still returns mock response
- `frontend/lib/api/concepts.ts` and `frontend/lib/api/insights.ts` return mock data
- `chunk_embeddings` is not populated in production
- `concepts` and concept reference/link tables are not created
- insight storage model is not created

## 4) Target Product Guarantees

For every assistant response in Chat:

1. Direct answer
2. Consensus
3. Disagreement
4. Minority view (if present)
5. Explicit references (guest + episode, optionally timestamp/quote)
6. Honest insufficiency when evidence is weak

No uncited claims. No generic chatbot tone.

## 4.1) Segment Allowlist Policy (Hard Rule)

RAG retrieval must only use content derived from these segment types:

- `interview` (primary source)
- `lightning_round` (secondary source for books/tools/tactical recommendations)

### Decision on intro/outro

- `intro`: **exclude from RAG evidence** by default. It is often host framing, bios, or promo-style setup and can reduce signal quality.
- `outro`: **exclude from RAG evidence**. It is generally closing remarks and not core domain knowledge.
- `sponsor`: always excluded.

### Practical implication

- For retrieval tables (for example `chunk_embeddings`), only ingest chunks from `interview` and `lightning_round`.
- If intro data is useful (for example guest role/company metadata), use it as structured metadata only, not as evidence text for answer generation.

## 5) Phase Plan

## Phase 1: Data Model and Contracts

Create and migrate podcast-scoped tables:

- `concepts`
- `concept_references`
- `concept_chunks`
- `insights`
- `insight_evidence`
- optional: `chat_sessions`, `chat_messages`

Requirements:

- strict FKs to `episodes`, `guests`, `chunk_embeddings`
- unique slugs scoped by podcast
- provenance fields required for all evidence rows
- RLS policies aligned with public read and server-side write

Deliverables:

- migration SQL
- typed TS interfaces for API payloads and DB rows

## Phase 2: Retrieval Substrate

- Populate `chunk_embeddings` using interview-only segments
- Update ingestion policy to include `lightning_round` chunks as allowed RAG evidence
- Keep `intro`, `outro`, and `sponsor` out of evidence retrieval
- Enforce one embedding model/dimension contract (1536)
- Build hybrid retrieval:
  - concept chunks (higher weight)
  - transcript chunks (grounding)
  - structured books lookup path for book-specific questions
- Add retrieval controls:
  - min similarity threshold
  - dedupe by chunk/episode
  - diversity cap per guest
  - deterministic sorting and tie-breaks

Deliverables:

- population job + backfill command
- retrieval module with debug trace output

## Phase 3: Chat API (Production)

Implement `/api/chat` pipeline:

1. validate input + podcast scope
2. classify intent (book/concept/insight/general)
3. retrieve evidence bundle
4. generate structured answer with strict output schema
5. post-validate citations against retrieved evidence
6. return UI-safe response structure

Operational requirements:

- request tracing ID
- latency/token/cost logs
- rate limiting
- safe fallback for low-evidence cases

## Phase 4: Concepts + Insights Wiring

- Replace mock loaders with real Supabase reads
- Wire concept page to real concept body + references
- Provide real insights and evidence rows for cards + breakdown
- Keep CTA handoff from insight -> chat context pin

## Phase 5: Quality and Launch Gates

Build eval set (at least 30 representative questions):

- PM strategy, growth, prioritization, retention
- disagreement-style questions
- books recommendation questions

Track:

- faithfulness
- citation precision/recall
- structure compliance
- latency p50/p95

Launch gate defaults:

- citation precision >= 0.90
- hallucination <= 2%
- structure compliance >= 0.95

## 6) 90% Repeatable New Knowledge Base Process

Define per-knowledge-base manifest:

`knowledge_base/<slug>/manifest.yaml`

Fields:

- source metadata (name, host, feeds/files)
- brand tokens (colors, copy snippets)
- chunking parameters
- retrieval weights
- model settings
- evaluation pack path

Standard run:

1. ingest transcripts
2. segment/chunk interview content
3. extract themes/signals
4. cluster/distill concept candidates
5. generate embeddings
6. publish concepts/insights/evidence
7. run eval suite
8. flip feature flag

Manual work should be mostly editorial QA, not engineering rewrites.

## 7) Risks and Mitigations

- Schema drift between repo SQL and Supabase project  
  - Mitigation: all schema updates through tracked migrations only

- Citation drift (model writes claims not in evidence)  
  - Mitigation: strict schema output + citation validator + rejection loop

- Latency inflation from heavy retrieval  
  - Mitigation: bounded retrieval counts, cached embeddings, threshold pruning

- Security/RLS gaps  
  - Mitigation: advisor checks and policy hardening before launch

## 8) Immediate Next Steps

1. Add Phase 1 migration for concepts/insights/chat tables
2. Add shared TS contracts for RAG API payloads
3. Implement `/api/chat` retrieval + structured response path behind feature flag
4. Replace mock concept/insight readers with real queries


