# Gemini/Google Embeddings for Vercel Deployment

## Short Answer: ⚠️ Not as Simple as OpenAI

**Gemini doesn't have a direct embeddings API** like OpenAI does. However, Google does offer embedding models, but they're more complex to use.

## The Problem

1. **Gemini = Text Generation Only**
   - Gemini is for generating text (like GPT)
   - It doesn't have an embeddings endpoint

2. **Google Embeddings = Separate Service**
   - Google has embedding models (like `text-embedding-004`)
   - But they're accessed via **Vertex AI** (more complex)
   - Not as simple as OpenAI's `embeddings.create()` API

## Options for Vercel-Only Deployment

### Option 1: OpenAI Embeddings ✅ (Easiest)

**Pros:**
- Simple API: `openai.embeddings.create()`
- Works directly from Node.js/TypeScript
- Well-documented
- Same API key you might already have

**Cons:**
- Costs money (~$0.0001 per 1K tokens)
- Different model (1536 dims vs your current 384)

**Code:**
```typescript
import OpenAI from 'openai'

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

const response = await openai.embeddings.create({
  model: 'text-embedding-3-small', // 1536 dimensions
  input: 'Your text here'
})

const embedding = response.data[0].embedding
```

### Option 2: Google Vertex AI Embeddings ⚠️ (Complex)

**Pros:**
- Free tier available
- Google's embedding models

**Cons:**
- Requires Vertex AI setup (more complex)
- Need Google Cloud account
- More setup than OpenAI
- May require service account keys

**Code (more complex):**
```typescript
import { VertexAI } from '@google-cloud/vertexai'

const vertexAI = new VertexAI({
  project: 'your-project-id',
  location: 'us-central1'
})

const model = vertexAI.preview.getGenerativeModel({
  model: 'text-embedding-004'
})

// More complex setup needed
```

### Option 3: Keep Python Backend (Current) ✅ (Simplest)

**Pros:**
- Already works
- Free (sentence-transformers)
- No API costs
- No changes needed

**Cons:**
- Need to deploy Python backend
- More complex architecture

## Recommendation

**For Vercel-only deployment:**
- **Use OpenAI embeddings** - Simplest path
- Or keep Python backend for now

**Why not Google embeddings?**
- More complex setup
- Requires Google Cloud account
- Not as straightforward as OpenAI
- Gemini doesn't have embeddings API

## Migration Path (If Using OpenAI)

1. **Switch to OpenAI embeddings:**
   ```typescript
   // frontend/app/api/query/route.ts
   import OpenAI from 'openai'
   
   const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
   
   // Generate query embedding
   const embedding = await openai.embeddings.create({
     model: 'text-embedding-3-small',
     input: userQuery
   })
   ```

2. **Re-embed knowledge base:**
   - Update build script to use OpenAI
   - Re-run: `python scripts/build_knowledge_base.py --use-openai`

3. **Update Supabase schema:**
   ```sql
   ALTER TABLE chunk_embeddings 
   ALTER COLUMN embedding TYPE vector(1536);
   ```

4. **Update match_chunks function:**
   ```sql
   CREATE OR REPLACE FUNCTION match_chunks(
       query_embedding vector(1536), -- Changed from 384
       ...
   )
   ```

## Summary

| Option | Vercel-Only? | Complexity | Cost |
|-------|--------------|------------|------|
| **OpenAI Embeddings** | ✅ Yes | Low | ~$0.0001/1K tokens |
| **Google Vertex AI** | ✅ Yes | High | Free tier available |
| **Python Backend** | ❌ No | Low | Free |

**Bottom line:** Gemini doesn't have embeddings. Use OpenAI for Vercel-only, or keep Python backend.

