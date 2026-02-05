# Lenny and Friends - Frontend

Modern React/Next.js frontend for the Lenny and Friends system.

## Features

- **Group Chat**: Ask questions and get responses from multiple podcast guests
- **Split Chat**: Click any guest message to start a 1:1 conversation
- **Lenny Moderation**: Lenny asks clarifying questions when queries are ambiguous
- **Streaming UI**: Beautiful, responsive interface with smooth animations

## Setup

1. **Install dependencies:**
   ```bash
   cd frontend
   npm install
   ```

2. **Start development server:**
   ```bash
   npm run dev
   ```

3. **Open in browser:**
   ```
   http://localhost:3000
   ```

## Architecture

- **Next.js 14** with App Router
- **React 18** with hooks
- **Tailwind CSS** for styling
- **TypeScript** for type safety
- **Axios** for API calls

## Components

- `GroupChat`: Main group chat interface
- `SplitChat`: 1:1 conversation with a guest
- `MessageBubble`: Individual message display

## API Integration

The frontend connects to the FastAPI backend at `http://localhost:8000` via Next.js rewrites (configured in `next.config.js`).

## Environment

Make sure the backend API is running:
```bash
python3 -m src.api.main
```

The frontend will automatically proxy API requests to the backend.

