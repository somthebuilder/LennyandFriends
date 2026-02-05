"""
Transcript Parser - Extracts structured data from transcript markdown files.
"""
import re
import yaml
from pathlib import Path
from typing import Dict, List, Optional, Tuple
from dataclasses import dataclass


@dataclass
class SpeakerTurn:
    """Represents a single speaker turn in the transcript."""
    speaker: str
    timestamp: str
    text: str
    turn_index: int


@dataclass
class EpisodeMetadata:
    """Metadata extracted from transcript frontmatter."""
    guest: str
    title: str
    youtube_url: str
    video_id: str
    publish_date: str
    description: str
    duration_seconds: float
    duration: str
    view_count: Optional[int] = None
    channel: str = "Lenny's Podcast"
    keywords: Optional[List[str]] = None


@dataclass
class Transcript:
    """Complete transcript with metadata and speaker turns."""
    metadata: EpisodeMetadata
    turns: List[SpeakerTurn]
    episode_id: str  # slug from directory name


class TranscriptParser:
    """Parses transcript markdown files into structured format."""
    
    # Pattern to match speaker turns: "Speaker Name (HH:MM:SS): text"
    SPEAKER_PATTERN = re.compile(
        r'^([^(]+)\s*\((\d{2}:\d{2}:\d{2})\):\s*(.+)$',
        re.MULTILINE
    )
    
    def __init__(self, episodes_dir: str = "episodes"):
        self.episodes_dir = Path(episodes_dir)
    
    def parse_transcript(self, transcript_path: Path) -> Transcript:
        """
        Parse a transcript markdown file.
        
        Args:
            transcript_path: Path to transcript.md file
            
        Returns:
            Transcript object with metadata and turns
        """
        content = transcript_path.read_text(encoding='utf-8')
        
        # Extract episode_id from path: episodes/{slug}/transcript.md
        episode_id = transcript_path.parent.name
        
        # Split frontmatter and content
        parts = content.split('---', 2)
        if len(parts) < 3:
            raise ValueError(f"Invalid transcript format: {transcript_path}")
        
        # Parse frontmatter
        frontmatter_text = parts[1].strip()
        metadata_dict = yaml.safe_load(frontmatter_text)
        metadata = EpisodeMetadata(**metadata_dict)
        
        # Parse transcript content
        transcript_text = parts[2]
        turns = self._parse_speaker_turns(transcript_text)
        
        return Transcript(
            metadata=metadata,
            turns=turns,
            episode_id=episode_id
        )
    
    def _parse_speaker_turns(self, text: str) -> List[SpeakerTurn]:
        """
        Extract speaker turns from transcript text.
        
        Args:
            text: Transcript content (without frontmatter)
            
        Returns:
            List of SpeakerTurn objects
        """
        turns = []
        matches = self.SPEAKER_PATTERN.finditer(text)
        
        for idx, match in enumerate(matches):
            speaker = match.group(1).strip()
            timestamp = match.group(2)
            text_content = match.group(3).strip()
            
            # Skip empty turns
            if not text_content:
                continue
            
            turn = SpeakerTurn(
                speaker=speaker,
                timestamp=timestamp,
                text=text_content,
                turn_index=idx
            )
            turns.append(turn)
        
        # If no structured turns found, try to parse as paragraphs
        if not turns:
            turns = self._parse_fallback(text)
        
        return turns
    
    def _parse_fallback(self, text: str) -> List[SpeakerTurn]:
        """
        Fallback parser for transcripts without structured speaker turns.
        Splits by paragraphs and attempts to identify speakers.
        """
        turns = []
        paragraphs = text.split('\n\n')
        
        for idx, para in enumerate(paragraphs):
            para = para.strip()
            if not para or len(para) < 10:
                continue
            
            # Try to extract speaker from first line
            lines = para.split('\n', 1)
            if len(lines) > 1:
                first_line = lines[0].strip()
                # Check if first line looks like a speaker name
                if ':' in first_line and len(first_line) < 50:
                    speaker = first_line.split(':')[0].strip()
                    text_content = lines[1].strip()
                else:
                    speaker = "Unknown"
                    text_content = para
            else:
                speaker = "Unknown"
                text_content = para
            
            turn = SpeakerTurn(
                speaker=speaker,
                timestamp="00:00:00",
                text=text_content,
                turn_index=idx
            )
            turns.append(turn)
        
        return turns
    
    def get_all_episodes(self) -> List[Path]:
        """Get all transcript file paths."""
        return list(self.episodes_dir.glob("*/transcript.md"))
    
    def parse_all_episodes(self) -> List[Transcript]:
        """Parse all transcripts in the episodes directory."""
        transcripts = []
        episode_paths = self.get_all_episodes()
        
        for path in episode_paths:
            try:
                transcript = self.parse_transcript(path)
                transcripts.append(transcript)
            except Exception as e:
                print(f"Error parsing {path}: {e}")
                continue
        
        return transcripts


if __name__ == "__main__":
    # Test parser
    parser = TranscriptParser()
    episodes = parser.get_all_episodes()
    print(f"Found {len(episodes)} episodes")
    
    if episodes:
        test_transcript = parser.parse_transcript(episodes[0])
        print(f"\nTest episode: {test_transcript.metadata.title}")
        print(f"Guest: {test_transcript.metadata.guest}")
        print(f"Turns: {len(test_transcript.turns)}")
        print(f"\nFirst turn:")
        if test_transcript.turns:
            turn = test_transcript.turns[0]
            print(f"  {turn.speaker} ({turn.timestamp}): {turn.text[:100]}...")

