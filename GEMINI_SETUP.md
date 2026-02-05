# Gemini Setup Guide

The system has been updated to use **Google Gemini** as the primary LLM provider (with fallback to OpenAI and Anthropic).

## Setup

1. **Add your Gemini API key to `.env`:**
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
   - Copy it to your `.env` file

## Supported Models

The system defaults to:
- **Theme Extraction**: `gemini-1.5-pro`
- **RAG Generation**: `gemini-1.5-pro`
- **Lenny Moderation**: `gemini-1.5-pro`

You can override by passing a different model name when initializing:
```python
extractor = ThemeExtractor(model="gemini-1.5-flash", provider="gemini")
```

## Fallback Support

The system automatically falls back to:
1. **Gemini** (if `GEMINI_API_KEY` or `GOOGLE_API_KEY` is set)
2. **OpenAI** (if `OPENAI_API_KEY` is set)
3. **Anthropic** (if `ANTHROPIC_API_KEY` is set)

## Usage

The build script will automatically use Gemini if the API key is set:

```bash
python3 scripts/build_knowledge_base.py
```

The API server will also use Gemini by default:

```bash
python3 -m src.api.main
```

## Testing

To test if Gemini is working:

```python
from src.knowledge.theme_extractor import ThemeExtractor

extractor = ThemeExtractor(provider="gemini")
extraction = extractor.extract_theme(
    chunk_text="Your test text here",
    chunk_id="test_001",
    guest_id="test-guest",
    episode_id="test_ep"
)
print(extraction)
```

## Notes

- Gemini API has rate limits. For 28,000+ chunks, theme extraction will take several hours.
- Consider using `gemini-1.5-flash` for faster/cheaper processing during development.
- The system will automatically handle API errors and continue processing.

