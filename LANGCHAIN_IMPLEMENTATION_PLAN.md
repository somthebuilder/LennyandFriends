# LangChain Hybrid Implementation Plan

## Overview

This plan implements the **hybrid approach**: Custom intelligence + LangChain orchestration.

## Architecture

```
Custom Intelligence Layer (Unchanged)
  ├─ RuntimeIntelligence.match_themes()
  ├─ RuntimeIntelligence.select_guests()
  ├─ RuntimeIntelligence.check_ambiguity()
  └─ LennyModerator.generate_clarification_questions()
          |
          v
LangChain Orchestration Layer (New)
  ├─ Parallel guest RAG chains
  ├─ Streaming support
  ├─ OpenTelemetry observability
  └─ Retry logic
          |
          v
Supabase + LLMs
```

## Implementation Steps

### Step 1: Install Dependencies ✅

```bash
pip install langchain langchain-community langchain-google-genai langchain-openai langchain-anthropic
pip install opentelemetry-api opentelemetry-sdk opentelemetry-instrumentation-langchain
```

### Step 2: Create LangChain Orchestrator ✅

Created `src/runtime/langchain_rag_orchestrator.py`:
- `LangChainRAGOrchestrator` - Core orchestration class
- `LangChainRAGEngine` - Compatibility wrapper matching existing interface
- Parallel execution support
- Streaming support
- OpenTelemetry integration

### Step 3: Update API to Use LangChain Orchestrator

Modify `src/api/main.py` to use the new orchestrator:

```python
# Option 1: Use LangChain orchestrator (recommended)
from src.runtime.langchain_rag_orchestrator import LangChainRAGEngine

rag_engine = LangChainRAGEngine(
    vector_store=vector_store,
    provider="gemini",
    enable_observability=True
)

# Option 2: Keep existing RAGEngine (backward compatible)
# from src.runtime.rag_engine import RAGEngine
# rag_engine = RAGEngine(vector_store=vector_store)
```

### Step 4: Update Batch Response Generation

The key improvement: **parallel execution**

**Before (Sequential):**
```python
responses = rag_engine.generate_batch_responses(
    query=query,
    guest_configs=guest_configs,
    theme_ids=theme_ids
)  # Slow - one guest at a time
```

**After (Parallel with LangChain):**
```python
# Async version (recommended)
responses = await rag_engine.generate_batch_responses_async(
    query=query,
    guest_configs=guest_configs,
    theme_ids=theme_ids
)  # Fast - all guests in parallel

# Or sync version (uses asyncio.run internally)
responses = rag_engine.generate_batch_responses(
    query=query,
    guest_configs=guest_configs,
    theme_ids=theme_ids
)  # Still parallel, just wrapped
```

### Step 5: Add Streaming Support (Optional)

For real-time streaming to frontend:

```python
async def stream_responses(query, guest_configs, theme_ids):
    configs = [
        GuestChainConfig(
            guest_id=config["guest_id"],
            guest_name=config["guest_name"],
            theme_ids=theme_ids
        )
        for config in guest_configs
    ]
    
    async for response in orchestrator.stream_guest_responses(query, configs):
        yield response  # Stream to frontend
```

### Step 6: Configure OpenTelemetry

Add to `src/api/main.py`:

```python
from opentelemetry import trace
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import BatchSpanProcessor, ConsoleSpanExporter

# Setup OpenTelemetry (only once at startup)
if not trace.get_tracer_provider():
    trace.set_tracer_provider(TracerProvider())
    processor = BatchSpanProcessor(ConsoleSpanExporter())
    trace.get_tracer_provider().add_span_processor(processor)

# For production, use Jaeger or Prometheus exporter:
# from opentelemetry.exporter.jaeger import JaegerExporter
# processor = BatchSpanProcessor(JaegerExporter(...))
```

## Migration Strategy

### Phase 1: Add LangChain (Non-Breaking)
1. ✅ Install dependencies
2. ✅ Create orchestrator
3. Add feature flag to switch between old/new
4. Test in parallel

### Phase 2: Switch to LangChain (Gradual)
1. Update API to use LangChain orchestrator
2. Keep old RAGEngine as fallback
3. Monitor performance and errors

### Phase 3: Add Observability
1. Setup OpenTelemetry
2. Add tracing to all chains
3. Monitor in production

### Phase 4: Add Streaming (Optional)
1. Add streaming endpoint
2. Update frontend to handle streaming
3. Test real-time UX

## Benefits You'll Get

### 1. **Parallel Execution** 🚀
- **Before**: 10 guests × 2s = 20s total
- **After**: 10 guests in parallel = ~2s total
- **10x speedup** for multi-guest queries

### 2. **OpenTelemetry Observability** 📊
- Automatic tracing of all LLM calls
- Cost tracking per provider
- Latency metrics
- Error tracking
- Query patterns

### 3. **Cleaner Code** 🧹
- Standardized chain composition
- Built-in retry logic
- Provider abstraction
- Metadata filtering

### 4. **Streaming Support** 📡
- Real-time response streaming
- Better UX for long responses
- Progressive rendering

## Testing

### Test Parallel Execution
```python
import time
from src.runtime.langchain_rag_orchestrator import LangChainRAGEngine

# Test with 5 guests
guest_configs = [
    {"guest_id": "guest-1", "guest_name": "Guest 1"},
    {"guest_id": "guest-2", "guest_name": "Guest 2"},
    # ... 3 more
]

start = time.time()
responses = await rag_engine.generate_batch_responses_async(
    query="How do you build great products?",
    guest_configs=guest_configs
)
duration = time.time() - start

print(f"Generated {len(responses)} responses in {duration:.2f}s")
# Should be ~2-3s instead of 10-15s sequential
```

### Test Observability
```python
# Check OpenTelemetry traces
# Should see spans for:
# - Each guest chain invocation
# - LLM calls
# - Retrieval operations
```

## Rollback Plan

If issues arise, you can easily rollback:

```python
# In src/api/main.py
USE_LANGCHAIN = os.getenv("USE_LANGCHAIN", "false").lower() == "true"

if USE_LANGCHAIN:
    from src.runtime.langchain_rag_orchestrator import LangChainRAGEngine
    rag_engine = LangChainRAGEngine(vector_store=vector_store)
else:
    from src.runtime.rag_engine import RAGEngine
    rag_engine = RAGEngine(vector_store=vector_store)
```

## Next Steps

1. ✅ Dependencies installed
2. ✅ Orchestrator created
3. ⏳ Update API to use orchestrator
4. ⏳ Test parallel execution
5. ⏳ Add OpenTelemetry configuration
6. ⏳ Monitor in production

## Notes

- **Custom intelligence stays unchanged** - Your IP is preserved
- **Backward compatible** - Can switch between old/new
- **Gradual migration** - Test incrementally
- **Production ready** - Battle-tested LangChain patterns

