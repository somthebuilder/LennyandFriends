"""
Guest-Theme Strength Mapping - Computes how strongly each guest relates to each theme.
This is precomputed once and used for guest selection.
"""
from typing import Dict, List
from dataclasses import dataclass
from collections import defaultdict

from .theme_clusterer import Theme


@dataclass
class GuestThemeStrength:
    """Strength mapping for a single guest."""
    guest_id: str
    theme_strengths: Dict[str, float]  # theme_id -> strength (0-1)


class GuestThemeMapper:
    """
    Computes guest-theme strength relationships.
    
    Strength is derived from:
    1. Number of chunks in theme
    2. Depth (thesis-level vs passing mention)
    3. Spread across episodes
    """
    
    def compute_strengths(
        self,
        themes: List[Theme],
        chunk_theme_assignments: Dict[str, str],  # chunk_id -> theme_id
        chunk_metadata: Dict[str, Dict]  # chunk_id -> {guest_id, episode_id, ...}
    ) -> Dict[str, GuestThemeStrength]:
        """
        Compute guest-theme strength mappings.
        
        Args:
            themes: List of Theme objects
            chunk_theme_assignments: Mapping of chunk_id to theme_id
            chunk_metadata: Metadata for each chunk
            
        Returns:
            Dict mapping guest_id -> GuestThemeStrength
        """
        # Build guest -> theme -> chunks mapping
        guest_theme_chunks = defaultdict(lambda: defaultdict(list))
        guest_episodes = defaultdict(set)
        
        for chunk_id, theme_id in chunk_theme_assignments.items():
            if chunk_id not in chunk_metadata:
                continue
            
            metadata = chunk_metadata[chunk_id]
            guest_id = metadata.get("guest_id")
            episode_id = metadata.get("episode_id")
            
            if guest_id and theme_id:
                guest_theme_chunks[guest_id][theme_id].append(chunk_id)
                if episode_id:
                    guest_episodes[guest_id].add(episode_id)
        
        # Compute strengths for each guest
        guest_strengths = {}
        
        for guest_id in guest_theme_chunks:
            theme_strengths = {}
            
            # Get all chunks for this guest
            guest_chunks = set()
            for theme_chunks in guest_theme_chunks[guest_id].values():
                guest_chunks.update(theme_chunks)
            
            total_guest_chunks = len(guest_chunks)
            guest_episode_count = len(guest_episodes.get(guest_id, set()))
            
            # Compute strength for each theme
            for theme_id, theme_chunk_ids in guest_theme_chunks[guest_id].items():
                strength = self._compute_theme_strength(
                    theme_id=theme_id,
                    theme_chunk_ids=theme_chunk_ids,
                    total_guest_chunks=total_guest_chunks,
                    guest_episode_count=guest_episode_count,
                    chunk_metadata=chunk_metadata
                )
                
                if strength > 0:
                    theme_strengths[theme_id] = strength
            
            guest_strengths[guest_id] = GuestThemeStrength(
                guest_id=guest_id,
                theme_strengths=theme_strengths
            )
        
        return guest_strengths
    
    def _compute_theme_strength(
        self,
        theme_id: str,
        theme_chunk_ids: List[str],
        total_guest_chunks: int,
        guest_episode_count: int,
        chunk_metadata: Dict[str, Dict]
    ) -> float:
        """
        Compute strength score for a guest-theme relationship.
        
        Factors:
        1. Proportion of guest's chunks in this theme (0-1)
        2. Depth: whether chunks are thesis-level (weighted)
        3. Spread: number of episodes this theme appears in
        """
        if not theme_chunk_ids or total_guest_chunks == 0:
            return 0.0
        
        # Factor 1: Proportion
        proportion = len(theme_chunk_ids) / total_guest_chunks
        
        # Factor 2: Depth (simplified - assume all chunks are equal depth for now)
        # TODO: Could weight by whether chunk has core_thesis vs just descriptors
        depth_weight = 1.0
        
        # Factor 3: Spread across episodes
        theme_episodes = set()
        for chunk_id in theme_chunk_ids:
            if chunk_id in chunk_metadata:
                episode_id = chunk_metadata[chunk_id].get("episode_id")
                if episode_id:
                    theme_episodes.add(episode_id)
        
        spread = len(theme_episodes) / max(guest_episode_count, 1)
        
        # Combined strength (weighted average)
        strength = (
            0.5 * proportion +      # 50% weight on proportion
            0.3 * depth_weight +    # 30% weight on depth
            0.2 * spread            # 20% weight on spread
        )
        
        # Normalize to 0-1
        return min(strength, 1.0)
    
    def get_guest_strength_dict(
        self,
        guest_strengths: Dict[str, GuestThemeStrength]
    ) -> Dict[str, Dict[str, float]]:
        """
        Convert GuestThemeStrength objects to simple dict format.
        
        Returns:
            Dict mapping guest_id -> {theme_id: strength}
        """
        return {
            guest_id: gts.theme_strengths
            for guest_id, gts in guest_strengths.items()
        }


if __name__ == "__main__":
    # Test mapper
    from theme_clusterer import Theme
    import numpy as np
    
    # Sample data
    themes = [
        Theme(
            theme_id="T01",
            label="Decision-making",
            centroid_embedding=np.random.rand(384),
            example_phrases=["decisions", "judgment"],
            chunk_ids=["c_001", "c_002"],
            guest_ids=["guest1", "guest2"]
        )
    ]
    
    chunk_assignments = {
        "c_001": "T01",
        "c_002": "T01",
        "c_003": "T01"
    }
    
    chunk_metadata = {
        "c_001": {"guest_id": "guest1", "episode_id": "ep1"},
        "c_002": {"guest_id": "guest1", "episode_id": "ep2"},
        "c_003": {"guest_id": "guest2", "episode_id": "ep1"}
    }
    
    mapper = GuestThemeMapper()
    strengths = mapper.compute_strengths(themes, chunk_assignments, chunk_metadata)
    
    print("Guest-Theme Strengths:")
    for guest_id, gts in strengths.items():
        print(f"\n  {guest_id}:")
        for theme_id, strength in gts.theme_strengths.items():
            print(f"    {theme_id}: {strength:.3f}")

