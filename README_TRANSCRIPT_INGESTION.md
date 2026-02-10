# Transcript & Data Ingestion Pipeline

A comprehensive pipeline for ingesting Lenny's Podcast transcripts, extracting structured data using LLM (Gemini), and storing in normalized Supabase tables. Part of the [Espresso](Updated_Final_PRD.md) project.

## Features

- ✅ **LLM-based extraction** — Uses Gemini 2.5 Flash to intelligently parse transcripts (no regex)
- ✅ **Structured data extraction** — Extracts guests, episodes, segments, lightning rounds, sponsors
- ✅ **Book extraction** — Extracts book recommendations from lightning round data via Gemini
- ✅ **Idempotent** — Safe to re-run without duplicating data (uses transcript hashing)
- ✅ **Normalized database** — Clean relational schema with foreign keys
- ✅ **Interview chunking** — Chunks interview segments for vector DB with expert_id mapping

## Current Data Status

| Table | Rows | Notes |
|---|---|---|
| `guests` | 284 | Guest profiles with roles, companies, fun facts |
| `episodes` | 302 | Full episode metadata + transcript hashes |
| `segments` | 6,249 | Typed segments: intro, sponsor, interview, lightning_round, outro |
| `lightning_round_answers` | 246 | Structured Q&A per episode |
| `sponsor_mentions` | 812 | Sponsor ads with CTA URLs |
| `books` | 530 | Book catalog with AI-generated summaries |
| `book_recommendations` | 640 | Guest → Book recommendations with quotes |
| `themes` | 57 | Clustered themes (cleaned of non-interview content) |
| `theme_extractions` | 27,965 | Per-chunk theme signals |

## Setup

1. **Install dependencies:**
```bash
pip install google-generativeai pydantic supabase python-dotenv tqdm
```

2. **Set environment variables:**
```bash
export GEMINI_API_KEY="your-gemini-api-key"
export SUPABASE_URL="your-supabase-url"
export SUPABASE_KEY="your-supabase-service-role-key"

# For Vertex AI (book extraction with ADC):
export USE_ADC=1
export VERTEX_PROJECT_ID="your-gcp-project"
export VERTEX_LOCATION="us-central1"
```

3. **Create database tables:**
```bash
# Run in Supabase SQL editor:
# scripts/create_transcript_tables.sql
# migrations/setup_pgvector.sql
```

## Scripts

### Main Ingestion

```bash
# Process all transcripts (idempotent — skips already-processed)
python scripts/ingest_transcripts.py

# Process from specific directory
python scripts/ingest_transcripts.py --episodes-dir episodes

# Test without Supabase (dry run)
python scripts/ingest_transcripts.py --no-supabase
```

### Book Extraction

```bash
# Extract book recommendations from lightning round data
python scripts/extract_books_with_gemini.py

# Prepare payload for Supabase bulk upload
python scripts/prepare_books_supabase_payload.py

# Generate summary report (markdown)
python scripts/generate_book_summary_report.py
```

### Chunking

```bash
# Chunk all interview segments for vector DB
python scripts/chunk_interview_segments.py

# Chunk single episode
python scripts/chunk_interview_segments.py --episode-id <episode-uuid>

# Custom chunk size
python scripts/chunk_interview_segments.py --chunk-size 1000 --chunk-overlap 100
```

### Backfill

```bash
# Backfill missing lightning round answers
python scripts/backfill_lightning_round.py --episodes-dir episodes

# Backfill other missing data
python scripts/backfill_missing_data.py --episodes-dir episodes
```

### Knowledge Base

```bash
# Build themes + theme extractions from chunks
python scripts/build_knowledge_base.py
```

## Database Schema

### Core Tables

- **guests** — Guest information (name, role, company, previous roles, fun facts)
- **episodes** — Episode metadata (title, date, description, YouTube info, keywords, transcript_hash)
- **segments** — Transcript segments by type (`intro`, `sponsor`, `interview`, `lightning_round`, `outro`)
- **lightning_round_answers** — Lightning round Q&A (books, entertainment, products, life motto, etc.)
- **sponsor_mentions** — Sponsor advertisements (name, content, CTA URL, position)

### Book Tables

- **books** — Book catalog (title, author, genre, AI-generated summary)
- **book_recommendations** — Guest ↔ Book link (quote, context). FK to `books.id` and `guests.id`

### Knowledge / RAG Tables

- **chunk_embeddings** — Interview chunks with vector embeddings for pgvector similarity search
- **themes** — Clustered themes from transcript analysis
- **theme_extractions** — Per-chunk theme signals (semantic descriptors, core thesis, confidence)

### Key Design Decisions

- **JSONB fields** for arrays (previous_roles, fun_facts, keywords)
- **Transcript hash** (SHA256) for idempotency — skips already-processed episodes
- **RLS policies** on all tables for security
- **Only interview segments** used for concept generation (promotions, outros excluded)
- **Books as structured tables** — not solely reliant on RAG for book queries

## LLM Extraction Details

The pipeline uses **Gemini 2.5 Flash** to extract:

1. **From metadata block:** Guest name, episode title, publish date, description, YouTube URL/ID, duration, view count, keywords
2. **From cold open:** Opening quote text
3. **From intro:** Current role/company, previous roles, fun facts
4. **From sponsor breaks:** Sponsor name, ad content, CTA URL, position
5. **From lightning round:** Books, entertainment, interview question, products, productivity tip, life motto
6. **From full transcript:** Segments classified by type

## Speaker Parsing

The chunking script uses **LLM-based speaker parsing** instead of regex:
- Intelligently identifies speaker changes
- Extracts timestamps accurately
- Handles variations in transcript format
- Falls back gracefully if LLM unavailable

## Idempotency

- Uses SHA256 hash of transcript content
- Checks `episodes.transcript_hash` before processing
- Skips already-processed transcripts
- Updates existing records instead of duplicating

## Error Handling

- **Retry logic** — Up to 3 retries for LLM extraction
- **Validation** — Pydantic schema validation
- **Logging** — Detailed error messages and progress tracking
- **Graceful failures** — Continues processing other transcripts on error
