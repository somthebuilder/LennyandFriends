"""
Runtime Intelligence - Theme matching, guest selection, ambiguity detection.
This is the "routing" layer that decides who should speak.
"""
import numpy as np
from typing import List, Dict, Optional, Tuple
from dataclasses import dataclass
from sentence_transformers import SentenceTransformer

from ..knowledge.theme_clusterer import Theme
from ..knowledge.vector_store import VectorStore


@dataclass
class ActiveTheme:
    """An active theme with relevance score."""
    theme_id: str
    score: float


@dataclass
class GuestScore:
    """A guest's relevance score for a query."""
    guest_id: str
    guest_name: str
    score: float
    contributing_themes: List[str]  # Theme IDs that contributed


class RuntimeIntelligence:
    """
    Runtime intelligence layer for routing queries to guests.
    
    Responsibilities:
    1. Theme matching (intent detection)
    2. Confidence/ambiguity detection
    3. Guest selection and scoring
    """
    
    def __init__(
        self,
        themes: List[Theme],
        guest_theme_strengths: Dict[str, Dict[str, float]],
        vector_store: VectorStore,
        embedding_model: str = "all-MiniLM-L6-v2"
    ):
        """
        Initialize runtime intelligence.
        
        Args:
            themes: List of Theme objects
            guest_theme_strengths: Dict mapping guest_id -> {theme_id: strength}
            vector_store: Vector store for additional retrieval
            embedding_model: Embedding model name
        """
        self.themes = {theme.theme_id: theme for theme in themes}
        self.guest_theme_strengths = guest_theme_strengths
        self.vector_store = vector_store
        self.encoder = SentenceTransformer(embedding_model)
        
        # Pre-compute theme centroids
        self.theme_centroids = {
            theme_id: theme.centroid_embedding
            for theme_id, theme in self.themes.items()
        }
    
    def match_themes(
        self,
        query: str,
        top_n: int = 5,
        min_score: float = 0.3
    ) -> List[ActiveTheme]:
        """
        Match user query to themes (intent detection).
        
        Args:
            query: User's question
            top_n: Number of themes to return
            min_score: Minimum score threshold
            
        Returns:
            List of ActiveTheme objects, sorted by score
        """
        # Embed query
        query_embedding = self.encoder.encode([query])[0]
        query_embedding = np.array(query_embedding, dtype=np.float32)
        
        # Normalize
        query_embedding = query_embedding / np.linalg.norm(query_embedding)
        
        # Compare against theme centroids
        theme_scores = []
        for theme_id, centroid in self.theme_centroids.items():
            # Normalize centroid
            centroid_norm = centroid / np.linalg.norm(centroid)
            
            # Cosine similarity
            score = np.dot(query_embedding, centroid_norm)
            
            if score >= min_score:
                theme_scores.append(ActiveTheme(
                    theme_id=theme_id,
                    score=float(score)
                ))
        
        # Sort by score (descending)
        theme_scores.sort(key=lambda x: x.score, reverse=True)
        
        return theme_scores[:top_n]
    
    def check_ambiguity(
        self,
        active_themes: List[ActiveTheme],
        threshold: float = 0.6,
        closeness_threshold: float = 0.1
    ) -> Tuple[bool, Optional[str]]:
        """
        Check if query is ambiguous and needs Lenny clarification.
        
        Triggers if:
        - Top theme score < threshold
        - Top 2 themes are very close (within closeness_threshold)
        
        Args:
            active_themes: List of matched themes
            threshold: Minimum score for confidence
            closeness_threshold: Max difference between top 2 themes
            
        Returns:
            (is_ambiguous, reason)
        """
        if not active_themes:
            return True, "No themes matched"
        
        top_score = active_themes[0].score
        
        # Check threshold
        if top_score < threshold:
            return True, f"Top theme score ({top_score:.2f}) below threshold ({threshold})"
        
        # Check if top 2 are too close
        if len(active_themes) >= 2:
            score_diff = active_themes[0].score - active_themes[1].score
            if score_diff < closeness_threshold:
                return True, f"Top 2 themes too close (diff: {score_diff:.2f})"
        
        return False, None
    
    def select_guests(
        self,
        active_themes: List[ActiveTheme],
        max_guests: int = 10,
        min_score: float = 0.3,
        diversity_weight: float = 0.2
    ) -> List[GuestScore]:
        """
        Select and score guests based on active themes.
        
        Formula: GuestScore = Σ (ThemeScore × GuestThemeStrength)
        
        Args:
            active_themes: List of matched themes
            max_guests: Maximum number of guests to return
            min_score: Minimum guest score
            diversity_weight: Weight for diversity (not implemented yet)
            
        Returns:
            List of GuestScore objects, sorted by score
        """
        guest_scores = {}
        
        # Calculate scores for each guest
        for theme in active_themes:
            theme_id = theme.theme_id
            theme_score = theme.score
            
            # For each guest, add their contribution
            for guest_id, theme_strengths in self.guest_theme_strengths.items():
                if theme_id in theme_strengths:
                    guest_strength = theme_strengths[theme_id]
                    contribution = theme_score * guest_strength
                    
                    if guest_id not in guest_scores:
                        guest_scores[guest_id] = {
                            "score": 0.0,
                            "themes": []
                        }
                    
                    guest_scores[guest_id]["score"] += contribution
                    guest_scores[guest_id]["themes"].append(theme_id)
        
        # Convert to GuestScore objects
        guest_score_objects = []
        for guest_id, data in guest_scores.items():
            if data["score"] >= min_score:
                # Get guest name (would need a mapping)
                guest_name = self._get_guest_name(guest_id)
                
                guest_score_objects.append(GuestScore(
                    guest_id=guest_id,
                    guest_name=guest_name,
                    score=data["score"],
                    contributing_themes=data["themes"]
                ))
        
        # Sort by score
        guest_score_objects.sort(key=lambda x: x.score, reverse=True)
        
        # Apply diversity (simple: limit guests per theme)
        # TODO: More sophisticated diversity algorithm
        diverse_guests = self._apply_diversity(guest_score_objects, max_guests)
        
        return diverse_guests[:max_guests]
    
    def _apply_diversity(
        self,
        guest_scores: List[GuestScore],
        max_guests: int
    ) -> List[GuestScore]:
        """
        Apply diversity constraints to guest selection.
        Ensures we don't get 10 guests all talking about the same thing.
        """
        selected = []
        theme_counts = {}
        
        for guest in guest_scores:
            # Check if adding this guest would over-represent any theme
            can_add = True
            for theme_id in guest.contributing_themes:
                current_count = theme_counts.get(theme_id, 0)
                # Limit: max 3 guests per theme
                if current_count >= 3:
                    # Check if this guest is significantly better than already selected
                    # Simple heuristic: if score is much higher, allow it
                    if guest.score < 0.8:
                        can_add = False
                        break
            
            if can_add:
                selected.append(guest)
                for theme_id in guest.contributing_themes:
                    theme_counts[theme_id] = theme_counts.get(theme_id, 0) + 1
                
                if len(selected) >= max_guests:
                    break
        
        # If we didn't fill up, add remaining guests
        remaining = [g for g in guest_scores if g not in selected]
        selected.extend(remaining[:max_guests - len(selected)])
        
        return selected
    
    def _get_guest_name(self, guest_id: str) -> str:
        """Get guest display name from guest_id."""
        # TODO: Load from metadata
        # For now, convert slug to name
        return guest_id.replace("-", " ").title()


if __name__ == "__main__":
    print("Runtime Intelligence test - requires themes and guest mappings")
    print("See build_knowledge_base.py for full pipeline")

