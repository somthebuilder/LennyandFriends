#!/usr/bin/env python3
"""
Bonus: Chunk interview segments for vector DB.

This script chunks the interview body segments per speaker
and includes expert_id mapping for each chunk.
"""
import os
import sys
import json
from pathlib import Path
from typing import List, Dict, Optional
from dataclasses import dataclass

sys.path.insert(0, str(Path(__file__).parent.parent))

from dotenv import load_dotenv
from supabase import create_client
from tqdm import tqdm
from src.transcript_ingestion.speaker_parser import LLMSpeakerParser

load_dotenv()


@dataclass
class InterviewChunk:
    """A chunk of interview content."""
    chunk_id: str
    episode_id: str
    guest_id: str
    speaker: str
    content: str
    start_time: Optional[str] = None
    end_time: Optional[str] = None
    chunk_index: int = 0


class InterviewChunker:
    """Chunk interview segments for vector database."""
    
    def __init__(self, chunk_size: int = 500, chunk_overlap: int = 50):
        """
        Initialize chunker.
        
        Args:
            chunk_size: Target chunk size in characters
            chunk_overlap: Overlap between chunks in characters
        """
        self.chunk_size = chunk_size
        self.chunk_overlap = chunk_overlap
        
        # Initialize Supabase
        supabase_url = os.getenv("SUPABASE_URL", "https://rhzpjvuutpjtdsbnskdy.supabase.co")
        supabase_key = os.getenv("SUPABASE_KEY", os.getenv("SUPABASE_SERVICE_ROLE_KEY", ""))
        if not supabase_key:
            raise ValueError("SUPABASE_KEY or SUPABASE_SERVICE_ROLE_KEY must be set")
        self.supabase = create_client(supabase_url, supabase_key)
        
        # Initialize LLM speaker parser
        try:
            self.speaker_parser = LLMSpeakerParser()
        except Exception as e:
            print(f"Warning: Could not initialize LLM parser: {e}")
            self.speaker_parser = None
    
    def get_interview_segments(self, episode_id: str) -> List[Dict]:
        """Get all interview segments for an episode."""
        try:
            response = self.supabase.table("segments").select("*").eq(
                "episode_id", episode_id
            ).eq("segment_type", "interview").order("display_order").execute()
            
            return response.data or []
        except Exception as e:
            print(f"Error fetching segments: {e}")
            return []
    
    def get_episode_guest(self, episode_id: str) -> Optional[str]:
        """Get guest_id for an episode."""
        try:
            response = self.supabase.table("episodes").select("guest_id").eq(
                "id", episode_id
            ).single().execute()
            
            return response.data.get("guest_id") if response.data else None
        except Exception as e:
            print(f"Error fetching guest: {e}")
            return None
    
    def chunk_text(self, text: str, speaker: str) -> List[Dict]:
        """
        Chunk text into smaller pieces.
        
        Args:
            text: Text to chunk
            speaker: Speaker name
            
        Returns:
            List of chunk dictionaries
        """
        chunks = []
        
        # Simple sentence-based chunking
        sentences = text.split('. ')
        current_chunk = []
        current_length = 0
        
        for sentence in sentences:
            sentence_length = len(sentence) + 2  # +2 for ". "
            
            if current_length + sentence_length > self.chunk_size and current_chunk:
                # Save current chunk
                chunk_text = '. '.join(current_chunk) + '.'
                chunks.append({
                    "content": chunk_text,
                    "speaker": speaker,
                    "length": len(chunk_text)
                })
                
                # Start new chunk with overlap
                overlap_sentences = current_chunk[-2:] if len(current_chunk) >= 2 else current_chunk
                current_chunk = overlap_sentences + [sentence]
                current_length = sum(len(s) + 2 for s in current_chunk)
            else:
                current_chunk.append(sentence)
                current_length += sentence_length
        
        # Add final chunk
        if current_chunk:
            chunk_text = '. '.join(current_chunk)
            if not chunk_text.endswith('.'):
                chunk_text += '.'
            chunks.append({
                "content": chunk_text,
                "speaker": speaker,
                "length": len(chunk_text)
            })
        
        return chunks
    
    def parse_speaker_turns(self, content: str) -> List[Dict]:
        """
        Parse speaker turns from segment content using LLM.
        
        Uses Gemini to intelligently parse speaker turns instead of regex.
        """
        if self.speaker_parser:
            try:
                return self.speaker_parser.parse_speaker_turns(content, max_length=10000)
            except Exception as e:
                print(f"  ⚠️  LLM parsing failed: {e}")
        
        # Fallback if LLM not available
        return self._fallback_parse_turns(content)
    
    def _fallback_parse_turns(self, content: str) -> List[Dict]:
        """Fallback parser if LLM fails."""
        # Simple fallback: treat entire content as one turn
        return [{
            "speaker": "Unknown",
            "timestamp": None,
            "text": content
        }]
    
    def chunk_episode(self, episode_id: str) -> List[InterviewChunk]:
        """Chunk all interview segments for an episode."""
        segments = self.get_interview_segments(episode_id)
        guest_id = self.get_episode_guest(episode_id)
        
        if not guest_id:
            print(f"  ⚠️  No guest_id found for episode {episode_id}")
            return []
        
        all_chunks = []
        chunk_index = 0
        
        for segment in segments:
            content = segment.get("content", "")
            start_time = segment.get("start_time")
            
            # Parse speaker turns
            turns = self.parse_speaker_turns(content)
            
            for turn in turns:
                speaker = turn["speaker"]
                text = turn["text"]
                timestamp = turn.get("timestamp")
                
                # Chunk the text
                text_chunks = self.chunk_text(text, speaker)
                
                for text_chunk in text_chunks:
                    chunk_id = f"{episode_id}-chunk-{chunk_index}"
                    
                    chunk = InterviewChunk(
                        chunk_id=chunk_id,
                        episode_id=episode_id,
                        guest_id=guest_id,
                        speaker=speaker,
                        content=text_chunk["content"],
                        start_time=timestamp or start_time,
                        chunk_index=chunk_index
                    )
                    
                    all_chunks.append(chunk)
                    chunk_index += 1
        
        return all_chunks
    
    def save_chunks(self, chunks: List[InterviewChunk]):
        """Save chunks to database (chunk_embeddings table)."""
        if not chunks:
            return
        
        try:
            # Prepare records
            records = []
            for chunk in chunks:
                records.append({
                    "chunk_id": chunk.chunk_id,
                    "episode_id": chunk.episode_id,
                    "guest_id": chunk.guest_id,
                    "content": chunk.content,
                    "speaker": chunk.speaker,
                    "timestamp": chunk.start_time,
                    "metadata": {
                        "chunk_index": chunk.chunk_index,
                        "speaker": chunk.speaker
                    }
                })
            
            # Upsert chunks (delete existing first)
            episode_id = chunks[0].episode_id
            self.supabase.table("chunk_embeddings").delete().eq("episode_id", episode_id).execute()
            
            # Insert in batches
            batch_size = 100
            for i in range(0, len(records), batch_size):
                batch = records[i:i + batch_size]
                self.supabase.table("chunk_embeddings").insert(batch).execute()
            
            print(f"  ✅ Saved {len(chunks)} chunks")
            
        except Exception as e:
            print(f"  ❌ Error saving chunks: {e}")
            import traceback
            traceback.print_exc()
    
    def process_all_episodes(self):
        """Process all episodes."""
        print("🚀 Starting Interview Chunking Pipeline")
        print("=" * 60)
        
        # Get all episodes
        try:
            response = self.supabase.table("episodes").select("id, slug, title").execute()
            episodes = response.data or []
        except Exception as e:
            print(f"❌ Error fetching episodes: {e}")
            return
        
        print(f"📁 Found {len(episodes)} episodes")
        
        success_count = 0
        error_count = 0
        
        for episode in tqdm(episodes, desc="Chunking episodes"):
            episode_id = episode["id"]
            episode_slug = episode["slug"]
            
            try:
                chunks = self.chunk_episode(episode_id)
                if chunks:
                    self.save_chunks(chunks)
                    success_count += 1
                else:
                    print(f"  ⚠️  No chunks generated for {episode_slug}")
            except Exception as e:
                print(f"  ❌ Error processing {episode_slug}: {e}")
                error_count += 1
        
        print("\n" + "=" * 60)
        print(f"✅ Successfully processed: {success_count}")
        print(f"❌ Errors: {error_count}")
        print(f"📊 Total: {len(episodes)}")


if __name__ == "__main__":
    import argparse
    
    parser = argparse.ArgumentParser(description="Chunk interview segments for vector DB")
    parser.add_argument("--episode-id", help="Process single episode by ID")
    parser.add_argument("--chunk-size", type=int, default=500, help="Chunk size in characters")
    parser.add_argument("--chunk-overlap", type=int, default=50, help="Chunk overlap in characters")
    
    args = parser.parse_args()
    
    chunker = InterviewChunker(
        chunk_size=args.chunk_size,
        chunk_overlap=args.chunk_overlap
    )
    
    if args.episode_id:
        # Process single episode
        chunks = chunker.chunk_episode(args.episode_id)
        chunker.save_chunks(chunks)
        print(f"✅ Generated {len(chunks)} chunks for episode {args.episode_id}")
    else:
        # Process all episodes
        chunker.process_all_episodes()

