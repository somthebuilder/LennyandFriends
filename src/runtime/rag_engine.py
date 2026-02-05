"""
RAG Engine - Core RAG functionality for guest response generation.
This is where the actual RAG retrieval and generation happens.
"""
from typing import List, Dict, Optional
from dataclasses import dataclass
import os
from dotenv import load_dotenv

# Try to import new Gemini API first, fallback to OpenAI, then Anthropic
try:
    from google import genai
    GEMINI_AVAILABLE = True
except ImportError:
    GEMINI_AVAILABLE = False

try:
    from openai import OpenAI
    OPENAI_AVAILABLE = True
except ImportError:
    OPENAI_AVAILABLE = False

try:
    from anthropic import Anthropic
    ANTHROPIC_AVAILABLE = True
except ImportError:
    ANTHROPIC_AVAILABLE = False

from ..knowledge.vector_store import VectorStore, SearchResult

load_dotenv()


@dataclass
class GuestResponse:
    """A guest's response to a query."""
    guest_id: str
    guest_name: str
    response_text: str
    source_chunks: List[str]  # chunk_ids used
    confidence: float


class RAGEngine:
    """
    RAG engine for generating guest responses.
    
    Process:
    1. Retrieve relevant chunks (filtered by guest_id and theme_id)
    2. Generate response using guest persona prompt
    3. Ground response in retrieved context
    """
    
    def __init__(
        self,
        vector_store: VectorStore,
        model: Optional[str] = None,
        provider: str = "gemini"
    ):
        self.vector_store = vector_store
        self.provider = provider.lower()
        
        # Initialize client based on provider
        if self.provider == "gemini" and GEMINI_AVAILABLE:
            api_key = os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY")
            if not api_key:
                raise ValueError("GEMINI_API_KEY or GOOGLE_API_KEY not found in environment")
            self.client = genai.Client(api_key=api_key)
            self.model = model or "models/gemini-2.5-flash"
        elif self.provider == "openai" and OPENAI_AVAILABLE:
            api_key = os.getenv("OPENAI_API_KEY")
            if not api_key:
                raise ValueError("OPENAI_API_KEY not found in environment")
            self.client = OpenAI(api_key=api_key)
            self.model = model or "gpt-4o-mini"
        elif self.provider == "anthropic" and ANTHROPIC_AVAILABLE:
            api_key = os.getenv("ANTHROPIC_API_KEY")
            if not api_key:
                raise ValueError("ANTHROPIC_API_KEY not found in environment")
            self.client = Anthropic(api_key=api_key)
            self.model = model or "claude-3-5-sonnet-20241022"
        else:
            # Auto-detect
            if GEMINI_AVAILABLE and (os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY")):
                api_key = os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY")
                self.client = genai.Client(api_key=api_key)
                self.model = model or "models/gemini-2.5-flash"
                self.provider = "gemini"
            elif OPENAI_AVAILABLE and os.getenv("OPENAI_API_KEY"):
                self.client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))
                self.model = model or "gpt-4o-mini"
                self.provider = "openai"
            elif ANTHROPIC_AVAILABLE and os.getenv("ANTHROPIC_API_KEY"):
                self.client = Anthropic(api_key=os.getenv("ANTHROPIC_API_KEY"))
                self.model = model or "claude-3-5-sonnet-20241022"
                self.provider = "anthropic"
            else:
                raise ValueError("No API key found. Set GEMINI_API_KEY, OPENAI_API_KEY, or ANTHROPIC_API_KEY")
    
    def generate_guest_response(
        self,
        query: str,
        guest_id: str,
        guest_name: str,
        theme_ids: Optional[List[str]] = None,
        num_chunks: int = 5
    ) -> GuestResponse:
        """
        Generate a response from a specific guest using RAG.
        
        Args:
            query: User's question
            guest_id: Guest identifier
            guest_name: Guest's display name
            theme_ids: Optional list of theme IDs to filter by
            num_chunks: Number of chunks to retrieve
            
        Returns:
            GuestResponse object
        """
        # Step 1: Retrieve relevant chunks
        chunks = self._retrieve_chunks(
            query=query,
            guest_id=guest_id,
            theme_ids=theme_ids,
            k=num_chunks
        )
        
        if not chunks:
            return GuestResponse(
                guest_id=guest_id,
                guest_name=guest_name,
                response_text="I don't have enough relevant context to answer this question based on what I've discussed on Lenny's Podcast.",
                source_chunks=[],
                confidence=0.0
            )
        
        # Step 2: Build context from chunks
        context = self._build_context(chunks)
        
        # Step 3: Generate response with guest persona
        response = self._generate_with_persona(
            query=query,
            guest_name=guest_name,
            context=context
        )
        
        return GuestResponse(
            guest_id=guest_id,
            guest_name=guest_name,
            response_text=response,
            source_chunks=[chunk.chunk_id for chunk in chunks],
            confidence=min(chunk.score for chunk in chunks) if chunks else 0.0
        )
    
    def _retrieve_chunks(
        self,
        query: str,
        guest_id: str,
        theme_ids: Optional[List[str]] = None,
        k: int = 5
    ) -> List[SearchResult]:
        """
        Retrieve relevant chunks for a guest.
        
        If theme_ids provided, searches within each theme and combines results.
        """
        if theme_ids:
            # Search within each theme and combine
            all_results = []
            for theme_id in theme_ids:
                results = self.vector_store.search(
                    query=query,
                    k=k,
                    filter_guest_id=guest_id,
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
                    if len(unique_results) >= k:
                        break
            
            return unique_results
        else:
            # Search without theme filter
            return self.vector_store.search(
                query=query,
                k=k,
                filter_guest_id=guest_id
            )
    
    def _build_context(self, chunks: List[SearchResult]) -> str:
        """Build context string from retrieved chunks."""
        context_parts = []
        for i, chunk in enumerate(chunks, 1):
            context_parts.append(
                f"[Excerpt {i}]\n"
                f"{chunk.text}\n"
            )
        return "\n".join(context_parts)
    
    def _generate_with_persona(
        self,
        query: str,
        guest_name: str,
        context: str
    ) -> str:
        """Generate response using guest persona prompt."""
        prompt = f"""You are {guest_name}.
You may only speak using ideas and opinions you have expressed on Lenny's Podcast.

Rules:
- Ground everything in the provided context
- Do not invent experiences or opinions you haven't expressed
- If unsure or the context doesn't cover the question, say so explicitly
- Be thoughtful, not verbose
- Write in your natural speaking style
- Reference specific examples or frameworks you've discussed when relevant

Context from your podcast appearances:
{context}

User's question: {query}

Your response:"""
        
        try:
            if self.provider == "gemini":
                response = self.client.models.generate_content(
                    model=self.model,
                    contents=prompt
                )
                return response.text
            elif self.provider == "openai":
                response = self.client.chat.completions.create(
                    model=self.model,
                    max_tokens=500,
                    messages=[{"role": "user", "content": prompt}]
                )
                return response.choices[0].message.content
            elif self.provider == "anthropic":
                response = self.client.messages.create(
                    model=self.model,
                    max_tokens=500,
                    messages=[{"role": "user", "content": prompt}]
                )
                return response.content[0].text
            else:
                raise ValueError(f"Unknown provider: {self.provider}")
        except Exception as e:
            print(f"Error generating response: {e}")
            return "I'm having trouble formulating a response right now."
    
    def generate_batch_responses(
        self,
        query: str,
        guest_configs: List[Dict],
        theme_ids: Optional[List[str]] = None
    ) -> List[GuestResponse]:
        """
        Generate responses from multiple guests.
        
        Args:
            query: User's question
            guest_configs: List of dicts with keys: guest_id, guest_name
            theme_ids: Optional list of theme IDs
            
        Returns:
            List of GuestResponse objects
        """
        responses = []
        for config in guest_configs:
            response = self.generate_guest_response(
                query=query,
                guest_id=config["guest_id"],
                guest_name=config["guest_name"],
                theme_ids=theme_ids
            )
            responses.append(response)
        return responses


if __name__ == "__main__":
    # Test RAG engine (requires vector store to be set up)
    print("RAG Engine test - requires vector store initialization")
    print("See build_knowledge_base.py for full pipeline")

