# 🎙️ Lenny Group Chat — Episode-Derived Multi-Guest RAG System

## 0. Core Idea (One Sentence)

A group chat where a user asks a question, and the system intelligently surfaces responses from the most relevant Lenny podcast guests, based entirely on what those guests have actually talked about, with Lenny acting as a moderator when context is missing.

Everything flows from this.

## 1. Non-Negotiable Principles (These guide every design choice)

- **Intent is not predefined**: No "career / growth / PM" buckets. Intent emerges from the podcast corpus itself.
- **Guests never hallucinate authority**: A guest can only speak on themes they've materially discussed.
- **Routing > Generation**: 70% of the system's intelligence is deciding who should speak. Generation is secondary.
- **No memory persistence**: Except: user name. All reasoning is stateless per request.
- **Lenny is a moderator, not an oracle**: He clarifies ambiguity. He doesn't dominate answers.

## 2. The Mental Model (Very Important)

Think of this system as three layers:

- **Layer 1: Knowledge Substrate (Offline)**
  - Transcripts
  - Themes
  - Guest–theme relationships

- **Layer 2: Intelligence & Routing (Runtime)**
  - Theme matching
  - Guest relevance scoring
  - Clarification detection

- **Layer 3: Interaction**
  - Group chat
  - Split chat (1:1)
  - Lenny moderation

If Layer 1 is weak, the whole thing collapses. So we start there.

## 3. Knowledge Substrate (Offline / Ingestion)

### 3.1 Raw Inputs
- GitHub repo of transcripts
- Each transcript includes:
  - Episode
  - Guest(s)
  - Speaker turns (ideally)

### 3.2 Chunking Strategy (Critical)
- **Chunk by idea, not token count**
- Prefer:
  - 1 speaker turn
  - or 1 coherent argument
- Target size:
  - 400–600 tokens
  - 50–80 token overlap
- Each chunk must be semantically self-contained.

### 3.3 Theme Extraction (The Heart of Intent)
For every chunk, run an offline LLM pass to extract:
```json
{
  "chunk_id": "c_00123",
  "guest_id": "patrick-collison",
  "episode_id": "ep_42",
  "semantic_descriptors": [
    "long-term thinking",
    "founder decision-making",
    "quality over speed"
  ],
  "core_thesis": "Founders should optimize for durability of decisions rather than speed of iteration."
}
```

These descriptors are not user-facing. They are the raw material for intent.

### 3.4 Theme Clustering (Emergent Intent Space)
- Embed all semantic_descriptors + core_thesis
- Cluster them (HDBSCAN strongly recommended)
- Output: ~30–60 emergent themes

Example theme object:
```json
{
  "theme_id": "T17",
  "label": "Decision-making under uncertainty",
  "centroid_embedding": [...],
  "example_phrases": [
    "making irreversible decisions",
    "judgment vs data",
    "bet sizing"
  ]
}
```

⚠️ Labels are optional and mostly for debugging. This theme set = your intent ontology.

### 3.5 Guest–Theme Strength Mapping
For every guest, compute:
```json
{
  "guest_id": "patrick-collison",
  "theme_strengths": {
    "T17": 0.92,
    "T05": 0.41,
    "T21": 0.12
  }
}
```

Strength is derived from:
- Number of chunks in theme
- Depth (thesis-level vs passing mention)
- Spread across episodes

This is precomputed once.

### 3.6 Vector Store
Each chunk stored with metadata:
```json
{
  "embedding": [...],
  "metadata": {
    "guest_id": "...",
    "episode_id": "...",
    "theme_id": "T17"
  }
}
```

Use:
- FAISS (simplest)
- or Chroma (if you want metadata filtering ergonomics)

## 4. Runtime Intelligence Flow

### Step 1: Theme Matching (Intent Detection)
- Embed user query
- Compare against theme centroids
- Select top N themes

Output:
```json
{
  "active_themes": [
    { "theme_id": "T17", "score": 0.78 },
    { "theme_id": "T09", "score": 0.61 }
  ]
}
```

This is intent.

### Step 2: Confidence & Ambiguity Check
Trigger Lenny clarification mode if:
- Top theme score < threshold (e.g. 0.6)
- OR top 2 themes are very close
- OR retrieved chunks contradict

This prevents garbage answers.

## 5. Lenny Clarification Mode
**Lenny's Role:**
- Ask 2–3 sharp questions
- Narrow the theme space
- Do not answer yet

Example:
- "Are you asking from a founder's perspective or as an IC?"
- "Is this about long-term decisions or short-term execution tradeoffs?"

Only after user responds does the pipeline continue.

## 6. Guest Selection Logic

Once themes are confident:

**Guest Scoring Formula:**
```
GuestScore = Σ (ThemeScore × GuestThemeStrength)
```

Then:
- Rank guests
- Apply diversity constraints
- Select top 5–10

This ensures:
- Relevance
- No "same voice 10 times"

## 7. Guest Response Generation (RAG)

For each selected guest:
- **Retriever**: Filter by guest_id and theme_id ∈ active themes
- **Prompt (Guest Persona)**:
  ```
  You are {{guest_name}}.
  You may only speak using ideas and opinions you have expressed
  on Lenny's Podcast.

  Rules:
  - Ground everything in the provided context
  - Do not invent experiences
  - If unsure, say so
  - Be thoughtful, not verbose
  ```

Each guest runs independently. Responses are streamed back to the group chat.

## 8. Group Chat UX Behavior

User sees:
- You
- Lenny
- + 200 others

Messages appear like:
- "Patrick Collison"
- "Reid Hoffman"
- "Claire Hughes Johnson"

Each message:
- Clickable
- Opens split chat

## 9. Split Chat (1:1 Guest Mode)

When clicked:
- Context passed: Original question + Guest's last response
- Constraints: Retriever filtered to only that guest
- No cross-guest contamination
- Stateless

This feels like: "Let me dig deeper with just this person."

