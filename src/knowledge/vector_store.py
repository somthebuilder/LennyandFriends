"""
Vector Store - FAISS-based RAG storage with metadata filtering.
This is the core RAG infrastructure.
"""
import numpy as np
import faiss
import json
import pickle
from pathlib import Path
from typing import List, Dict, Optional, Tuple
from dataclasses import dataclass, asdict
from sentence_transformers import SentenceTransformer
import os


@dataclass
class ChunkMetadata:
    """Metadata for a chunk in the vector store."""
    chunk_id: str
    guest_id: str
    episode_id: str
    theme_id: Optional[str] = None
    speaker: Optional[str] = None
    timestamp: Optional[str] = None
    token_count: Optional[int] = None


@dataclass
class SearchResult:
    """A search result from the vector store."""
    chunk_id: str
    text: str
    score: float
    metadata: ChunkMetadata


class VectorStore:
    """
    FAISS-based vector store for RAG.
    
    Stores:
    - Chunk embeddings
    - Chunk text
    - Metadata (guest_id, episode_id, theme_id)
    
    Supports:
    - Semantic search
    - Metadata filtering (by guest_id, theme_id, etc.)
    """
    
    def __init__(
        self,
        embedding_model: str = "all-MiniLM-L6-v2",
        dimension: Optional[int] = None,
        index_path: Optional[str] = None
    ):
        """
        Initialize vector store.
        
        Args:
            embedding_model: Sentence transformer model name
            dimension: Embedding dimension (auto-detected if None)
            index_path: Path to save/load index
        """
        self.embedding_model_name = embedding_model
        self.encoder = SentenceTransformer(embedding_model)
        
        # Get dimension from model
        if dimension is None:
            # Create a dummy embedding to get dimension
            test_embedding = self.encoder.encode(["test"])
            dimension = test_embedding.shape[1]
        
        self.dimension = dimension
        self.index_path = index_path
        
        # FAISS index (L2 distance)
        self.index = faiss.IndexFlatL2(dimension)
        
        # Storage for texts and metadata
        self.chunks: Dict[str, str] = {}  # chunk_id -> text
        self.metadata: Dict[str, ChunkMetadata] = {}  # chunk_id -> metadata
        self.chunk_id_order: List[str] = []  # Track order for FAISS index mapping
        
        # Load if index exists
        if index_path and Path(index_path).exists():
            self.load(index_path)
    
    def add_chunk(
        self,
        chunk_id: str,
        text: str,
        metadata: ChunkMetadata,
        embedding: Optional[np.ndarray] = None
    ):
        """
        Add a chunk to the vector store.
        
        Args:
            chunk_id: Unique identifier
            text: Chunk text
            metadata: Chunk metadata
            embedding: Pre-computed embedding (optional)
        """
        # Compute embedding if not provided
        if embedding is None:
            embedding = self.encoder.encode([text])[0]
        
        # Ensure embedding is the right shape and type
        embedding = np.array(embedding, dtype=np.float32).reshape(1, -1)
        
        # Add to index
        self.index.add(embedding)
        
        # Store text and metadata
        self.chunks[chunk_id] = text
        self.metadata[chunk_id] = metadata
        self.chunk_id_order.append(chunk_id)
    
    def add_chunks_batch(
        self,
        chunks: List[Dict],
        embeddings: Optional[np.ndarray] = None
    ):
        """
        Add multiple chunks at once (more efficient).
        
        Args:
            chunks: List of dicts with keys: chunk_id, text, metadata
            embeddings: Pre-computed embeddings (optional)
        """
        texts = [chunk["text"] for chunk in chunks]
        
        # Compute embeddings if not provided
        if embeddings is None:
            embeddings = self.encoder.encode(texts)
        
        # Ensure correct shape and type
        embeddings = np.array(embeddings, dtype=np.float32)
        
        # Add to index
        self.index.add(embeddings)
        
        # Store texts and metadata
        for i, chunk in enumerate(chunks):
            chunk_id = chunk["chunk_id"]
            self.chunks[chunk_id] = chunk["text"]
            self.metadata[chunk_id] = chunk["metadata"]
            self.chunk_id_order.append(chunk_id)
    
    def search(
        self,
        query: str,
        k: int = 10,
        filter_guest_id: Optional[str] = None,
        filter_theme_id: Optional[str] = None,
        filter_episode_id: Optional[str] = None
    ) -> List[SearchResult]:
        """
        Search the vector store with optional metadata filtering.
        
        Args:
            query: Search query text
            k: Number of results to return
            filter_guest_id: Filter by guest_id
            filter_theme_id: Filter by theme_id
            filter_episode_id: Filter by episode_id
            
        Returns:
            List of SearchResult objects, sorted by relevance
        """
        # Encode query
        query_embedding = self.encoder.encode([query])
        query_embedding = np.array(query_embedding, dtype=np.float32)
        
        # Search (get more results if filtering)
        search_k = k * 10 if any([filter_guest_id, filter_theme_id, filter_episode_id]) else k
        
        distances, indices = self.index.search(query_embedding, min(search_k, self.index.ntotal))
        
        results = []
        for dist, idx in zip(distances[0], indices[0]):
            if idx >= len(self.chunk_id_order):
                continue
            
            chunk_id = self.chunk_id_order[idx]
            metadata = self.metadata[chunk_id]
            
            # Apply filters
            if filter_guest_id and metadata.guest_id != filter_guest_id:
                continue
            if filter_theme_id and metadata.theme_id != filter_theme_id:
                continue
            if filter_episode_id and metadata.episode_id != filter_episode_id:
                continue
            
            # Convert L2 distance to similarity score (lower distance = higher similarity)
            score = 1.0 / (1.0 + dist)
            
            result = SearchResult(
                chunk_id=chunk_id,
                text=self.chunks[chunk_id],
                score=score,
                metadata=metadata
            )
            results.append(result)
            
            if len(results) >= k:
                break
        
        # Sort by score (descending)
        results.sort(key=lambda x: x.score, reverse=True)
        return results
    
    def get_chunk(self, chunk_id: str) -> Optional[Tuple[str, ChunkMetadata]]:
        """Get chunk text and metadata by chunk_id."""
        if chunk_id not in self.chunks:
            return None
        return (self.chunks[chunk_id], self.metadata[chunk_id])
    
    def save(self, path: Optional[str] = None):
        """Save the vector store to disk."""
        path = path or self.index_path
        if not path:
            raise ValueError("No path provided for saving")
        
        path = Path(path)
        path.mkdir(parents=True, exist_ok=True)
        
        # Save FAISS index
        faiss.write_index(self.index, str(path / "index.faiss"))
        
        # Save chunks and metadata
        with open(path / "chunks.json", "w") as f:
            json.dump(self.chunks, f)
        
        with open(path / "metadata.pkl", "wb") as f:
            pickle.dump(self.metadata, f)
        
        # Save chunk_id_order
        with open(path / "chunk_id_order.json", "w") as f:
            json.dump(self.chunk_id_order, f)
        
        # Save config
        config = {
            "embedding_model": self.embedding_model_name,
            "dimension": self.dimension,
            "num_chunks": len(self.chunks)
        }
        with open(path / "config.json", "w") as f:
            json.dump(config, f)
    
    def load(self, path: str):
        """Load the vector store from disk."""
        path = Path(path)
        
        # Load FAISS index
        self.index = faiss.read_index(str(path / "index.faiss"))
        
        # Load chunks and metadata
        with open(path / "chunks.json", "r") as f:
            self.chunks = json.load(f)
        
        with open(path / "metadata.pkl", "rb") as f:
            self.metadata = pickle.load(f)
        
        # Load chunk_id_order if available, otherwise reconstruct
        order_file = path / "chunk_id_order.json"
        if order_file.exists():
            with open(order_file, "r") as f:
                self.chunk_id_order = json.load(f)
        else:
            # Reconstruct from chunks dict (order may not be preserved)
            self.chunk_id_order = list(self.chunks.keys())
        
        # Load config
        with open(path / "config.json", "r") as f:
            config = json.load(f)
        
        print(f"Loaded vector store: {config['num_chunks']} chunks")
    
    def get_stats(self) -> Dict:
        """Get statistics about the vector store."""
        guest_counts = {}
        theme_counts = {}
        episode_counts = {}
        
        for chunk_id, metadata in self.metadata.items():
            guest_counts[metadata.guest_id] = guest_counts.get(metadata.guest_id, 0) + 1
            if metadata.theme_id:
                theme_counts[metadata.theme_id] = theme_counts.get(metadata.theme_id, 0) + 1
            episode_counts[metadata.episode_id] = episode_counts.get(metadata.episode_id, 0) + 1
        
        return {
            "total_chunks": len(self.chunks),
            "unique_guests": len(guest_counts),
            "unique_themes": len(theme_counts),
            "unique_episodes": len(episode_counts),
            "guest_counts": guest_counts,
            "theme_counts": theme_counts
        }


if __name__ == "__main__":
    # Test vector store
    store = VectorStore()
    
    # Add test chunks
    test_chunks = [
        {
            "chunk_id": "test_001",
            "text": "Founders should optimize for durability of decisions rather than speed of iteration.",
            "metadata": ChunkMetadata(
                chunk_id="test_001",
                guest_id="patrick-collison",
                episode_id="ep_42",
                theme_id="T17"
            )
        },
        {
            "chunk_id": "test_002",
            "text": "Product management is about understanding customer needs and translating them into features.",
            "metadata": ChunkMetadata(
                chunk_id="test_002",
                guest_id="marty-cagan",
                episode_id="ep_10",
                theme_id="T05"
            )
        }
    ]
    
    store.add_chunks_batch(test_chunks)
    
    # Search
    results = store.search("How should founders make decisions?", k=2)
    print("\nSearch results:")
    for result in results:
        print(f"\n  Score: {result.score:.3f}")
        print(f"  Guest: {result.metadata.guest_id}")
        print(f"  Text: {result.text}")
    
    # Get stats
    stats = store.get_stats()
    print(f"\nStats: {stats}")

