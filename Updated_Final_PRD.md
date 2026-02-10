# Espresso — Product Requirements Document (v2)

> Last updated: February 2026
> Status: Active — frontend redesign complete, concept pipeline and RAG wiring in progress.

---

## 1. Product Definition

Espresso is a knowledge product that:

- distills long-form podcast conversations into clear, well-written concepts
- allows users to query the collective knowledge of podcast guests via chat
- always grounds answers in real people, real episodes, real references

**Starting point:** Lenny's Podcast (302 episodes, 284 guests ingested)
**Future-ready:** multiple podcasts, same structure.

---

## 2. Product Philosophy (Non-Negotiable)

1. **Judgment over volume** — Fewer concepts, better written, clearly reasoned.
2. **Traceability over confidence** — Every claim points back to guests and episodes.
3. **Structure first, intelligence second** — Chat enhances understanding; it does not replace curation.
4. **No generic AI behavior** — If it feels like "ask ChatGPT", the product failed.

---

## 3. User Mental Model

A user comes to Espresso to:

- understand how experienced operators think
- see where smart people agree and disagree
- ask nuanced questions and get grounded answers

They are **not** here to: skim summaries, consume feeds, or chat aimlessly.

---

## 4. Information Architecture

```
Landing Page (Podcast Selector)
└── [podcast-slug] (Podcast Page)
    ├── Knowledge Base (Concepts — left column)
    │   └── Concept Card → /[podcast-slug]/concepts/[concept-slug]
    └── Ask the Collective (Chat — right column)
```

Only two surfaces inside a podcast. No third axis. No shortcuts.

---

## 5. Landing Page (Podcast Selector)

**Route:** `/`

**Purpose:** Answer one question — "Which body of expert thinking do you want to explore?"

**Current implementation:**
- Displays available podcasts as editorial cards (name, host, positioning line)
- No chat, no global search — this page is a doorway, not the product
- **Podcast Request Section** — collapsible at the bottom:
  - Anyone can vote on requested podcasts (localStorage-based voter dedup)
  - Sign-in (name + email, localStorage) required to submit a new request
  - Stored in `podcast_requests` + `podcast_request_votes` tables
  - Atomic `vote_for_podcast_request()` RPC prevents race conditions
- Footer with attribution and disclaimer

---

## 6. Podcast Page (Core Surface)

**Route:** `/[podcast-slug]`

Once inside a podcast (e.g. `/lennys-podcast`), the user sees a **tabbed, card-first layout**:

### Navigation

Sticky tabs at top (below global header):

| Tab | Purpose |
|---|---|
| **Insights** | Card-based discovery feed — scroll to discover, tap for depth |
| **Concepts** | Vertical list of editorial concept cards |
| **Chat** | Threaded, context-aware chat — no global free-for-all |

On mobile: tabs stay at top, thumb-friendly, no icons-only.

### Insights Tab (Default)

**Mental model:** "Scroll = discovery. Tap = depth."

**Feed:** Vertical, card-based. Each Insight Card contains:
- **Header:** Declarative title (bold) + signal badge (`High consensus`, `Split view`, `Emerging`)
- **Body:** 1–2 line takeaway (preview state, no charts)
- **Footer:** Guest count, episode count, "View breakdown →"

**Expanded Breakdown** (tapped card → modal on mobile, right panel on desktop):
- **Section A: Visual** — One chart (bar/support indicator), full width, directly labeled
- **Section B: What this means** — 2–3 bullet explanation, human-readable
- **Section C: Evidence** — Collapsed by default, max 4 visible, rest hidden
- **CTA:** "Discuss this in Chat" — deep-links to Chat tab with context

**Desktop enhancement:** 2-column view (left: feed, right: expanded insight). Mobile: single column, tap reveals breakdown.

### Concepts Tab

Grid or vertical list. Each concept = one card. Tap → definition + examples + linked insights. No graphs. Keep it calm.

### Chat Tab

Threaded. Context pinned at top: "You're discussing: [Insight title]". No global free-for-all chat.

---

## 7. Knowledge Base (Concepts)

### Definition

Concepts are editorial-quality explanations of recurring ideas discussed across episodes.

They are: synthesized, opinionated, referenced.
They are **not**: episode summaries, blog posts, AI-written filler.

### Concept Card

Displays on the Podcast Page. Each card shows:
- Title (serif, `Source Serif 4`)
- One-line judgment (sans-serif, `Inter`)
- Guest references (subtle, muted chips: `Guest Name · Ep NNN`)
- No images, no shadows

### Concept Page (`/[podcast-slug]/concepts/[concept-slug]`)

Full editorial layout. Each concept page includes:

1. **Core Explanation** — Clear, structured narrative
2. **Key Tensions** — Where guests disagree / advice depends on context
3. **References** — Guests (names) + Episodes (links), explicit
4. **CTA** — "Ask the Collective about this" → opens chat with concept context pre-loaded

### Explicit Exclusions

- No metrics (views, likes)
- No comments
- No infinite scroll

---

## 8. Ask the Collective (Chat)

### Definition

A scoped chat experience for querying the combined perspectives of all podcast guests. Bounded by transcripts, concepts, and extracted ideas.

### Chat Response Requirements (Critical)

Every response must contain:

1. **Direct Answer** — Clear, structured, no hedging language
2. **Attribution** — Guests cited by name, episodes cited explicitly
3. **Structure** — Consensus + Disagreement + Minority views (where they exist)
4. **Honesty** — If evidence is thin, say so. No hallucinated authority.

### Books in Chat

Books appear only via chat, always with context: who mentioned it, why, in what scenario. Books are supporting evidence, not core objects. Structured book data is available in `books` and `book_recommendations` tables for fast retrieval (not solely reliant on RAG).

### Chat UX Rules

- No empty "How can I help?" states
- Chat opens with context already loaded
- No typing indicators, no reactions, no emojis, no personality theatrics
- Tone: calm, confident, precise

---

## 9. Design System

### Visual Principles

1. Quiet confidence
2. Editorial over playful
3. Motion only when it adds meaning
4. If anything draws attention to itself, it's probably wrong

### Color

**Implemented in `tailwind.config.js`:**

| Token | Hex | Usage |
|---|---|---|
| `cream-50` | `#FDFCFB` | Base background |
| `cream-100` | `#FAF9F7` | Hover states |
| `charcoal-800` | `#1F2937` | Body text |
| `charcoal-900` | `#111827` | Headings |
| `accent-600` | `#EA580C` | Primary CTA, links, active state |
| `accent-50` through `accent-900` | Orange scale | Muted warm orange — one accent per podcast |

**Rules:**
- Neutral base (cream / light gray) — no gradients for attention
- Accent only for CTA, links, active state — never body text, never >15% of screen
- Footer links: charcoal by default, accent on hover only

### Typography

| Element | Font | Size |
|---|---|---|
| Concept titles, headings | `Source Serif 4` (serif) | 40–48px (H1), 28–32px (H2) |
| Body, UI labels, chat | `Inter` (sans-serif) | 16–18px |
| Meta / small | `Inter` | 13–14px |

Line height: 1.6–1.7 for long text, 1.3–1.4 for UI labels.

### Layout

- Max content width: 720–760px for reading
- Chat can go wider (900px)
- Wide margins, clear hierarchy, reading-first design
- Spacing scale: 8px base (4, 8, 16, 24, 32, 48)

### Components

- **Insight Card** — Signal badge + declarative title + takeaway + footer (guest/episode counts + "View breakdown →"). White bg, charcoal border, rounded-xl.
- **Insight Breakdown** — Expanded view: support bar, "What this means" bullets, evidence list (collapsed by default), "Discuss in Chat" CTA.
- **Signal Badge** — Colored dot + label. Variants: `High consensus` (green), `Split view` (amber), `Emerging` (blue). Small, rounded-full.
- **Concept Card** — Title + judgment + guest chips. No images, no shadows. Bottom border style.
- **Reference Chip** — Text-only, light border, muted bg: `Lenny Rachitsky · Ep 134`
- **Chat Answer Block** — Answer → divider → references grouped below. No bubbles, no avatars.
- **Tab Bar** — Sticky below header. Text tabs with underline active indicator. Charcoal-900 active, charcoal-400 inactive.
- **Primary Button** — Charcoal-900 bg, white text, 8px radius, generous padding
- **Accent Button** — Muted orange bg, white text, 8px radius
- **Secondary Button** — Text-only, underlined on hover

### What to Avoid

- Neon gradients, AI purple/cyan glow, cards with drop shadows
- Busy backgrounds, "futuristic" UI tropes, bounce/spring animations
- Overuse of accent color

---

## 10. System Architecture

### Stack

| Layer | Technology |
|---|---|
| Frontend | Next.js 14 (App Router) on Vercel |
| Backend | Supabase (PostgreSQL + pgvector + RLS + Auth) |
| AI | OpenAI (embeddings + completion), Gemini (extraction) |
| Vector storage | pgvector in Supabase |
| Styling | Tailwind CSS + @tailwindcss/typography |

No custom backend services.

### Where Code Runs

| Process | Runtime | Purpose |
|---|---|---|
| **Ingestion pipeline** | Local Python scripts | Transcript parsing, LLM extraction, chunking, embedding |
| **Book extraction** | Local Python (Gemini) | Extract book recommendations from lightning round data |
| **Chat API** | Vercel API Routes | Embed query → retrieve chunks → assemble prompt → call LLM → return response |
| **Frontend** | Next.js (server + client) | UI rendering, Supabase client queries |

### Data Flow

```
Podcast audio → Transcript (markdown files in /episodes/)
  → Ingest: extract guests, episodes, segments, lightning round, sponsors (Gemini)
  → Chunk interview segments → embed → store in chunk_embeddings
  → Extract themes → cluster → store in themes + theme_extractions
  → (Future) Distill clusters into Concepts → store in concepts table

User chat → Embed query → Retrieve chunks + concepts → LLM answer → References
```

---

## 11. Data Model (Supabase — Actual Schema)

### Active Tables (`public` schema)

#### Ingestion / Transcript Data

| Table | Rows | Purpose |
|---|---|---|
| `guests` | 284 | Guest info: name, current role/company, previous roles (JSONB), fun facts (JSONB) |
| `episodes` | 302 | Episode metadata: title, publish date, YouTube URL/ID, duration, view count, keywords (JSONB), transcript hash (idempotency) |
| `segments` | 6,249 | Transcript segments by type: `intro`, `sponsor`, `interview`, `lightning_round`, `outro` |
| `lightning_round_answers` | 246 | Structured Q&A: books, entertainment, interview question, products, productivity tip, life motto |
| `sponsor_mentions` | 812 | Sponsor ads: name, content, CTA URL, position |

#### Books

| Table | Rows | Purpose |
|---|---|---|
| `books` | 530 | Book catalog: title, author, genre, AI-generated summary |
| `book_recommendations` | 640 | Guest → Book link with quote and context. FK to `books.id` and `guests.id` |

**Decision:** Books and book recommendations are kept as structured tables (not solely via RAG). They power fast retrieval for chat ("What are the best books for PMs?") and potential future book-browsing UI.

#### Knowledge / RAG

| Table | Rows | Purpose |
|---|---|---|
| `chunk_embeddings` | 0* | Vector embeddings of interview chunks for RAG similarity search |
| `themes` | 57 | Clustered themes from transcript analysis (label, example phrases, centroid embedding) |
| `theme_extractions` | 27,965 | Per-chunk theme signals: semantic descriptors, core thesis, confidence |
| `guest_theme_strengths` | 0* | Guest ↔ theme strength mapping |
| `chunk_theme_assignments` | 0* | Chunk ↔ theme assignments |

*\*To be populated during concept pipeline execution.*

**Note:** `themes` and `theme_extractions` were cleaned to remove non-interview content (promotions, outro themes). Only interview-derived themes are retained for concept generation.

#### Community / Engagement

| Table | Rows | Purpose |
|---|---|---|
| `podcast_requests` | 0 | Visitor-submitted podcast requests (name, host, URL) |
| `podcast_request_votes` | 0 | Vote dedup: one vote per voter per request (localStorage UUID) |
| `podcasts` | 2 | Legacy podcast listing (from old Panels product — still referenced but will be superseded) |
| `user_podcast_votes` | 0 | Legacy voting table (Panels product — tied to Supabase Auth) |

#### Future Tables (Not Yet Created)

| Table | Purpose |
|---|---|
| `concepts` | Editorial concept articles: podcast_id, title, slug, body, created_at |
| `concept_references` | concept_id ↔ guest_id ↔ episode_id |
| `concept_chunks` | concept_id ↔ chunk_id (for RAG linking) |
| `chat_sessions` | Chat session tracking: podcast_id, created_at |
| `chat_messages` | Messages: session_id, role (user/system), content, references |

### Archived Tables (`archive` schema)

These belong to the old "Panels" product and are preserved but no longer used:

| Table | Rows | Notes |
|---|---|---|
| `panels` | 60 | Curated expert panel topics |
| `panel_themes` | 57 | Panel ↔ theme mapping |
| `panel_guests` | 771 | Panel ↔ guest mapping |
| `discussions` | 456 | Panel discussion threads |
| `perspectives` | 1,186 | Guest perspectives within discussions |
| `discussion_takeaways` | 0 | Takeaways from discussions |
| `panel_valuable` | 0 | User "mark valuable" votes |

---

## 12. Intelligence Layer (RAG)

### How RAG Works

1. User asks a question
2. System embeds query (OpenAI embeddings)
3. Searches relevant chunks (transcripts + concepts) via pgvector similarity
4. Top N chunks injected into prompt (6 concept chunks + 12 transcript chunks)
5. LLM generates answer constrained by evidence
6. References extracted from chunk metadata (guest_id, episode_id)

### Hybrid RAG Strategy

| Source | Weight | Purpose |
|---|---|---|
| Concept chunks | Higher | High-level synthesis, editorial quality |
| Transcript chunks | Standard | Raw grounding, specific quotes |

Together they reduce hallucination.

### Answer Generation (Strict Prompt)

The model is instructed to:
- Answer only using provided evidence
- Structure: Direct answer → Consensus → Disagreement → Minority views
- Cite guests + episodes inline
- If evidence is insufficient → say so explicitly

### Citation Handling

Citations are **not** post-processed guesses. Each chunk carries:
- `guest_id`, `episode_id`, `speaker`, `timestamp`

When a chunk is used, its metadata is attached → references aggregated at end.

---

## 13. Insight Extraction Pipeline (Technical)

### Overview

Insights are quantified, countable patterns extracted from podcast transcripts. They are **not** commentary — they survive being reduced to a single sentence.

### Pipeline Steps

1. **Structured Ingestion** — Each episode broken into speaker turns, timestamped segments, with metadata (guest role, topic tags, episode date). No raw blobs.

2. **Atomic Claim Extraction** — From each segment, extract claims (not summaries). Each claim: text, speaker, confidence score (LLM-generated), topic tag.

3. **Claim Clustering** — Group semantically similar claims using embeddings + thresholded similarity + human-defined topic guardrails. Output: claim cluster = potential Insight.

4. **Quantification** — For each cluster: number of unique guests, number of episodes, time distribution, guest-type splits. If it's not countable, it's not an Insight.

5. **Insight Qualification** — Only promote clusters meeting thresholds (≥ X guests, ≥ Y episodes, clear semantic coherence). Everything else becomes a Concept or stays hidden.

6. **Insight Generation (LLM, constrained)** — LLM names the Insight (declarative), writes 1–2 line takeaway, explains "what this means". Model cannot invent claims — only summarize what's in the cluster.

7. **Ongoing Refresh** — As new episodes land: re-score clusters, update trends, flag Emerging / Fading / Stable insights.

### Signal Badges

| Badge | Meaning |
|---|---|
| `High consensus` | Strong agreement across many guests |
| `Split view` | Guests meaningfully disagree |
| `Emerging` | New pattern appearing in recent episodes |

---

## 14. Concept Extraction Pipeline (Technical)
<!-- Note: Insight pipeline is section 13; Concept pipeline is section 14 -->

### Overview

Concepts are not auto-generated in one pass. They are: extracted → clustered → distilled → curated.

### Pipeline Steps

1. **Chunking** — Interview segments split into 300–500 token chunks at speaker turns / topic shifts. Each chunk stores: episode_id, guest_id(s), timestamp range. **Only `interview` segments are used** (promotions, outros excluded).

2. **Signal Extraction (LLM)** — For each chunk, lightweight LLM call extracts 1–3 candidate concept signals (label + 1-line description). Stored in `theme_extractions`.

3. **Clustering (deterministic)** — Cluster by embedding similarity of descriptions + label normalization + frequency across episodes. No LLM here — just grouping. Stored in `themes`.

4. **Distillation (human-in-the-loop)** — For each cluster: surface representative chunks, guests involved, disagreements. LLM drafts concept as an editor (not author). Human edits, sharpens, locks. This is where quality is won.

5. **Storage** — Final concept stored with: canonical title, body, references (guests + episodes), linked chunks.

### Idempotency

- SHA256 hash of transcript content stored in `episodes.transcript_hash`
- Pipeline skips already-processed transcripts

---

## 15. Frontend Architecture

### Routes

| Route | Component | Type | Purpose |
|---|---|---|---|
| `/` | `page.tsx` | Server | Landing page — podcast selector + request section |
| `/[podcast-slug]` | `[podcast-slug]/page.tsx` | Server + Client | Podcast page — tabbed Insights / Concepts / Chat |
| `/[podcast-slug]/concepts/[slug]` | `concepts/[slug]/page.tsx` | Server | Individual concept page |
| `/api/chat` | `api/chat/route.ts` | API | Chat endpoint (mock → will wire to RAG) |
| `/api/concepts` | `api/concepts/route.ts` | API | Concepts endpoint |

### Key Components

| Component | Location | Client? | Purpose |
|---|---|---|---|
| `PodcastTabs` | `components/` | Yes | Main tabbed layout (Insights / Concepts / Chat) with tab switching, insight selection, chat state |
| `InsightCard` | `components/insights/` | Yes | Insight feed card: signal badge, title, takeaway, footer |
| `InsightBreakdown` | `components/insights/` | Yes | Expanded insight view: visual, explanation, evidence, chat CTA |
| `ConceptCard` | `components/concepts/` | No | Concept card for Knowledge Base list |
| `ChatPanel` | `components/chat/` | Yes | Floating chat panel (legacy — replaced by Chat tab in PodcastTabs) |
| `ChatInterface` | `components/chat/` | Yes | Standalone chat input + message display |
| `PodcastRequestSection` | `components/` | Yes | Collapsible podcast request + voting |
| `Footer` | `components/` | Yes | Attribution + disclaimer |

### Legacy Components (to be cleaned up)

These are from the old Panels product and are no longer routed to:

- `components/panels/*` — DiscussionCard, StarButton, PanelExperts, etc.
- `components/AuthModal.tsx` — Supabase Auth modal (may be repurposed)
- `components/GroupChat.tsx`, `SplitChat.tsx` — Old chat implementations
- `components/CampfireAnimation.tsx`, `CampfireLogo.tsx`, `Fireflies.tsx` — Old branding
- `app/lennys-podcast/` — Old panels routing
- `app/chat/[podcast]/` — Old chat routing
- `app/api/panels/*` — Old panel API routes
- `lib/types/panel.ts` — Old panel TypeScript types

### Supabase Client

- **Browser client:** `lib/supabase.ts` — uses `NEXT_PUBLIC_SUPABASE_URL` + anon key
- **Server clients:** Created inline in API routes with service role key when needed

---

## 16. Scripts & Pipelines

| Script | Purpose | Status |
|---|---|---|
| `ingest_transcripts.py` | Parse transcripts → extract guests, episodes, segments, lightning round, sponsors via Gemini | ✅ Complete (302 episodes) |
| `chunk_interview_segments.py` | Chunk interview segments for vector DB | ✅ Complete |
| `build_knowledge_base.py` | Extract themes, cluster, embed | ✅ Partially complete |
| `extract_books_with_gemini.py` | Extract book recommendations from lightning round data via Gemini | ✅ Complete (530 books, 640 recommendations) |
| `prepare_books_supabase_payload.py` | Prepare book data for Supabase upload | ✅ Complete |
| `backfill_lightning_round.py` | Backfill missing lightning round answers | ✅ Complete |
| `backfill_missing_data.py` | Backfill other missing data | 🔄 In progress |
| `generate_panels.py` | Old Panels product — generates panel discussions | 🗄️ Legacy |
| `generate_discussions.py` | Old Panels product — generates discussions | 🗄️ Legacy |
| `generate_panel_slugs.py` | Old Panels product — slug generation | 🗄️ Legacy |

---

## 17. Security & Guardrails

- No raw transcript sent to client
- No OpenAI/Gemini keys in frontend (server-side only)
- RLS enabled on all public tables
- Prompt instructions enforced server-side
- Vote dedup via unique constraints + localStorage UUID

---

## 18. Implementation Status

| Feature | Status | Notes |
|---|---|---|
| Transcript ingestion | ✅ Done | 302 episodes, 284 guests, 6,249 segments |
| Lightning round extraction | ✅ Done | 246 episodes with lightning round data |
| Book extraction | ✅ Done | 530 books, 640 recommendations |
| Theme extraction | ✅ Done | 57 themes, 27,965 extractions (cleaned of non-interview content) |
| Landing page (Podcast Selector) | ✅ Done | Editorial design, podcast cards |
| Podcast request + voting | ✅ Done | Collapsible section, anonymous voting, lightweight sign-in for requests |
| Podcast page (tabbed layout) | ✅ Done | Insights / Concepts / Chat tabs, card-first, mobile-first |
| Insight Card component | ✅ Done | Signal badge, declarative title, takeaway, guest/episode counts |
| Insight Breakdown component | ✅ Done | Visual, explanation, evidence (collapsed), chat CTA |
| Concept Card component | ✅ Done | Serif title, judgment, reference chips |
| Concept Page | ✅ Done | Full editorial layout (mock data) |
| Chat Tab (in-page) | ✅ Done | Threaded, context-pinned, no floating — replaces old ChatPanel |
| Design system (Editorial) | ✅ Done | Cream/charcoal/accent palette, Source Serif 4 + Inter, signal badges, tab bar |
| Footer | ✅ Done | Attribution, disclaimer, editorial styling |
| Wire concepts to Supabase | ⏳ Pending | Need to create concepts table + populate |
| Wire chat to RAG | ⏳ Pending | Need to connect ChatInterface to real RAG engine |
| Chunk embeddings | ⏳ Pending | chunk_embeddings table exists but needs population |
| Concept distillation pipeline | ⏳ Pending | Human-in-the-loop editing of clustered themes |
| Legacy cleanup | ⏳ Pending | Remove old Panels components, routes, API endpoints |
| Dark mode | ❌ Not planned | Ship light mode first (better for reading, matches editorial tone) |

---

## 19. What Makes Espresso Defensible

- Editorial judgment
- Traceability
- Structured synthesis
- Trust built over time

**Not:** model choice, UI cleverness, AI branding.

---

## Final Product Test

If users say: *"This feels like how smart people actually reason, not just what they say."*
→ Espresso is working.

If they say: *"This is an AI summary tool."*
→ You missed the point.
