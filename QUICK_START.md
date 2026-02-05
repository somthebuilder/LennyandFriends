# 🚀 Lenny and Friends - Quick Start Guide

## Overview

This is a RAG-powered group chat system where you can ask questions and get responses from Lenny's Podcast guests based on their actual podcast appearances.

## Current Status

✅ **Backend**: Complete (RAG system, API, knowledge base builder)  
✅ **Frontend**: Complete (Group chat + Split chat UI)  
⏳ **Knowledge Base**: Building in background (~47 hours estimated)

## Setup (One-Time)

### 1. Run the Setup Script

```bash
./setup.sh
```

This will:
- Check Python and Node.js versions
- Install Python dependencies
- Install frontend dependencies
- Create `.env` template if needed

### 2. Configure API Keys

Edit `.env` and add at least one API key:

```bash
GEMINI_API_KEY=your_key_here
# OR
OPENAI_API_KEY=your_key_here
# OR
ANTHROPIC_API_KEY=your_key_here
```

**Note**: Gemini is preferred and currently being used for the knowledge base build.

## Building the Knowledge Base

The knowledge base build is **already running in the background**. To check progress:

```bash
# Monitor progress
./monitor_build.sh

# Or check the log directly
tail -f build.log
```

The build process:
1. ✅ Parses all 303 episode transcripts
2. ✅ Chunks transcripts intelligently (~28,329 chunks)
3. ⏳ Extracts themes from chunks (currently running, ~0.18% complete)
4. ⏳ Clusters themes into ontology
5. ⏳ Maps guest-theme strengths
6. ⏳ Builds vector store

**Estimated time**: ~47 hours at current speed (6 seconds per chunk)

## Running the Application

### Once Knowledge Base is Built

1. **Start the Backend API**:
   ```bash
   python3 -m uvicorn src.api.main:app --reload
   ```
   API will be available at: `http://localhost:8000`

2. **Start the Frontend** (in another terminal):
   ```bash
   cd frontend
   npm run dev
   ```
   Frontend will be available at: `http://localhost:3000`

3. **Open in Browser**:
   ```
   http://localhost:3000
   ```

## Using the Application

### Group Chat Mode

1. Enter your name when prompted
2. Ask a question (e.g., "How do I build a great product?")
3. Lenny will either:
   - Ask clarifying questions if the query is ambiguous
   - Bring in relevant guests who respond based on their podcast appearances
4. Click any guest's message to start a 1:1 conversation

### Split Chat Mode

- Click any guest message in group chat
- Continue the conversation 1:1 with that guest
- The guest's responses are filtered to only their expertise
- Click "Back" to return to group chat

## Project Structure

```
.
├── episodes/              # 303 podcast transcripts
├── scripts/
│   └── build_knowledge_base.py  # Knowledge base builder
├── src/
│   ├── knowledge/         # Offline processing (parsing, chunking, themes)
│   ├── runtime/           # Online intelligence (RAG, moderation)
│   └── api/               # FastAPI server
├── frontend/              # Next.js React app
├── knowledge_base/        # Built knowledge base (created after build)
└── build.log             # Build progress log
```

## Troubleshooting

### "API Offline" in Frontend

- Make sure the backend is running: `python3 -m uvicorn src.api.main:app --reload`
- Check if knowledge base is built: `ls knowledge_base/themes.json`

### "Knowledge base is still being built"

- The build is still running. Check progress: `./monitor_build.sh`
- Wait for the build to complete before using the API

### Build Errors

- Check `build.log` for specific errors
- Verify API keys in `.env` are correct
- Ensure you have enough disk space (knowledge base is ~500MB-1GB)

### Frontend Won't Start

- Make sure Node.js 18+ is installed: `node -v`
- Install dependencies: `cd frontend && npm install`
- Check for port conflicts (default: 3000)

## Next Steps

1. **Wait for knowledge base build** (~47 hours)
2. **Start API and frontend** (see above)
3. **Test with sample questions**:
   - "How do I hire great engineers?"
   - "What's the best way to do user research?"
   - "How do I build a product-led growth strategy?"

## Performance Optimization (Future)

The current build is sequential (slow). Future optimizations:
- Batch processing for theme extraction
- Parallel API requests
- Caching and incremental updates

## Support

- Check `build.log` for build issues
- Check browser console for frontend errors
- Check API logs for backend errors

---

**Happy chatting with Lenny's guests! 🎙️**

