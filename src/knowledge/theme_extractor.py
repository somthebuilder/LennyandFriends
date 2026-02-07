"""
Theme Extraction - Offline LLM pass to extract semantic descriptors and core thesis.
This is the heart of intent detection.
"""
import json
from typing import List, Dict, Optional
from dataclasses import dataclass, asdict
from typing import Optional
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

load_dotenv()


@dataclass
class ThemeExtraction:
    """Extracted theme information from a chunk."""
    chunk_id: str
    guest_id: str
    episode_id: str
    semantic_descriptors: List[str]  # 3-5 descriptors
    core_thesis: str  # Single sentence thesis
    confidence: float  # 0-1, how confident we are in this extraction


class ThemeExtractor:
    """
    Extracts themes from chunks using LLM.
    
    For every chunk, extracts:
    - semantic_descriptors: 3-5 phrases that capture the chunk's themes
    - core_thesis: Single sentence capturing the main idea
    """
    
    def __init__(self, model: Optional[str] = None, provider: str = "gemini"):
        """
        Initialize theme extractor.
        
        Args:
            model: Model name (auto-selected if None)
            provider: "gemini", "openai", or "anthropic"
        """
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
            # Auto-detect: try Gemini first, then OpenAI, then Anthropic
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
    
    def extract_theme(self, chunk_text: str, chunk_id: str, guest_id: str, episode_id: str) -> ThemeExtraction:
        """
        Extract theme information from a chunk.
        
        Args:
            chunk_text: The chunk text
            chunk_id: Unique chunk identifier
            guest_id: Guest identifier
            episode_id: Episode identifier
            
        Returns:
            ThemeExtraction object
        """
        prompt = self._build_extraction_prompt(chunk_text)
        
        try:
            if self.provider == "gemini":
                # Log API call for tracking
                import time
                import threading
                
                start_time = time.time()
                print(f"[API Call] Gemini - Chunk: {chunk_id[:20]}... Model: {self.model}")
                
                # Use threading timeout to prevent hanging (30 second timeout)
                response_result = [None]
                exception_result = [None]
                
                def api_call():
                    try:
                        response_result[0] = self.client.models.generate_content(
                            model=self.model,
                            contents=prompt
                        )
                    except Exception as e:
                        exception_result[0] = e
                
                thread = threading.Thread(target=api_call)
                thread.daemon = True
                thread.start()
                thread.join(timeout=30)
                
                if thread.is_alive():
                    print(f"[API Timeout] Gemini - Chunk: {chunk_id[:20]}... Request timed out after 30 seconds")
                    raise TimeoutError("API call timed out after 30 seconds")
                
                if exception_result[0]:
                    raise exception_result[0]
                
                response = response_result[0]
                content = response.text
                
                elapsed = time.time() - start_time
                print(f"[API Response] Gemini - Chunk: {chunk_id[:20]}... Time: {elapsed:.2f}s, Tokens: ~{len(prompt.split())} input")
            elif self.provider == "openai":
                response = self.client.chat.completions.create(
                    model=self.model,
                    max_tokens=500,
                    messages=[{"role": "user", "content": prompt}]
                )
                content = response.choices[0].message.content
            elif self.provider == "anthropic":
                response = self.client.messages.create(
                    model=self.model,
                    max_tokens=500,
                    messages=[{"role": "user", "content": prompt}]
                )
                content = response.content[0].text
            else:
                raise ValueError(f"Unknown provider: {self.provider}")
            
            # Parse response
            extraction = self._parse_response(content, chunk_id, guest_id, episode_id)
            return extraction
            
        except Exception as e:
            print(f"Error extracting theme for {chunk_id}: {e}")
            # Return fallback
            return ThemeExtraction(
                chunk_id=chunk_id,
                guest_id=guest_id,
                episode_id=episode_id,
                semantic_descriptors=[],
                core_thesis="",
                confidence=0.0
            )
    
    def _build_extraction_prompt(self, chunk_text: str) -> str:
        """Build the prompt for theme extraction."""
        return f"""Analyze this excerpt from a podcast transcript and extract its core themes.

Your task:
1. Identify 3-5 semantic descriptors (short phrases) that capture what this excerpt is about
2. Write a single-sentence core thesis that captures the main idea

Guidelines:
- Semantic descriptors should be general enough to cluster with similar ideas
- Avoid overly specific details
- Focus on concepts, frameworks, principles, or insights
- The core thesis should be a complete, standalone idea

Example semantic descriptors:
- "long-term thinking"
- "founder decision-making"
- "quality over speed"
- "organizational design"
- "product strategy"

Example core thesis:
"Founders should optimize for durability of decisions rather than speed of iteration."

Output ONLY valid JSON in this format:
{{
  "semantic_descriptors": ["descriptor1", "descriptor2", "descriptor3"],
  "core_thesis": "Single sentence thesis here",
  "confidence": 0.85
}}

TRANSCRIPT EXCERPT:
{chunk_text}

JSON:"""
    
    def _parse_response(self, content: str, chunk_id: str, guest_id: str, episode_id: str) -> ThemeExtraction:
        """Parse LLM response into ThemeExtraction."""
        try:
            # Try to extract JSON from response
            # Remove markdown code blocks if present
            content = content.strip()
            if content.startswith("```"):
                # Extract JSON from code block
                lines = content.split("\n")
                json_lines = []
                in_json = False
                for line in lines:
                    if line.strip().startswith("```"):
                        in_json = not in_json
                        continue
                    if in_json or (not content.startswith("```json") and not line.strip().startswith("```")):
                        json_lines.append(line)
                content = "\n".join(json_lines)
            
            # Find JSON object
            start_idx = content.find("{")
            end_idx = content.rfind("}") + 1
            if start_idx >= 0 and end_idx > start_idx:
                json_str = content[start_idx:end_idx]
                data = json.loads(json_str)
                
                # Ensure semantic_descriptors is always a list (never None)
                semantic_descriptors = data.get("semantic_descriptors", [])
                if semantic_descriptors is None or not isinstance(semantic_descriptors, list):
                    semantic_descriptors = []
                
                # Ensure core_thesis is always a string (never None)
                core_thesis = data.get("core_thesis", "") or ""
                
                return ThemeExtraction(
                    chunk_id=chunk_id,
                    guest_id=guest_id,
                    episode_id=episode_id,
                    semantic_descriptors=semantic_descriptors,
                    core_thesis=core_thesis,
                    confidence=float(data.get("confidence", 0.5)) if data.get("confidence") is not None else 0.5
                )
        except Exception as e:
            print(f"Error parsing response: {e}")
        
        # Fallback
        return ThemeExtraction(
            chunk_id=chunk_id,
            guest_id=guest_id,
            episode_id=episode_id,
            semantic_descriptors=[],
            core_thesis="",
            confidence=0.0
        )
    
    def extract_batch(self, chunks: List[Dict]) -> List[ThemeExtraction]:
        """
        Extract themes from multiple chunks.
        
        Args:
            chunks: List of dicts with keys: chunk_id, guest_id, episode_id, text
            
        Returns:
            List of ThemeExtraction objects
        """
        extractions = []
        for chunk in chunks:
            extraction = self.extract_theme(
                chunk_text=chunk["text"],
                chunk_id=chunk["chunk_id"],
                guest_id=chunk["guest_id"],
                episode_id=chunk["episode_id"]
            )
            extractions.append(extraction)
        return extractions


if __name__ == "__main__":
    # Test extractor
    extractor = ThemeExtractor()
    
    test_chunk = """
    Way too many founders apologize for how they want to run the company. 
    They find some midpoint between how they want to run a company and how 
    the people they lead want to run the company. That's a good way to make 
    everyone miserable. Because what everyone really wants is clarity.
    """
    
    extraction = extractor.extract_theme(
        chunk_text=test_chunk,
        chunk_id="test_001",
        guest_id="brian-chesky",
        episode_id="ep_42"
    )
    
    print("Extraction result:")
    print(json.dumps(asdict(extraction), indent=2))

