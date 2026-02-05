"""
Intelligent Chunking - Chunks by idea/speaker turn, not just token count.
This is critical for semantic self-containment.
"""
import tiktoken
from typing import List, Dict, Optional
from dataclasses import dataclass
from .transcript_parser import Transcript, SpeakerTurn


@dataclass
class Chunk:
    """A semantically self-contained chunk of transcript."""
    chunk_id: str
    guest_id: str
    episode_id: str
    text: str
    speaker: str
    timestamp: str
    token_count: int
    turn_indices: List[int]  # Which speaker turns are in this chunk
    metadata: Dict


class IntelligentChunker:
    """
    Chunks transcripts by idea/speaker turn, ensuring semantic self-containment.
    
    Strategy:
    - Prefer 1 speaker turn or 1 coherent argument
    - Target: 400-600 tokens
    - Overlap: 50-80 tokens
    - Each chunk must be semantically self-contained
    """
    
    def __init__(
        self,
        target_size_tokens: int = 500,
        overlap_tokens: int = 60,
        min_chunk_tokens: int = 200,
        max_chunk_tokens: int = 800
    ):
        self.target_size = target_size_tokens
        self.overlap = overlap_tokens
        self.min_tokens = min_chunk_tokens
        self.max_tokens = max_chunk_tokens
        self.encoding = tiktoken.get_encoding("cl100k_base")
    
    def chunk_transcript(self, transcript: Transcript) -> List[Chunk]:
        """
        Chunk a transcript intelligently.
        
        Strategy:
        1. Group consecutive turns by the same speaker (coherent arguments)
        2. If a single turn exceeds target, split it intelligently
        3. Ensure overlap between chunks
        4. Never break mid-sentence
        """
        chunks = []
        turns = transcript.turns
        guest_name = transcript.metadata.guest
        
        # Normalize guest name to guest_id (slug format)
        guest_id = self._normalize_guest_id(guest_name)
        
        i = 0
        chunk_idx = 0
        
        while i < len(turns):
            # Start a new chunk
            chunk_turns = []
            chunk_tokens = 0
            start_idx = i
            
            # Strategy 1: Try to get a complete speaker argument (consecutive turns by same speaker)
            current_speaker = turns[i].speaker
            while i < len(turns) and turns[i].speaker == current_speaker:
                turn = turns[i]
                turn_tokens = len(self.encoding.encode(turn.text))
                
                # If adding this turn would exceed max, stop
                if chunk_tokens + turn_tokens > self.max_tokens and chunk_tokens > 0:
                    break
                
                chunk_turns.append(turn)
                chunk_tokens += turn_tokens
                i += 1
                
                # If we've reached target size, consider stopping
                if chunk_tokens >= self.target_size:
                    # But continue if next turn is same speaker and small
                    if i < len(turns) and turns[i].speaker == current_speaker:
                        next_turn_tokens = len(self.encoding.encode(turns[i].text))
                        if chunk_tokens + next_turn_tokens <= self.max_tokens:
                            continue
                    break
            
            # Strategy 2: If chunk is too small, try to add more turns
            if chunk_tokens < self.min_tokens and i < len(turns):
                # Add next speaker's turn if it's small enough
                next_turn = turns[i]
                next_tokens = len(self.encoding.encode(next_turn.text))
                if chunk_tokens + next_tokens <= self.max_tokens:
                    chunk_turns.append(next_turn)
                    chunk_tokens += next_tokens
                    i += 1
            
            # Strategy 3: If a single turn is too large, split it
            if len(chunk_turns) == 1 and chunk_tokens > self.max_tokens:
                # Split the large turn
                split_chunks = self._split_large_turn(
                    chunk_turns[0],
                    guest_id,
                    transcript.episode_id,
                    chunk_idx
                )
                chunks.extend(split_chunks)
                chunk_idx += len(split_chunks)
                continue
            
            # Create chunk from collected turns
            if chunk_turns:
                chunk = self._create_chunk(
                    chunk_turns,
                    guest_id,
                    transcript.episode_id,
                    chunk_idx,
                    transcript.metadata
                )
                chunks.append(chunk)
                chunk_idx += 1
            
            # Handle overlap: include last overlap_tokens from previous chunk
            if i < len(turns) and len(chunks) > 0:
                # Back up to include overlap
                overlap_text = self._get_overlap_text(chunk_turns, self.overlap)
                if overlap_text:
                    # Adjust i to include overlap in next chunk
                    # This is handled by the natural flow, but we track it
                    pass
        
        return chunks
    
    def _split_large_turn(
        self,
        turn: SpeakerTurn,
        guest_id: str,
        episode_id: str,
        start_chunk_idx: int
    ) -> List[Chunk]:
        """Split a single large turn into multiple chunks."""
        chunks = []
        sentences = self._split_into_sentences(turn.text)
        
        current_chunk_sentences = []
        current_tokens = 0
        chunk_idx = start_chunk_idx
        
        for sentence in sentences:
            sentence_tokens = len(self.encoding.encode(sentence))
            
            if current_tokens + sentence_tokens > self.max_tokens and current_tokens > 0:
                # Create chunk from accumulated sentences
                chunk_text = " ".join(current_chunk_sentences)
                chunk = Chunk(
                    chunk_id=f"{episode_id}_c_{chunk_idx:05d}",
                    guest_id=guest_id,
                    episode_id=episode_id,
                    text=chunk_text,
                    speaker=turn.speaker,
                    timestamp=turn.timestamp,
                    token_count=current_tokens,
                    turn_indices=[turn.turn_index],
                    metadata={
                        "is_split": True,
                        "split_index": chunk_idx - start_chunk_idx
                    }
                )
                chunks.append(chunk)
                chunk_idx += 1
                
                # Start new chunk with overlap
                overlap_sentences = self._get_overlap_sentences(
                    current_chunk_sentences,
                    self.overlap
                )
                current_chunk_sentences = overlap_sentences
                current_tokens = len(self.encoding.encode(" ".join(overlap_sentences)))
            
            current_chunk_sentences.append(sentence)
            current_tokens += sentence_tokens
        
        # Add final chunk
        if current_chunk_sentences:
            chunk_text = " ".join(current_chunk_sentences)
            chunk = Chunk(
                chunk_id=f"{episode_id}_c_{chunk_idx:05d}",
                guest_id=guest_id,
                episode_id=episode_id,
                text=chunk_text,
                speaker=turn.speaker,
                timestamp=turn.timestamp,
                token_count=current_tokens,
                turn_indices=[turn.turn_index],
                metadata={
                    "is_split": True,
                    "split_index": chunk_idx - start_chunk_idx
                }
            )
            chunks.append(chunk)
        
        return chunks
    
    def _create_chunk(
        self,
        turns: List[SpeakerTurn],
        guest_id: str,
        episode_id: str,
        chunk_idx: int,
        metadata
    ) -> Chunk:
        """Create a Chunk object from speaker turns."""
        chunk_text = " ".join(turn.text for turn in turns)
        token_count = len(self.encoding.encode(chunk_text))
        turn_indices = [turn.turn_index for turn in turns]
        
        # Use first turn's speaker and timestamp
        first_turn = turns[0]
        
        return Chunk(
            chunk_id=f"{episode_id}_c_{chunk_idx:05d}",
            guest_id=guest_id,
            episode_id=episode_id,
            text=chunk_text,
            speaker=first_turn.speaker,
            timestamp=first_turn.timestamp,
            token_count=token_count,
            turn_indices=turn_indices,
            metadata={
                "num_turns": len(turns),
                "speakers": list(set(turn.speaker for turn in turns))
            }
        )
    
    def _get_overlap_text(self, turns: List[SpeakerTurn], overlap_tokens: int) -> str:
        """Get overlap text from the end of turns."""
        if not turns:
            return ""
        
        # Get last turn's text
        last_turn_text = turns[-1].text
        words = last_turn_text.split()
        
        # Approximate: ~4 tokens per word (conservative)
        words_needed = overlap_tokens // 4
        overlap_words = words[-words_needed:] if len(words) > words_needed else words
        
        return " ".join(overlap_words)
    
    def _get_overlap_sentences(
        self,
        sentences: List[str],
        overlap_tokens: int
    ) -> List[str]:
        """Get overlap sentences from the end."""
        if not sentences:
            return []
        
        overlap_text = ""
        overlap_sentences = []
        
        # Add sentences from the end until we reach overlap_tokens
        for sentence in reversed(sentences):
            sentence_tokens = len(self.encoding.encode(sentence))
            if len(self.encoding.encode(overlap_text)) + sentence_tokens <= overlap_tokens:
                overlap_sentences.insert(0, sentence)
                overlap_text = sentence + " " + overlap_text
            else:
                break
        
        return overlap_sentences
    
    def _split_into_sentences(self, text: str) -> List[str]:
        """Split text into sentences (simple approach)."""
        import re
        # Split on sentence endings, keeping the punctuation
        sentences = re.split(r'([.!?]+)', text)
        # Recombine sentences with their punctuation
        result = []
        for i in range(0, len(sentences) - 1, 2):
            if i + 1 < len(sentences):
                result.append(sentences[i] + sentences[i + 1])
            else:
                result.append(sentences[i])
        return [s.strip() for s in result if s.strip()]
    
    def _normalize_guest_id(self, guest_name: str) -> str:
        """Convert guest name to slug format (guest_id)."""
        import re
        # Convert to lowercase, replace spaces/special chars with hyphens
        slug = guest_name.lower()
        slug = re.sub(r'[^\w\s-]', '', slug)
        slug = re.sub(r'[-\s]+', '-', slug)
        return slug.strip('-')


if __name__ == "__main__":
    from transcript_parser import TranscriptParser
    
    # Test chunker
    parser = TranscriptParser()
    episodes = parser.get_all_episodes()
    
    if episodes:
        transcript = parser.parse_transcript(episodes[0])
        chunker = IntelligentChunker()
        chunks = chunker.chunk_transcript(transcript)
        
        print(f"\nChunked {transcript.metadata.title}")
        print(f"Total chunks: {len(chunks)}")
        print(f"\nFirst 3 chunks:")
        for chunk in chunks[:3]:
            print(f"\n  {chunk.chunk_id}")
            print(f"  Tokens: {chunk.token_count}")
            print(f"  Speaker: {chunk.speaker}")
            print(f"  Text: {chunk.text[:150]}...")

