"""
LangChain RAG Orchestrator - Hybrid approach
Uses LangChain for execution (parallel, streaming, observability)
while keeping custom intelligence separate.
"""
import asyncio
from typing import List, Dict, Optional, AsyncIterator
from dataclasses import dataclass

# LangChain imports
from langchain_core.runnables import RunnableConfig
from langchain_core.prompts import ChatPromptTemplate
from langchain_core.output_parsers import StrOutputParser
from langchain_core.runnables import RunnablePassthrough
from langchain_community.vectorstores import SupabaseVectorStore
from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_openai import ChatOpenAI
from langchain_anthropic import ChatAnthropic

# OpenTelemetry for observability
try:
    from opentelemetry import trace
    from opentelemetry.sdk.trace import TracerProvider
    from opentelemetry.sdk.trace.export import BatchSpanProcessor, ConsoleSpanExporter
    from langchain.callbacks import OpenTelemetryCallbackHandler
    OPENTELEMETRY_AVAILABLE = True
except ImportError:
    OPENTELEMETRY_AVAILABLE = False
    print("Warning: OpenTelemetry not installed. Install with: pip install opentelemetry-api opentelemetry-sdk opentelemetry-instrumentation-langchain")

from ..knowledge.vector_store import VectorStore, SearchResult
from .rag_engine import GuestResponse

import os
from dotenv import load_dotenv

load_dotenv()


@dataclass
class GuestChainConfig:
    """Configuration for a guest RAG chain."""
    guest_id: str
    guest_name: str
    theme_ids: Optional[List[str]] = None
    num_chunks: int = 5


class LangChainRAGOrchestrator:
    """
    LangChain-based RAG orchestrator for parallel guest response generation.
    
    This handles:
    - Parallel execution of multiple guest chains
    - Streaming support
    - Retry logic
    - OpenTelemetry observability
    - Provider abstraction
    
    Custom intelligence (theme matching, guest routing) stays separate.
    """
    
    def __init__(
        self,
        vector_store: VectorStore,
        provider: str = "gemini",
        model: Optional[str] = None,
        enable_observability: bool = True
    ):
        self.vector_store = vector_store
        self.provider = provider.lower()
        self.enable_observability = enable_observability and OPENTELEMETRY_AVAILABLE
        
        # Setup OpenTelemetry if available
        if self.enable_observability:
            self._setup_observability()
        
        # Initialize LLM based on provider
        self.llm = self._init_llm(model)
        
        # Create LangChain-compatible vector store wrapper
        self.langchain_vectorstore = self._create_langchain_vectorstore()
    
    def _setup_observability(self):
        """Setup OpenTelemetry tracing."""
        if not OPENTELEMETRY_AVAILABLE:
            return
        
        # Setup tracer provider
        if not trace.get_tracer_provider():
            trace.set_tracer_provider(TracerProvider())
        
        # Add console exporter (can be replaced with Jaeger, Prometheus, etc.)
        processor = BatchSpanProcessor(ConsoleSpanExporter())
        trace.get_tracer_provider().add_span_processor(processor)
        
        self.tracer = trace.get_tracer(__name__)
        print("✅ OpenTelemetry observability enabled")
    
    def _init_llm(self, model: Optional[str] = None):
        """Initialize LLM based on provider."""
        if self.provider == "gemini":
            api_key = os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY")
            if not api_key:
                raise ValueError("GEMINI_API_KEY or GOOGLE_API_KEY not found")
            return ChatGoogleGenerativeAI(
                model=model or "gemini-2.0-flash-exp",
                google_api_key=api_key,
                temperature=0.7
            )
        elif self.provider == "openai":
            api_key = os.getenv("OPENAI_API_KEY")
            if not api_key:
                raise ValueError("OPENAI_API_KEY not found")
            return ChatOpenAI(
                model=model or "gpt-4o-mini",
                api_key=api_key,
                temperature=0.7
            )
        elif self.provider == "anthropic":
            api_key = os.getenv("ANTHROPIC_API_KEY")
            if not api_key:
                raise ValueError("ANTHROPIC_API_KEY not found")
            return ChatAnthropic(
                model=model or "claude-3-5-sonnet-20241022",
                api_key=api_key,
                temperature=0.7
            )
        else:
            raise ValueError(f"Unknown provider: {self.provider}")
    
    def _create_langchain_vectorstore(self):
        """
        Create LangChain-compatible vector store.
        
        Note: This is a wrapper around your existing VectorStore.
        For full LangChain integration, you'd want to implement
        a proper SupabaseVectorStore adapter.
        """
        # For now, we'll use a custom retriever that wraps your VectorStore
        # In production, you'd implement a proper LangChain retriever
        return None  # Will be handled in _create_retriever
    
    def _create_retriever(self, guest_id: str, theme_ids: Optional[List[str]] = None, k: int = 5):
        """
        Create a retriever for a specific guest and themes.
        
        This wraps your existing VectorStore.search() method.
        """
        class CustomRetriever:
            def __init__(self, vector_store, guest_id, theme_ids, k):
                self.vector_store = vector_store
                self.guest_id = guest_id
                self.theme_ids = theme_ids
                self.k = k
            
            def get_relevant_documents(self, query: str):
                """LangChain-compatible retrieval."""
                if self.theme_ids:
                    # Search within each theme and combine
                    all_results = []
                    for theme_id in self.theme_ids:
                        results = self.vector_store.search(
                            query=query,
                            k=self.k,
                            filter_guest_id=self.guest_id,
                            filter_theme_id=theme_id
                        )
                        all_results.extend(results)
                    
                    # Deduplicate and sort by score
                    seen_chunk_ids = set()
                    unique_results = []
                    for result in sorted(all_results, key=lambda x: x.score, reverse=True):
                        if result.chunk_id not in seen_chunk_ids:
                            unique_results.append(result)
                            seen_chunk_ids.add(result.chunk_id)
                            if len(unique_results) >= self.k:
                                break
                    
                    return unique_results
                else:
                    return self.vector_store.search(
                        query=query,
                        k=self.k,
                        filter_guest_id=self.guest_id
                    )
            
            async def aget_relevant_documents(self, query: str):
                """Async version."""
                return self.get_relevant_documents(query)
        
        return CustomRetriever(self.vector_store, guest_id, theme_ids, k)
    
    def _create_guest_chain(self, config: GuestChainConfig):
        """
        Create a persona-aware RAG chain for a guest.
        
        This is where LangChain shines - clean chain composition.
        """
        retriever = self._create_retriever(
            guest_id=config.guest_id,
            theme_ids=config.theme_ids,
            k=config.num_chunks
        )
        
        # Build context from retrieved chunks
        def format_docs(docs):
            """Format retrieved documents as context."""
            context_parts = []
            for i, doc in enumerate(docs, 1):
                if isinstance(doc, SearchResult):
                    context_parts.append(f"[Excerpt {i}]\n{doc.text}\n")
                else:
                    context_parts.append(f"[Excerpt {i}]\n{str(doc)}\n")
            return "\n".join(context_parts)
        
        # Guest persona prompt
        prompt = ChatPromptTemplate.from_messages([
            ("system", f"""You are {config.guest_name}.
You may only speak using ideas and opinions you have expressed on Lenny's Podcast.

Rules:
- Ground everything in the provided context
- Do not invent experiences or opinions you haven't expressed
- If unsure or the context doesn't cover the question, say so explicitly
- Be thoughtful, not verbose
- Write in your natural speaking style
- Reference specific examples or frameworks you've discussed when relevant

Context from your podcast appearances:
{{context}}"""),
            ("human", "{query}")
        ])
        
        # Create chain: retrieve -> format -> prompt -> LLM -> parse
        chain = (
            {
                "context": retriever | format_docs,
                "query": RunnablePassthrough()
            }
            | prompt
            | self.llm
            | StrOutputParser()
        )
        
        # Add observability if enabled
        if self.enable_observability:
            config_with_callbacks = RunnableConfig(
                callbacks=[OpenTelemetryCallbackHandler(self.tracer)],
                tags={"guest_id": config.guest_id, "guest_name": config.guest_name}
            )
            # Note: We'll pass config when invoking
        
        return chain
    
    async def generate_guest_responses_parallel(
        self,
        query: str,
        guest_configs: List[GuestChainConfig],
        enable_streaming: bool = False
    ) -> List[GuestResponse]:
        """
        Generate responses from multiple guests in parallel.
        
        This is the key benefit of LangChain - clean parallel execution.
        """
        # Create chains for each guest
        chains = []
        for config in guest_configs:
            chain = self._create_guest_chain(config)
            chains.append((chain, config))
        
        # Prepare run configs with observability
        run_configs = []
        for config in guest_configs:
            if self.enable_observability:
                run_config = RunnableConfig(
                    callbacks=[OpenTelemetryCallbackHandler(self.tracer)],
                    tags={
                        "guest_id": config.guest_id,
                        "guest_name": config.guest_name,
                        "query": query[:50]  # Truncate for tags
                    }
                )
            else:
                run_config = RunnableConfig()
            run_configs.append(run_config)
        
        # Parallel execution
        if enable_streaming:
            # For streaming, we'd use chain.astream() and merge streams
            # For now, return async generator
            async def stream_responses():
                tasks = [
                    chain.ainvoke({"query": query}, config=run_config)
                    for (chain, _), run_config in zip(chains, run_configs)
                ]
                results = await asyncio.gather(*tasks)
                for (_, config), result in zip(chains, results):
                    yield GuestResponse(
                        guest_id=config.guest_id,
                        guest_name=config.guest_name,
                        response_text=result,
                        source_chunks=[],  # Would need to track from retriever
                        confidence=0.8  # Would calculate from retrieval scores
                    )
            return stream_responses()
        else:
            # Parallel non-streaming execution
            tasks = [
                chain.ainvoke({"query": query}, config=run_config)
                for (chain, _), run_config in zip(chains, run_configs)
            ]
            results = await asyncio.gather(*tasks)
            
            # Convert to GuestResponse objects
            responses = []
            for (_, config), result in zip(chains, results):
                responses.append(GuestResponse(
                    guest_id=config.guest_id,
                    guest_name=config.guest_name,
                    response_text=result,
                    source_chunks=[],  # TODO: Track source chunks from retriever
                    confidence=0.8  # TODO: Calculate from retrieval scores
                ))
            
            return responses
    
    async def stream_guest_responses(
        self,
        query: str,
        guest_configs: List[GuestChainConfig]
    ) -> AsyncIterator[GuestResponse]:
        """
        Stream responses from multiple guests in parallel.
        
        This enables real-time streaming to the frontend.
        """
        chains = [(self._create_guest_chain(config), config) for config in guest_configs]
        
        # Create streaming tasks
        async def stream_single_guest(chain, config):
            """Stream a single guest's response."""
            full_response = ""
            async for chunk in chain.astream({"query": query}):
                full_response += chunk
                yield GuestResponse(
                    guest_id=config.guest_id,
                    guest_name=config.guest_name,
                    response_text=chunk,  # Incremental chunk
                    source_chunks=[],
                    confidence=0.8
                )
        
        # Stream all guests in parallel
        streams = [stream_single_guest(chain, config) for chain, config in chains]
        
        # Merge streams (round-robin)
        while True:
            done = True
            for stream in streams:
                try:
                    response = await stream.__anext__()
                    yield response
                    done = False
                except StopAsyncIteration:
                    continue
            if done:
                break


# Compatibility wrapper to match existing RAGEngine interface
class LangChainRAGEngine:
    """
    Compatibility wrapper that matches RAGEngine interface
    but uses LangChain orchestrator under the hood.
    """
    
    def __init__(
        self,
        vector_store: VectorStore,
        model: Optional[str] = None,
        provider: str = "gemini",
        enable_observability: bool = True
    ):
        self.orchestrator = LangChainRAGOrchestrator(
            vector_store=vector_store,
            provider=provider,
            model=model,
            enable_observability=enable_observability
        )
    
    async def generate_batch_responses_async(
        self,
        query: str,
        guest_configs: List[Dict],
        theme_ids: Optional[List[str]] = None
    ) -> List[GuestResponse]:
        """
        Async version of generate_batch_responses with parallel execution.
        """
        configs = [
            GuestChainConfig(
                guest_id=config["guest_id"],
                guest_name=config["guest_name"],
                theme_ids=theme_ids,
                num_chunks=5
            )
            for config in guest_configs
        ]
        
        return await self.orchestrator.generate_guest_responses_parallel(
            query=query,
            guest_configs=configs,
            enable_streaming=False
        )
    
    def generate_batch_responses(
        self,
        query: str,
        guest_configs: List[Dict],
        theme_ids: Optional[List[str]] = None
    ) -> List[GuestResponse]:
        """
        Synchronous wrapper (runs async in event loop).
        """
        return asyncio.run(self.generate_batch_responses_async(
            query=query,
            guest_configs=guest_configs,
            theme_ids=theme_ids
        ))

