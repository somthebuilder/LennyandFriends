# Resume: Concept Article Generation Pipeline

> Last updated: Feb 11, 2026 — Session ended with nohup process running (PID 75163)

---

## Current State

### What's Done
| Item | Status | Details |
|------|--------|---------|
| **Embeddings** | ✅ Complete | All `chunk_embeddings` backfilled (Gemini text-embedding-004, 1536 dim) |
| **Insights** | ✅ 12 inserted | `gemini-2.5-flash`, `guest_count >= 2` enforced |
| **Concepts (initial)** | ✅ 20 extracted | Short-form bodies (150-600 words) with references |
| **Concept articles (1-4)** | ✅ Expanded | First run: 1119, 1240, 1292, 1151 words |
| **Concept articles (5+)** | 🔄 In progress | nohup process running, concept 5 done (1116 words) |

### What's Deployed (Supabase Edge Functions)
| Function | Version | Model | Description |
|----------|---------|-------|-------------|
| `ai_chat` | v3 | gpt-4.1-mini | RAG chat with rate limiting |
| `backfill_embeddings` | v5 | Gemini/OpenAI | Chunk embedding generation |
| `extract_concepts_insights` | v8 | gemini-2.5-flash | Initial concept/insight extraction |
| `generate_concept_article` | **v11** | **gemini-2.0-flash** | **Sectioned assembly + KNN enrichment** |

---

## How generate_concept_article v11 Works

### Architecture: 3-Batch Sectioned Assembly + KNN

```
Concept Title → Embed → KNN Search (12 similar chunks)
                                  ↓
              Stored refs + KNN refs = Enriched Reference Block
                                  ↓
              ┌─── Batch A (Sections 1-3) → ~400 words ───┐
              │    Batch B (Sections 4-6) → ~350 words     │→ Assemble → 800-1200 words
              └─── Batch C (Sections 7-9) → ~250 words ───┘
                                  ↓
                    Summary generation (small call)
                                  ↓
                    Validate headings → Persist to DB
```

### Key Design Decisions
- **Model**: `gemini-2.0-flash` (fast, reliable, cheap — NOT the thinking model)
- **3 small calls** per concept instead of 1 giant call
- **KNN enrichment**: Each concept gets ~12 semantically similar chunks via pgvector, even if it only has 1-2 stored references
- **Per-batch retry**: 2 Gemini attempts + OpenAI fallback
- **JSON output**: Tiny `{"content": "..."}` per batch — near 100% parse reliability
- **Word target**: 800-1200, max 1500
- **Structure**: 9 mandatory section headings (validated)
- **Inline quotes**: Interview excerpts woven between paragraphs

### 9 Section Headings
1. Concept Overview
2. Why This Concept Matters
3. How the Concept Works in Practice
4. Real-World Applications
5. Common Mistakes & Anti-Patterns
6. Advanced Insights & Nuances
7. How This Connects to Other Concepts
8. Key Takeaways (Actionable)
9. Source References

---

## How to Resume Tomorrow

### Step 1: Check if nohup process finished

```bash
# Check log
cat /Users/Shivanshu.Singh/Lennys/Lennyandfriends/lennys-podcast-transcripts/v11_remaining.log

# Check if process is still alive
ps -p 75163 -o pid,stat,etime 2>/dev/null || echo "Process completed"
```

### Step 2: See which concepts still need expansion

```sql
-- Run in Supabase SQL editor or via MCP
SELECT c.title,
       length(c.body) as body_chars,
       (length(c.body) - length(replace(c.body, ' ', ''))) + 1 as approx_words,
       CASE WHEN c.body ILIKE '%1. Concept Overview%' THEN 'v11' ELSE 'old' END as version
FROM concepts c
JOIN podcasts p ON c.podcast_id = p.id
WHERE p.slug = 'lennys-podcast'
ORDER BY c.created_at;
```

### Step 3: Re-run any remaining/failed concepts

```bash
cd /Users/Shivanshu.Singh/.cursor/worktrees/lennys-podcast-transcripts/ged

# Get concept IDs that still need expansion (< 800 words or old format)
# Then run for each:
python3 -c "
import json, urllib.request

BASE_URL = 'https://rhzpjvuutpjtdsbnskdy.supabase.co/functions/v1'
KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJoenBqdnV1dHBqdGRzYm5za2R5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAxNzQxMjUsImV4cCI6MjA4NTc1MDEyNX0.1PjJnJr33fJ41eavn5e6dSVUDwR0-2D5_d0SqyhndqM'
HEADERS = {'Authorization': f'Bearer {KEY}', 'apikey': KEY, 'Content-Type': 'application/json'}

CONCEPT_ID = '<paste-concept-id-here>'

payload = {
    'conceptId': CONCEPT_ID,
    'podcastSlug': 'lennys-podcast',
    'dryRun': False,
    'force': True,
    'minWords': 800,
    'knnChunks': 12,
}
req = urllib.request.Request(f'{BASE_URL}/generate_concept_article', data=json.dumps(payload).encode(), headers=HEADERS, method='POST')
with urllib.request.urlopen(req, timeout=120) as r:
    print(json.dumps(json.loads(r.read().decode()), indent=2))
"
```

### Step 4: Batch re-run for all remaining (nohup-safe)

```bash
cd /Users/Shivanshu.Singh/.cursor/worktrees/lennys-podcast-transcripts/ged

nohup python3 -u - <<'PIPELINE' > ~/v11_retry.log 2>&1 &
import json, urllib.request, urllib.error, datetime, time

BASE_URL = 'https://rhzpjvuutpjtdsbnskdy.supabase.co/functions/v1'
KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJoenBqdnV1dHBqdGRzYm5za2R5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAxNzQxMjUsImV4cCI6MjA4NTc1MDEyNX0.1PjJnJr33fJ41eavn5e6dSVUDwR0-2D5_d0SqyhndqM'
HEADERS = {'Authorization': f'Bearer {KEY}', 'apikey': KEY, 'Content-Type': 'application/json'}

def invoke(fn_name, payload, timeout=120):
    url = f'{BASE_URL}/{fn_name}'
    req = urllib.request.Request(url, data=json.dumps(payload).encode(), headers=HEADERS, method='POST')
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return r.status, json.loads(r.read().decode())
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read().decode())
    except Exception as e:
        return -1, {'error': str(e)}

def log(msg):
    print(f'[{datetime.datetime.utcnow().strftime("%H:%M:%S")}] {msg}', flush=True)

# Get all concepts
sb_url = 'https://rhzpjvuutpjtdsbnskdy.supabase.co/rest/v1'
sb_headers = {'apikey': KEY, 'Authorization': f'Bearer {KEY}', 'Content-Type': 'application/json'}
req = urllib.request.Request(f'{sb_url}/podcasts?slug=eq.lennys-podcast&select=id', headers=sb_headers)
with urllib.request.urlopen(req, timeout=30) as r:
    podcast_id = json.loads(r.read().decode())[0]['id']

req = urllib.request.Request(f'{sb_url}/concepts?podcast_id=eq.{podcast_id}&select=id,title,slug', headers=sb_headers)
with urllib.request.urlopen(req, timeout=30) as r:
    all_concepts = json.loads(r.read().decode())

log(f'Processing ALL {len(all_concepts)} concepts (force=True, will overwrite)')

success = failed = 0
for i, c in enumerate(all_concepts, 1):
    log(f'[{i}/{len(all_concepts)}] {c["title"]}')
    for attempt in range(2):
        status, body = invoke('generate_concept_article', {
            'conceptId': c['id'],
            'podcastSlug': 'lennys-podcast',
            'dryRun': False,
            'force': True,
            'minWords': 800,
            'knnChunks': 12,
        })
        if status == 200 and body.get('ok'):
            w = body.get('totalWords', 0)
            log(f'  OK: {w}w | {body.get("primaryModel","?")}')
            success += 1
            break
        elif attempt == 0:
            log(f'  RETRY...')
            time.sleep(5)
        else:
            log(f'  FAIL: {body.get("error",str(body)[:100])}')
            failed += 1
    time.sleep(3)

log(f'DONE: {success} ok, {failed} failed')
PIPELINE
echo "Started: $!"
```

---

## API Parameters Reference

### generate_concept_article (POST)

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `conceptId` | string | — | UUID of concept to expand |
| `conceptSlug` | string | — | Alternative: slug-based lookup |
| `podcastSlug` | string | `lennys-podcast` | Podcast context |
| `dryRun` | bool | `false` | If true, generates but doesn't save |
| `force` | bool | `false` | If true, overwrites even if already long enough |
| `minWords` | int | `800` | Minimum acceptable word count (500-1200) |
| `knnChunks` | int | `12` | Number of KNN-similar chunks to pull (0-20) |
| `geminiOnly` | bool | `false` | If true, no OpenAI fallback |

### extract_concepts_insights (POST)

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `podcastSlug` | string | `lennys-podcast` | — |
| `mode` | string | `both` | `insights`, `concepts`, or `both` |
| `dryRun` | bool | `false` | — |
| `sampleChunks` | int | `200` | Chunks to sample for extraction |
| `insightCount` | int | `10` | Target insights |
| `conceptCount` | int | `8` | Target concepts |
| `longform` | bool | `false` | Keep false; use `generate_concept_article` separately |
| `geminiOnly` | bool | `false` | — |
| `minGuestsPerInsight` | int | `2` | Minimum guests per insight |
| `minConceptWords` | int | `150` | Min words for initial concept body |

---

## Logs Location

| Log | Path |
|-----|------|
| Full pipeline (run 1) | `~/Lennys/Lennyandfriends/lennys-podcast-transcripts/full_pipeline_run.log` |
| Longform retry v9 | `~/Lennys/Lennyandfriends/lennys-podcast-transcripts/longform_retry_v9.log` |
| V11 sectioned (first 4) | `~/Lennys/Lennyandfriends/lennys-podcast-transcripts/v11_sectioned_run.log` |
| V11 remaining (nohup) | `~/Lennys/Lennyandfriends/lennys-podcast-transcripts/v11_remaining.log` |

---

## Git State

- **Branch**: `ged`
- **Last commit**: `8855ec6` — "feat: RAG system with sectioned concept articles, KNN enrichment, and insights pipeline"
- **Working tree**: Clean
- **Worktree path**: `/Users/Shivanshu.Singh/.cursor/worktrees/lennys-podcast-transcripts/ged`

---

## Results So Far (V11 Sectioned Assembly)

| # | Concept | Words | Model | KNN Refs |
|---|---------|-------|-------|----------|
| 1 | Clear Messaging in Fundraising | 1,119 | gemini-2.0-flash | 9 |
| 2 | Embedding Data Scientists | 1,240 | gemini-2.0-flash | 11 |
| 3 | Network Effects in Platform Success | 1,292 | gemini-2.0-flash | 7 |
| 4 | Leadership: Liked vs Respected | 1,151 | gemini-2.0-flash | 9 |
| 5 | $10 Game for Prioritization | 1,116 | gemini-2.0-flash | 11 |
| 6-20 | In progress (nohup PID 75163) | — | — | — |

**100% success rate so far. All within 800-1300 word range.**

