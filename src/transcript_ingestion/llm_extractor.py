"""
LLM-based transcript extractor using structured output.
"""
import json
import os
from typing import Optional, Dict, Any, List
from pathlib import Path
from dotenv import load_dotenv

try:
    import google.generativeai as genai
    GEMINI_AVAILABLE = True
except ImportError:
    GEMINI_AVAILABLE = False
    print("Warning: google-generativeai not installed. Install with: pip install google-generativeai")

from .schemas import TranscriptExtractionSchema

load_dotenv()


class LLMTranscriptExtractor:
    """Extract structured data from transcripts using LLM."""
    
    def __init__(self, model_name: str = "models/gemini-2.5-flash"):
        """Initialize LLM client."""
        if not GEMINI_AVAILABLE:
            raise ImportError("google-generativeai package is required. Install with: pip install google-generativeai")
        
        api_key = os.getenv("GEMINI_API_KEY")
        if not api_key:
            raise ValueError("GEMINI_API_KEY environment variable not set")
        
        genai.configure(api_key=api_key)
        self.model = genai.GenerativeModel(model_name)
        self.model_name = model_name
    
    def extract(self, transcript_path: Path, transcript_content: str) -> Dict[str, Any]:
        """
        Extract structured data from transcript.
        
        Args:
            transcript_path: Path to transcript file
            transcript_content: Full transcript text
            
        Returns:
            Dictionary with extracted structured data
        """
        prompt = self._build_extraction_prompt(transcript_content)
        
        try:
            # Use structured output if available, otherwise parse JSON
            response = self.model.generate_content(prompt)
            text = response.text.strip()
            
            # Extract JSON from response (handle markdown code blocks)
            json_str = self._extract_json(text)
            
            # Parse and validate
            data = json.loads(json_str)
            
            # Validate against schema
            extraction = TranscriptExtractionSchema(**data)
            
            return extraction.model_dump()
            
        except Exception as e:
            print(f"Error extracting from {transcript_path}: {e}")
            raise
    
    def _extract_json(self, text: str) -> str:
        """Extract JSON from LLM response (handles markdown code blocks)."""
        # Try to find JSON in code blocks
        if "```json" in text:
            start = text.find("```json") + 7
            end = text.find("```", start)
            if end > start:
                return text[start:end].strip()
        elif "```" in text:
            start = text.find("```") + 3
            end = text.find("```", start)
            if end > start:
                return text[start:end].strip()
        
        # Try to find JSON object boundaries
        start = text.find("{")
        end = text.rfind("}") + 1
        if start >= 0 and end > start:
            return text[start:end]
        
        return text
    
    def _build_extraction_prompt(self, transcript_content: str) -> str:
        """Build the LLM extraction prompt."""
        schema_json = TranscriptExtractionSchema.model_json_schema()
        
        prompt = f"""Analyze the following podcast transcript from Lenny's Podcast and extract structured data according to this JSON schema.

Schema:
{json.dumps(schema_json, indent=2)}

Transcript:
{transcript_content[:50000]}  # Limit to ~50k chars to avoid token limits

Instructions:
1. Extract ALL metadata from the frontmatter block (guest name, title, publish_date, description, youtube_url, video_id, duration_seconds, view_count, channel, keywords)
2. Extract the cold open quote (the opening statement before Lenny's intro)
3. From Lenny's introduction, extract:
   - Guest's current role and company
   - Previous roles (list all mentioned)
   - Fun facts (usually 2-3 mentioned)
4. Identify and extract ALL sponsor segments:
   - Sponsor name
   - Ad content (full text)
   - CTA URL if mentioned
   - Position (first_break = first sponsor, mid_break = second sponsor)
5. Segment the interview body into logical segments (intro, interview sections, lightning_round, outro)
6. Extract lightning round answers (books, entertainment, interview_question, products, productivity_tip, life_motto)
7. From the outro, extract:
   - Social links (Twitter, LinkedIn, etc.)
   - Website URL
   - Listener asks/CTAs

Rules:
- Always return valid JSON matching the schema exactly
- Use null if a field is missing (don't hallucinate)
- Split lists into arrays
- Preserve exact wording where possible
- For segments, include the full content text
- Segment types must be one of: intro, sponsor, interview, lightning_round, outro
- Extract timestamps (HH:MM:SS) from speaker turns when available

Return ONLY valid JSON, no explanation or markdown formatting:"""
        
        return prompt

