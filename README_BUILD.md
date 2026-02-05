# Lenny Group Chat - Build Guide

This guide explains how to build and run the Lenny Group Chat system.

## Overview

The system has three layers:
1. **Knowledge Substrate** (offline) - Processes transcripts, extracts themes, builds RAG
2. **Runtime Intelligence** (online) - Routes queries, selects guests, generates responses
3. **API/UI** (online) - Web interface for group chat and split chat

## Prerequisites

1. Python 3.9+
2. API keys:
   - Anthropic API key (for Claude)
   - OpenAI API key (optional, for embeddings)

## Setup

1. **Install dependencies:**
```bash
pip install -r requirements.txt
```

2. **Set up environment variables:**
```bash
cp .env.example .env
# Edit .env and add your API keys
```

3. **Build the knowledge base:**
```bash
python scripts/build_knowledge_base.py
```

This will:
- Parse all transcripts
- Chunk them intelligently
- Extract themes (this takes a while - uses LLM)
- Cluster themes into intent ontology
- Map guest-theme strengths
- Build vector store for RAG

**Note:** Theme extraction is the slowest step. It processes each chunk through Claude. For 300 episodes with ~50 chunks each, this could take several hours.

To skip extraction and use existing results:
```bash
python scripts/build_knowledge_base.py --skip-extraction
```

## Running the API

Once the knowledge base is built:

```bash
python -m src.api.main
```

Or with uvicorn:
```bash
uvicorn src.api.main:app --reload
```

The API will be available at `http://localhost:8000`

## API Endpoints

### POST `/query`
Main query endpoint for group chat.

**Request:**
```json
{
  "query": "How should I prioritize features?",
  "user_name": "Alice",
  "clarification": null
}
```

**Response (if ambiguous):**
```json
{
  "needs_clarification": true,
  "clarification_questions": [
    "Are you asking from a founder's perspective or as an IC?",
    "Is this about long-term strategy or short-term execution?"
  ],
  "active_themes": [...]
}
```

**Response (if clear):**
```json
{
  "needs_clarification": false,
  "guest_responses": [
    {
      "guest_id": "marty-cagan",
      "guest_name": "Marty Cagan",
      "response": "...",
      "confidence": 0.85
    },
    ...
  ],
  "active_themes": [...]
}
```

### POST `/split-chat`
1:1 conversation with a specific guest.

**Request:**
```
query: "Can you elaborate on that?"
guest_id: "marty-cagan"
original_query: "How should I prioritize features?"
previous_response: "Prioritization depends on..."
```

### WebSocket `/ws`
WebSocket endpoint for streaming responses.

## Architecture

### Knowledge Substrate (Offline)

```
Transcripts → Parser → Chunker → Theme Extractor → Theme Clusterer → Guest Mapper → Vector Store
```

- **Parser**: Extracts structured data from markdown transcripts
- **Chunker**: Intelligently chunks by idea/speaker turn (400-600 tokens)
- **Theme Extractor**: LLM pass to extract semantic descriptors and core thesis
- **Theme Clusterer**: HDBSCAN clustering to create ~30-60 emergent themes
- **Guest Mapper**: Computes guest-theme strength relationships
- **Vector Store**: FAISS-based RAG storage with metadata filtering

### Runtime Intelligence (Online)

```
User Query → Theme Matching → Ambiguity Check → Guest Selection → RAG Generation
```

- **Theme Matching**: Embeds query, compares to theme centroids
- **Ambiguity Check**: Detects if query needs clarification
- **Guest Selection**: Scores guests based on theme relevance
- **RAG Generation**: Retrieves chunks, generates guest responses

## Key Design Principles

1. **Intent emerges from corpus** - No predefined buckets
2. **Guests never hallucinate** - Only speak on themes they've discussed
3. **Routing > Generation** - 70% intelligence is deciding who speaks
4. **Stateless** - No memory persistence (except user name)
5. **Lenny moderates** - Clarifies ambiguity, doesn't dominate

## Troubleshooting

### Knowledge base build fails
- Check API keys in `.env`
- Ensure transcripts are in `episodes/` directory
- Check disk space (vector store can be large)

### API fails to start
- Ensure knowledge base is built first
- Check that `knowledge_base/` directory exists
- Verify all required files are present

### Low quality responses
- Rebuild knowledge base with more themes
- Adjust chunking parameters
- Check theme extraction quality

## Next Steps

1. Build the frontend UI (React/Next.js)
2. Add streaming responses
3. Improve diversity algorithm
4. Add more sophisticated ambiguity detection
5. Optimize theme extraction (batch processing)

