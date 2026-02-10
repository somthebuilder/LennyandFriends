# Gemini Setup Guide

The system uses **Google Gemini** for LLM responses (chat, panel questions) in a hybrid setup with OpenAI.

## Architecture

- **OpenAI** → Embeddings (vector search) - Fast, reliable
- **Gemini** → LLM responses (chat) - Cost-effective, good quality

## Setup

1. **Add your Gemini API key to `.env.local` (frontend):**
   ```bash
   GEMINI_API_KEY=your_gemini_api_key_here
   ```
   
   Or you can use:
   ```bash
   GOOGLE_API_KEY=your_api_key_here
   ```

2. **Get your Gemini API key:**
   - Go to https://makersuite.google.com/app/apikey
   - Create a new API key
   - Copy it to your `.env.local` file

## Supported Models

The system defaults to:
- **LLM Responses**: `gemini-2.0-flash-exp` (fast, cost-effective)
- **Clarification Questions**: `gemini-2.0-flash-exp`

## Usage

Gemini is used automatically in:
- `/api/query` - Guest responses in group chat
- `/api/split-chat` - 1:1 conversations
- Clarification question generation

## Safety Features

Gemini includes built-in safety filters that automatically block:
- Harassment
- Hate speech
- Sexually explicit content
- Dangerous content

Thresholds are set to `BLOCK_MEDIUM_AND_ABOVE` for all categories.

## Cost

- **Free tier**: Available (generous limits)
- **Paid**: $0.075/1M input tokens, $0.30/1M output tokens
- **Much cheaper** than OpenAI for LLM responses

## Notes

- Gemini API has rate limits (check current limits)
- The system handles API errors gracefully
- Safety filters can block some content (configurable)
