# Supabase Migration Guide

## Overview

The knowledge base storage has been migrated from local files to Supabase with vector-enabled tables. This provides:
- Scalable cloud storage
- Vector similarity search using pgvector
- Better performance for large datasets
- Centralized data management

## Supabase Setup

**Project URL:** https://rhzpjvuutpjtdsbnskdy.supabase.co

**Publishable API Key:** `sb_publishable_2yKt6iNyAT4XEizznV8_1A_QlDKGoBo`

## Environment Variables

Add to your `.env` file:

```bash
SUPABASE_URL=https://rhzpjvuutpjtdsbnskdy.supabase.co
SUPABASE_KEY=sb_publishable_2yKt6iNyAT4XEizznV8_1A_QlDKGoBo
# Or use SUPABASE_PUBLISHABLE_KEY
```

## Database Schema

The following tables have been created:

1. **theme_extractions** - Stores extracted theme information per chunk
2. **themes** - Stores theme clusters with centroid embeddings
3. **guest_theme_strengths** - Maps guests to themes with strength scores
4. **chunk_theme_assignments** - Maps chunks to themes
5. **chunk_embeddings** - Stores chunk text with vector embeddings (384 dimensions)

All tables include:
- `created_at` and `updated_at` timestamps
- Proper indexes for performance
- Vector similarity search support

## Usage

### Building Knowledge Base with Supabase

By default, the build script now saves to Supabase:

```bash
python scripts/build_knowledge_base.py
```

To use local file storage instead:

```bash
python scripts/build_knowledge_base.py --no-supabase
```

### Current Status

✅ **Build process paused** - PID 21456 has been stopped
✅ **Supabase tables created** - All 5 tables with vector support
✅ **Migration code ready** - `src/knowledge/supabase_store.py` created
✅ **Build script updated** - Now supports Supabase storage

## Next Steps

1. **Resume build process** - The theme extractor can be resumed and will save to Supabase
2. **Update API** - Modify `src/api/main.py` to load from Supabase instead of local files
3. **Update VectorStore** - Create a Supabase-backed vector store implementation

## Vector Search

The `match_chunks` function enables fast vector similarity search:

```sql
SELECT * FROM match_chunks(
    query_embedding := '[0.1, 0.2, ...]'::vector(384),
    match_threshold := 0.7,
    match_count := 10,
    filter_guest_id := 'guest-123',
    filter_theme_id := 'T01'
);
```

## Migration Notes

- Local files are still created as backup when `--no-supabase` is used
- Existing local data can be migrated to Supabase using a migration script (to be created)
- The vector store dimension is 384 (all-MiniLM-L6-v2 model)

