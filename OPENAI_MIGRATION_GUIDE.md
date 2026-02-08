# OpenAI Embeddings Migration Guide

## ✅ Migration Complete!

You've successfully migrated from Python backend to Vercel-only deployment using OpenAI embeddings.

## What Changed

### 1. **Supabase Schema Updated** ✅
- Vector dimension changed from 384 → 1536 (OpenAI embeddings)
- `match_chunks` function updated to accept 1536-dim vectors
- HNSW index recreated for new dimension

### 2. **TypeScript Libraries Created** ✅
- `lib/embeddings.ts` - OpenAI embeddings generation
- `lib/supabase-vector-search.ts` - Vector search via Supabase
- `lib/rag-engine.ts` - RAG response generation
- `lib/intelligence.ts` - Theme matching & guest selection
- `lib/lenny-moderator.ts` - Clarification questions

### 3. **API Routes Updated** ✅
- `/api/query` - Now uses TypeScript RAG (no Python backend needed)
- `/api/split-chat` - Now uses TypeScript RAG

## Next Steps

### Step 1: Add Environment Variable

Add to your `.env.local` file in the `frontend/` directory:

```bash
OPENAI_API_KEY=sk-your-openai-api-key-here
```

Get your API key from: https://platform.openai.com/api-keys

### Step 2: Re-embed Knowledge Base

**Important:** Your existing embeddings are 384 dimensions (sentence-transformers), but OpenAI uses 1536 dimensions. You need to re-embed everything.

#### Option A: Update Build Script (Recommended)

Update `scripts/build_knowledge_base.py` to use OpenAI embeddings instead of sentence-transformers.

**Quick fix:** Create a new script or modify the existing one to:
1. Use OpenAI embeddings API
2. Generate 1536-dim embeddings
3. Save to Supabase `chunk_embeddings` table

#### Option B: Use Existing Python Script (Temporary)

If you want to keep using the Python build script temporarily:
1. The schema is already updated to 1536 dimensions
2. You'll need to modify the build script to use OpenAI embeddings
3. Or wait until we create a migration script

### Step 3: Test the Migration

1. **Start the frontend:**
   ```bash
   cd frontend
   npm run dev
   ```

2. **Test the query endpoint:**
   ```bash
   curl -X POST http://localhost:3001/api/query \
     -H "Content-Type: application/json" \
     -d '{"query": "How do I build a great product?"}'
   ```

3. **Check for errors:**
   - If you see "No matching themes found", you need to re-embed the knowledge base
   - If you see embedding errors, check your `OPENAI_API_KEY`

### Step 4: Deploy to Vercel

1. **Push to GitHub:**
   ```bash
   git add .
   git commit -m "Migrate to OpenAI embeddings for Vercel-only deployment"
   git push
   ```

2. **Deploy on Vercel:**
   - Connect your GitHub repo to Vercel
   - Add environment variable: `OPENAI_API_KEY`
   - Deploy!

3. **No Python backend needed!** 🎉

## Cost Estimation

**OpenAI Embeddings:**
- `text-embedding-3-small`: $0.02 per 1M tokens
- Average query: ~10 tokens → $0.0000002 per query
- 1M queries: ~$0.20

**Very affordable!** Much cheaper than running a Python backend server.

## Troubleshooting

### Error: "OPENAI_API_KEY is not set"
- Add `OPENAI_API_KEY` to your `.env.local` file
- Restart the dev server

### Error: "No matching themes found"
- You need to re-embed your knowledge base with OpenAI embeddings
- The existing 384-dim embeddings won't work with the new 1536-dim system

### Error: "Vector dimension mismatch"
- Make sure you ran the Supabase migration
- Check that `chunk_embeddings.embedding` is `vector(1536)`

## Architecture Comparison

### Before (Hybrid)
```
Frontend (Vercel) → Python Backend (Railway) → Supabase
```

### After (Vercel-Only)
```
Frontend (Vercel) → Supabase
```

**Simpler, cheaper, faster!** 🚀

## Files Modified

1. ✅ `frontend/lib/embeddings.ts` - New
2. ✅ `frontend/lib/supabase-vector-search.ts` - New
3. ✅ `frontend/lib/rag-engine.ts` - New
4. ✅ `frontend/lib/intelligence.ts` - New
5. ✅ `frontend/lib/lenny-moderator.ts` - New
6. ✅ `frontend/app/api/query/route.ts` - Updated
7. ✅ `frontend/app/api/split-chat/route.ts` - Updated
8. ✅ `frontend/package.json` - Added `openai` package
9. ✅ Supabase schema - Updated to 1536 dimensions

## Next: Re-embed Knowledge Base

The final step is to re-embed your knowledge base with OpenAI embeddings. Would you like me to:
1. Create a migration script to re-embed existing chunks?
2. Update the build script to use OpenAI embeddings?
3. Both?

Let me know and I'll help you complete the migration! 🎯

