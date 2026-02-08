# Vercel-Only Deployment Guide

## Current Status: ⚠️ Still Need Python Backend

**TL;DR:** You still need the Python backend for now, but we're 90% there!

## What's Already Vercel-Ready ✅

1. ✅ **Frontend** - Next.js → Deploy to Vercel
2. ✅ **Database** - Supabase (cloud-hosted, no deployment)
3. ✅ **Vector Search** - pgvector in Supabase (no Python needed for search)
4. ✅ **LLM Calls** - Can be done from Next.js API routes (just HTTP calls)

## What Still Needs Python Backend ⚠️

### The Blocker: Query Embedding Generation

When a user asks a question, you need to:
1. **Generate embedding** for the query → Currently uses `sentence-transformers` (Python-only)
2. **Search Supabase** → ✅ Can be done from Next.js (already set up)
3. **Call LLM** → ✅ Can be done from Next.js (just HTTP)

**The problem:** `sentence-transformers` is Python-only and can't run in Vercel Edge Functions.

## Solutions to Go Vercel-Only

### Option 1: Use OpenAI Embeddings API (Recommended) 💰

**Pros:**
- Works from Node.js/TypeScript
- No Python backend needed
- Fast and reliable

**Cons:**
- Costs money (~$0.0001 per 1K tokens)
- Different embedding model (1536 dims vs 384)

**Implementation:**
```typescript
// frontend/app/api/query/route.ts
import OpenAI from 'openai'

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

// Generate query embedding
const embeddingResponse = await openai.embeddings.create({
  model: 'text-embedding-3-small', // or text-embedding-3-large
  input: userQuery
})

const queryEmbedding = embeddingResponse.data[0].embedding

// Search Supabase
const { data } = await supabase.rpc('match_chunks', {
  query_embedding: queryEmbedding,
  match_count: 10
})
```

**Migration needed:**
- Re-embed all chunks with OpenAI model (1536 dims)
- Update `chunk_embeddings.embedding` column to `vector(1536)`
- Update `match_chunks` function signature

### Option 2: Use Supabase Edge Functions for Embeddings 🔧

**Pros:**
- Free (if using sentence-transformers via Deno)
- Keeps same embedding model

**Cons:**
- More complex setup
- Need to rewrite embedding logic in Deno
- May have performance limits

### Option 3: Hybrid Approach (Current) 🏗️

**Keep Python backend but simplify:**
- Python: Only generates query embeddings
- Next.js: Does vector search + LLM calls

**Pros:**
- Minimal changes needed
- Keeps free sentence-transformers

**Cons:**
- Still need to deploy Python backend
- More complex architecture

## Recommended Path Forward

### Phase 1: Current (Hybrid) ✅
- Frontend: Vercel
- Backend: Railway/Render (Python for embeddings)
- Database: Supabase

**Cost:** ~$5-10/month

### Phase 2: Vercel-Only (After Migration) 🎯

**Steps:**
1. Switch to OpenAI embeddings API
2. Re-embed all chunks with OpenAI model
3. Update Supabase schema (vector dimension)
4. Rewrite RAG orchestration in TypeScript
5. Deploy only to Vercel

**Cost:** ~$0-5/month (Vercel free tier + OpenAI API usage)

## What Needs to Be Rewritten

If going Vercel-only, you'll need to port these Python files to TypeScript:

1. **`src/runtime/intelligence.py`** → Theme matching logic
2. **`src/runtime/rag_engine.py`** → RAG orchestration
3. **`src/runtime/lenny_moderator.py`** → Clarification questions

**Complexity:** Medium (2-3 days of work)

## Quick Comparison

| Approach | Backend Needed? | Cost | Complexity |
|----------|----------------|------|------------|
| **Current (Hybrid)** | ✅ Yes (Python) | $5-10/mo | Low |
| **Vercel + OpenAI** | ❌ No | $0-5/mo | Medium |
| **Vercel + Supabase Edge** | ❌ No | Free | High |

## Recommendation

**For now:** Keep the hybrid approach (Vercel + Python backend)

**Why:**
- Works immediately
- No code changes needed
- Minimal cost
- Can migrate later

**When to migrate:**
- When you want to reduce costs
- When you want simpler deployment
- When you have time for the migration (2-3 days)

## Next Steps

If you want to go Vercel-only:

1. **Decide on embedding model:**
   - OpenAI (paid, easy)
   - Supabase Edge Functions (free, complex)

2. **Re-embed knowledge base:**
   ```bash
   # Update build script to use OpenAI embeddings
   python scripts/build_knowledge_base.py --use-openai-embeddings
   ```

3. **Update Supabase schema:**
   ```sql
   ALTER TABLE chunk_embeddings 
   ALTER COLUMN embedding TYPE vector(1536); -- OpenAI dimension
   ```

4. **Rewrite RAG logic in TypeScript:**
   - Port `rag_engine.py` → `lib/rag-engine.ts`
   - Port `intelligence.py` → `lib/intelligence.ts`

5. **Update API routes:**
   - Remove Python backend proxy
   - Implement full logic in Next.js API routes

## Current Architecture (Hybrid)

```
┌─────────────┐
│   Vercel    │  Next.js Frontend
│  (Frontend) │  + API Routes (proxy)
└──────┬──────┘
       │
       │ HTTP
       ▼
┌─────────────┐
│  Railway    │  Python FastAPI
│  (Backend)  │  - Embeddings (sentence-transformers)
│             │  - RAG Orchestration
└──────┬──────┘
       │
       │ SQL + RPC
       ▼
┌─────────────┐
│  Supabase   │  Database + pgvector
│  (Database) │  - Vector search
└─────────────┘
```

## Target Architecture (Vercel-Only)

```
┌─────────────┐
│   Vercel    │  Next.js Frontend
│  (All-in-1) │  + API Routes (full logic)
│             │  - Embeddings (OpenAI API)
│             │  - RAG Orchestration (TypeScript)
└──────┬──────┘
       │
       │ SQL + RPC
       ▼
┌─────────────┐
│  Supabase   │  Database + pgvector
│  (Database) │  - Vector search
└─────────────┘
```

## Summary

**Can you deploy only to Vercel?** 
- **Not yet** - Need Python for embeddings
- **Soon** - If you switch to OpenAI embeddings API

**Should you migrate now?**
- **No** - Current setup works fine
- **Maybe later** - When you want simpler deployment

**Current recommendation:** Keep hybrid approach, migrate when ready! 🚀

