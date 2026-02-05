"""
Theme Clustering - Creates emergent intent ontology using HDBSCAN.
This generates the ~30-60 themes that form the intent space.
"""
import numpy as np
from typing import List, Dict, Optional
from dataclasses import dataclass, asdict
import json
from sentence_transformers import SentenceTransformer
import hdbscan
from sklearn.preprocessing import StandardScaler


@dataclass
class Theme:
    """An emergent theme from the corpus."""
    theme_id: str
    label: Optional[str]  # Optional, mostly for debugging
    centroid_embedding: np.ndarray
    example_phrases: List[str]
    chunk_ids: List[str]  # Chunks that belong to this theme
    guest_ids: List[str]  # Guests who have chunks in this theme


class ThemeClusterer:
    """
    Clusters semantic descriptors and core theses into emergent themes.
    
    Process:
    1. Embed all semantic_descriptors + core_thesis
    2. Cluster using HDBSCAN
    3. Create Theme objects with centroids
    """
    
    def __init__(
        self,
        embedding_model: str = "all-MiniLM-L6-v2",
        min_cluster_size: int = 5,
        min_samples: int = 3
    ):
        self.encoder = SentenceTransformer(embedding_model)
        self.min_cluster_size = min_cluster_size
        self.min_samples = min_samples
    
    def cluster_themes(
        self,
        extractions: List[Dict],
        max_themes: int = 60
    ) -> List[Theme]:
        """
        Cluster theme extractions into emergent themes.
        
        Args:
            extractions: List of theme extractions with keys:
                - chunk_id
                - guest_id
                - semantic_descriptors (list)
                - core_thesis (str)
            max_themes: Maximum number of themes to create
        
        Returns:
            List of Theme objects
        """
        # Step 1: Collect all text to embed
        texts_to_embed = []
        extraction_metadata = []  # Track which extraction each text belongs to
        
        for ext in extractions:
            # Embed each semantic descriptor
            for descriptor in ext.get("semantic_descriptors", []):
                texts_to_embed.append(descriptor)
                extraction_metadata.append({
                    "type": "descriptor",
                    "chunk_id": ext["chunk_id"],
                    "guest_id": ext["guest_id"],
                    "text": descriptor
                })
            
            # Embed core thesis
            if ext.get("core_thesis"):
                texts_to_embed.append(ext["core_thesis"])
                extraction_metadata.append({
                    "type": "thesis",
                    "chunk_id": ext["chunk_id"],
                    "guest_id": ext["guest_id"],
                    "text": ext["core_thesis"]
                })
        
        if not texts_to_embed:
            return []
        
        # Step 2: Embed all texts
        print(f"Embedding {len(texts_to_embed)} texts...")
        embeddings = self.encoder.encode(texts_to_embed)
        embeddings = np.array(embeddings, dtype=np.float32)
        
        # Normalize embeddings
        scaler = StandardScaler()
        embeddings_scaled = scaler.fit_transform(embeddings)
        
        # Step 3: Cluster with HDBSCAN
        print(f"Clustering with HDBSCAN (min_cluster_size={self.min_cluster_size})...")
        clusterer = hdbscan.HDBSCAN(
            min_cluster_size=self.min_cluster_size,
            min_samples=self.min_samples,
            metric='euclidean'
        )
        cluster_labels = clusterer.fit_predict(embeddings_scaled)
        
        # Step 4: Create Theme objects
        themes = []
        unique_labels = set(cluster_labels)
        unique_labels.discard(-1)  # Remove noise label
        
        # Limit to max_themes
        if len(unique_labels) > max_themes:
            # Select largest clusters
            cluster_sizes = {label: np.sum(cluster_labels == label) for label in unique_labels}
            sorted_clusters = sorted(cluster_sizes.items(), key=lambda x: x[1], reverse=True)
            unique_labels = {label for label, _ in sorted_clusters[:max_themes]}
        
        for theme_idx, label in enumerate(sorted(unique_labels)):
            # Get all texts in this cluster
            cluster_mask = cluster_labels == label
            cluster_embeddings = embeddings_scaled[cluster_mask]
            cluster_metadata = [extraction_metadata[i] for i in range(len(extraction_metadata)) if cluster_mask[i]]
            
            # Compute centroid
            centroid = np.mean(cluster_embeddings, axis=0)
            
            # Get example phrases (most representative)
            # Use the texts closest to centroid
            distances_to_centroid = np.linalg.norm(cluster_embeddings - centroid, axis=1)
            closest_indices = np.argsort(distances_to_centroid)[:5]
            example_phrases = [cluster_metadata[i]["text"] for i in closest_indices]
            
            # Get unique chunk_ids and guest_ids
            chunk_ids = list(set(m["chunk_id"] for m in cluster_metadata))
            guest_ids = list(set(m["guest_id"] for m in cluster_metadata))
            
            theme = Theme(
                theme_id=f"T{theme_idx:02d}",
                label=self._generate_label(example_phrases),
                centroid_embedding=centroid,
                example_phrases=example_phrases,
                chunk_ids=chunk_ids,
                guest_ids=guest_ids
            )
            themes.append(theme)
        
        print(f"Created {len(themes)} themes")
        return themes
    
    def _generate_label(self, example_phrases: List[str]) -> str:
        """Generate a human-readable label for a theme (optional, for debugging)."""
        # Simple heuristic: use first example phrase, or combine common words
        if not example_phrases:
            return "Unknown"
        
        # For now, just use the first phrase (could be improved with LLM)
        return example_phrases[0][:50]
    
    def assign_chunks_to_themes(
        self,
        chunks: List[Dict],
        themes: List[Theme]
    ) -> Dict[str, str]:
        """
        Assign chunks to themes based on their embeddings.
        
        Args:
            chunks: List of chunks with keys: chunk_id, text, guest_id
            themes: List of Theme objects
            
        Returns:
            Dict mapping chunk_id -> theme_id
        """
        if not themes:
            return {}
        
        # Embed all chunk texts
        chunk_texts = [chunk["text"] for chunk in chunks]
        chunk_embeddings = self.encoder.encode(chunk_texts)
        chunk_embeddings = np.array(chunk_embeddings, dtype=np.float32)
        
        # Normalize
        scaler = StandardScaler()
        chunk_embeddings_scaled = scaler.fit_transform(chunk_embeddings)
        
        # Assign each chunk to nearest theme centroid
        assignments = {}
        theme_centroids = np.array([theme.centroid_embedding for theme in themes])
        
        for i, chunk in enumerate(chunks):
            chunk_emb = chunk_embeddings_scaled[i]
            distances = np.linalg.norm(theme_centroids - chunk_emb, axis=1)
            nearest_theme_idx = np.argmin(distances)
            assignments[chunk["chunk_id"]] = themes[nearest_theme_idx].theme_id
        
        return assignments


if __name__ == "__main__":
    # Test clusterer
    clusterer = ThemeClusterer()
    
    # Sample extractions
    test_extractions = [
        {
            "chunk_id": "c_001",
            "guest_id": "patrick-collison",
            "semantic_descriptors": ["long-term thinking", "founder decision-making"],
            "core_thesis": "Founders should optimize for durability of decisions."
        },
        {
            "chunk_id": "c_002",
            "guest_id": "brian-chesky",
            "semantic_descriptors": ["founder decision-making", "organizational design"],
            "core_thesis": "CEOs should be involved in product details."
        },
        {
            "chunk_id": "c_003",
            "guest_id": "marty-cagan",
            "semantic_descriptors": ["product management", "customer needs"],
            "core_thesis": "Product management is about understanding customer needs."
        }
    ]
    
    themes = clusterer.cluster_themes(test_extractions, max_themes=10)
    print(f"\nCreated {len(themes)} themes:")
    for theme in themes:
        print(f"\n  {theme.theme_id}: {theme.label}")
        print(f"    Examples: {theme.example_phrases[:3]}")
        print(f"    Guests: {theme.guest_ids}")

