# Learnings — LLM Apps, Edge Functions & Full-Stack Debugging

Hard-won lessons from building Espresso (podcast RAG + AI chat). Reference this before starting any new LLM-powered project.

---

## 1. Node.js `fetch` ≠ `curl` (SSL / TLS)

**Problem:** `curl` to Supabase worked fine, but `fetch()` inside a Next.js API route threw `"fetch failed"` with zero detail.

**Root cause:** Node.js (v18+) uses its own bundled CA certificate store, NOT the system store. Corporate proxies/firewalls that re-sign HTTPS traffic with a custom CA will break Node.js `fetch` with `UNABLE_TO_GET_ISSUER_CERT_LOCALLY`.

**Fix:**
```bash
# In package.json dev script
"dev": "NODE_TLS_REJECT_UNAUTHORIZED=0 next dev -p 3001"
```
```typescript
// Or in the route handler (non-production only)
if (process.env.NODE_ENV !== 'production') {
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'
}
```

**Lesson:** When `fetch` fails silently, always test with raw Node.js first:
```bash
node -e "fetch('https://your-url.com').then(r => console.log(r.status)).catch(e => console.error(e.message, e.cause))"
```
The `.cause` property on fetch errors reveals the real TLS/DNS/network issue.

---

## 2. Never Use a Bare `catch` for API Routes

**Problem:** The original route had one giant `try/catch` that returned `{ error: "Internal server error" }` for everything — JSON parse failures, config issues, network errors, and upstream failures all looked identical.

**Fix:** Isolate each step with its own error handling:
```typescript
// Step 1: Parse body
let body
try { body = await request.json() }
catch { return json(400, { error: 'Invalid request body' }) }

// Step 2: Fetch upstream
let response
try { response = await fetch(url, opts) }
catch (err) {
  return json(502, {
    error: 'Unable to reach service',
    debug: process.env.NODE_ENV === 'development' ? err.message : undefined
  })
}

// Step 3: Relay response (no try/catch needed — already safe)
```

**Lesson:** Each external call (JSON parse, fetch, DB query) should have its own catch with a *specific* status code and message. Include `debug` details in development mode.

---

## 3. Use Web Crypto API, Not Node.js `crypto`

**Problem:** `import { createHash } from 'crypto'` works in Node.js runtime but fails in Edge runtime. If a Next.js route ever gets switched to `export const runtime = 'edge'`, it breaks.

**Fix:** Use the Web Crypto API — works everywhere (Node.js 18+, Edge, Deno, browsers):
```typescript
async function sha256Hex(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value)
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return Array.from(new Uint8Array(digest))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
}
```

**Lesson:** Prefer Web APIs (`crypto.subtle`, `TextEncoder`, `Response`) over Node.js built-ins when writing code that might run in multiple runtimes.

---

## 4. Database CHECK Constraints Silently Reject Inserts

**Problem:** The `ai_usage_logs.status` column had a CHECK constraint allowing `success | rejected | failed | fallback`. The Edge Function also inserted `'clarification'` — which was silently dropped by Supabase (no throw, just `{ error }` in the response).

**Fix:** Always audit CHECK constraints when adding new enum values:
```sql
ALTER TABLE ai_usage_logs DROP CONSTRAINT ai_usage_logs_status_check;
ALTER TABLE ai_usage_logs ADD CONSTRAINT ai_usage_logs_status_check
  CHECK (status = ANY (ARRAY['success','rejected','failed','fallback','clarification']));
```

**Lesson:** Supabase JS client does NOT throw on constraint violations — it returns `{ data: null, error: {...} }`. If you're not checking the `error` field, inserts silently fail. Always check `error` or at minimum add `.throwOnError()`.

---

## 5. Edge Function Logs Are Your Best Friend

**Problem:** We couldn't tell if the Edge Function was even being called.

**Debugging flow:**
1. Check Edge Function logs — if no entries, the request never reached Supabase
2. If entries exist with errors, the problem is inside the function
3. If no entries at all, the problem is the caller (network, auth, URL)

**Lesson:** Always check the logs FIRST before reading code. The presence or absence of log entries immediately narrows the problem space by 50%.

---

## 6. Supabase Edge Function Auth: `verify_jwt` + Anon Key Works

**Setup:**
- Edge Function has `verify_jwt: true`
- Caller uses the **anon key** (a valid JWT) in `Authorization: Bearer <key>` and `apikey: <key>`
- Edge Function internally uses `SUPABASE_SERVICE_ROLE_KEY` (auto-injected by Supabase) for DB access

**This works** because:
- The anon key IS a valid JWT → passes `verify_jwt` check
- The service role key inside the function bypasses RLS → full DB access
- The caller never needs the service role key

**Lesson:** For public-facing Edge Functions, `verify_jwt: true` + anon key is the right pattern. The service role key stays server-side only.

---

## 7. RLS + Service Role Key Interaction

**Setup:**
- `usage_limits` table has RLS policy: `qual: "false"` (blocks ALL client access)
- Edge Function uses `createClient(url, SERVICE_ROLE_KEY)` → bypasses RLS entirely

**Lesson:** Service role key bypasses ALL RLS policies. This is by design — it's for server-side trusted code only. RLS policies that say `false` for all operations are specifically meant to block direct client access while allowing server-side Edge Functions full access.

---

## 8. LLM Structured Output: Always Parse Defensively

```typescript
// BAD — trusts LLM output
const result = JSON.parse(await geminiChat(...))
return result.answer

// GOOD — defensive parsing with fallback
try {
  const parsed = JSON.parse(raw)
  return {
    answer: String(parsed.answer ?? ''),
    hasSufficientEvidence: Boolean(parsed.has_sufficient_evidence ?? true),
  }
} catch {
  return { answer: raw.trim(), hasSufficientEvidence: true }
}
```

**Lesson:** Even with `responseSchema` / structured output mode, LLMs occasionally return malformed JSON, extra whitespace, or markdown-wrapped JSON. Always wrap parsing in try/catch with a sensible fallback.

---

## 9. Rate Limiting Pattern for Serverless LLM Apps

```
User → Next.js Route → Edge Function → LLM API
         ↓                    ↓
    Hash IP+UA          Check usage_limits table
    as user_key         (per-minute + per-day + duplicate detection)
```

**Key design choices:**
- Hash `IP + User-Agent` as anonymous user key (no auth required)
- Store rate limits in DB (survives function cold starts)
- Check limits BEFORE calling the LLM (save money)
- Duplicate detection: hash the input, reject if same hash within 2 minutes
- Return `credits_remaining` in every response so the UI can show usage

---

## 10. Next.js `fetch` Caching Gotcha

Next.js 14 extends `fetch` with caching. In route handlers:
- `GET` requests are cached by default
- `POST` requests are NOT cached (safe for mutations)
- If you ever use `GET` to call an external API from a route handler, add `{ cache: 'no-store' }` or `{ next: { revalidate: 0 } }`

---

## 11. Debugging Checklist for "500 Internal Server Error"

When you see a generic 500 and don't know where it's coming from:

1. **Check Edge Function / backend logs** — was the downstream service even called?
2. **Test the downstream service directly** — `curl` it to isolate the problem
3. **Test Node.js `fetch` separately** — run `node -e "fetch(...).catch(e => console.error(e.cause))"` to check for TLS/DNS issues
4. **Add step-by-step error handling** — replace one big try/catch with isolated catches per step
5. **Check database constraints** — CHECK, NOT NULL, UNIQUE, FK constraints can silently reject operations
6. **Check RLS policies** — even if the query looks right, RLS might block it
7. **Check environment variables** — `process.env.X || fallback` won't catch empty strings

---

*Last updated: Feb 11, 2026*

