"""
LLM-based speaker turn parser - replaces regex-based parsing.
"""
import json
import os
from typing import List, Dict, Optional
from pathlib import Path
from dotenv import load_dotenv

try:
    import google.generativeai as genai
    GEMINI_AVAILABLE = True
except ImportError:
    GEMINI_AVAILABLE = False

load_dotenv()


class LLMSpeakerParser:
    """Parse speaker turns from transcript using LLM instead of regex."""
    
    def __init__(self, model_name: str = "models/gemini-2.5-flash"):
        """Initialize LLM client."""
        if not GEMINI_AVAILABLE:
            raise ImportError("google-generativeai package is required")
        
        api_key = os.getenv("GEMINI_API_KEY")
        if not api_key:
            raise ValueError("GEMINI_API_KEY environment variable not set")
        
        genai.configure(api_key=api_key)
        self.model = genai.GenerativeModel(model_name)
    
    def parse_speaker_turns(self, transcript_text: str, max_length: int = 50000) -> List[Dict]:
        """
        Parse all speaker turns from transcript using LLM.
        
        Args:
            transcript_text: Full transcript text
            max_length: Maximum characters to send to LLM per request
            
        Returns:
            List of speaker turn dictionaries with speaker, timestamp, text
        """
        # If transcript is too long, process in chunks
        if len(transcript_text) > max_length:
            return self._parse_long_transcript(transcript_text, max_length)
        
        return self._parse_transcript_chunk(transcript_text)
    
    def _parse_transcript_chunk(self, text: str) -> List[Dict]:
        """Parse a single chunk of transcript."""
        prompt = f"""Parse the following podcast transcript and extract all speaker turns.

Transcript:
{text}

Extract each speaker turn as a JSON array with this exact structure:
[
  {{
    "speaker": "Speaker Name",
    "timestamp": "HH:MM:SS or null if not present",
    "text": "Full text of what they said"
  }}
]

Rules:
- Identify ALL speaker changes in the transcript
- Extract timestamps if present (format: HH:MM:SS)
- Preserve exact text - do not summarize or modify
- If speaker name is unclear, use "Unknown"
- Group consecutive turns by the same speaker if they appear together
- Return ONLY valid JSON array, no markdown code blocks, no explanation

Return the JSON array:"""

        try:
            response = self.model.generate_content(prompt)
            response_text = response.text.strip()
            
            # Extract JSON from response
            json_str = self._extract_json(response_text)
            turns = json.loads(json_str)
            
            if isinstance(turns, list):
                return turns
            else:
                return []
                
        except Exception as e:
            print(f"Error parsing transcript chunk: {e}")
            return []
    
    def _parse_long_transcript(self, text: str, chunk_size: int) -> List[Dict]:
        """Parse a long transcript by splitting into chunks."""
        all_turns = []
        
        # Split by paragraphs or speaker turns (look for patterns)
        chunks = self._split_transcript(text, chunk_size)
        
        for chunk in chunks:
            turns = self._parse_transcript_chunk(chunk)
            all_turns.extend(turns)
        
        return all_turns
    
    def _split_transcript(self, text: str, chunk_size: int) -> List[str]:
        """Split transcript into chunks at natural boundaries."""
        chunks = []
        current_chunk = ""
        
        # Split by double newlines (paragraph breaks)
        paragraphs = text.split('\n\n')
        
        for para in paragraphs:
            if len(current_chunk) + len(para) < chunk_size:
                current_chunk += para + '\n\n'
            else:
                if current_chunk:
                    chunks.append(current_chunk.strip())
                current_chunk = para + '\n\n'
        
        if current_chunk:
            chunks.append(current_chunk.strip())
        
        return chunks
    
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
        
        # Try to find JSON array boundaries
        start = text.find("[")
        end = text.rfind("]") + 1
        if start >= 0 and end > start:
            return text[start:end]
        
        return text

