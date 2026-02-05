"""
Supabase Storage - Store knowledge base data in Supabase with vector support.
Replaces local file storage with Supabase database.
"""
import os
from typing import List, Dict, Optional
import numpy as np
from dataclasses import dataclass, asdict
from supabase import create_client, Client
from dotenv import load_dotenv

load_dotenv()


@dataclass
class ThemeExtraction:
    """Extracted theme information from a chunk."""
    chunk_id: str
    guest_id: str
    episode_id: str
    semantic_descriptors: List[str]
    core_thesis: str
    confidence: float


@dataclass
class Theme:
    """A theme cluster."""
    theme_id: str
    label: str
    example_phrases: List[str]
    chunk_ids: List[str]
    guest_ids: List[str]
    centroid_embedding: Optional[np.ndarray] = None


class SupabaseStore:
    """Store knowledge base data in Supabase."""
    
    def __init__(self):
        """Initialize Supabase client."""
        supabase_url = os.getenv("SUPABASE_URL", "https://rhzpjvuutpjtdsbnskdy.supabase.co")
        supabase_key = os.getenv("SUPABASE_KEY", os.getenv("SUPABASE_PUBLISHABLE_KEY", "sb_publishable_2yKt6iNyAT4XEizznV8_1A_QlDKGoBo"))
        
        self.client: Client = create_client(supabase_url, supabase_key)
    
    # Theme Extractions
    def save_theme_extractions(self, extractions: List[ThemeExtraction]):
        """Save theme extractions to Supabase."""
        records = []
        for ext in extractions:
            records.append({
                "chunk_id": ext.chunk_id,
                "guest_id": ext.guest_id,
                "episode_id": ext.episode_id,
                "semantic_descriptors": ext.semantic_descriptors,
                "core_thesis": ext.core_thesis,
                "confidence": float(ext.confidence)
            })
        
        # Insert in batches
        batch_size = 1000
        total_saved = 0
        for i in range(0, len(records), batch_size):
            batch = records[i:i + batch_size]
            try:
                result = self.client.table("theme_extractions").upsert(batch).execute()
                total_saved += len(batch)
            except Exception as e:
                print(f"  ⚠️  Error saving batch {i//batch_size + 1}: {e}")
                raise
        
        print(f"  ✅ Saved {total_saved} theme extractions to Supabase")
    
    def load_theme_extractions(self) -> List[ThemeExtraction]:
        """Load theme extractions from Supabase."""
        response = self.client.table("theme_extractions").select("*").execute()
        
        extractions = []
        for row in response.data:
            extractions.append(ThemeExtraction(
                chunk_id=row["chunk_id"],
                guest_id=row["guest_id"],
                episode_id=row["episode_id"],
                semantic_descriptors=row["semantic_descriptors"],
                core_thesis=row["core_thesis"],
                confidence=float(row["confidence"])
            ))
        
        return extractions
    
    # Themes
    def save_themes(self, themes: List[Theme]):
        """Save themes to Supabase."""
        records = []
        for theme in themes:
            centroid_vec = None
            if theme.centroid_embedding is not None:
                # Convert numpy array to list for Supabase vector type
                centroid_vec = theme.centroid_embedding.tolist()
            
            records.append({
                "theme_id": theme.theme_id,
                "label": theme.label,
                "example_phrases": theme.example_phrases,
                "chunk_ids": theme.chunk_ids,
                "guest_ids": theme.guest_ids,
                "centroid_embedding": centroid_vec
            })
        
        self.client.table("themes").upsert(records).execute()
        print(f"  Saved {len(themes)} themes to Supabase")
    
    def load_themes(self) -> List[Theme]:
        """Load themes from Supabase."""
        response = self.client.table("themes").select("*").execute()
        
        themes = []
        for row in response.data:
            centroid_embedding = None
            if row.get("centroid_embedding"):
                centroid_embedding = np.array(row["centroid_embedding"])
            
            themes.append(Theme(
                theme_id=row["theme_id"],
                label=row["label"],
                example_phrases=row["example_phrases"],
                chunk_ids=row["chunk_ids"],
                guest_ids=row["guest_ids"],
                centroid_embedding=centroid_embedding
            ))
        
        return themes
    
    # Guest Theme Strengths
    def save_guest_theme_strengths(self, strengths: Dict[str, Dict[str, Dict]]):
        """Save guest theme strengths to Supabase.
        
        Args:
            strengths: Dict[guest_id][theme_id] = {strength: float, chunk_count: int}
        """
        records = []
        for guest_id, theme_dict in strengths.items():
            for theme_id, data in theme_dict.items():
                records.append({
                    "guest_id": guest_id,
                    "theme_id": theme_id,
                    "strength": float(data["strength"]),
                    "chunk_count": int(data["chunk_count"])
                })
        
        # Insert in batches
        batch_size = 1000
        for i in range(0, len(records), batch_size):
            batch = records[i:i + batch_size]
            self.client.table("guest_theme_strengths").upsert(batch).execute()
        
        print(f"  Saved {len(records)} guest-theme strength mappings to Supabase")
    
    def load_guest_theme_strengths(self) -> Dict[str, Dict[str, Dict]]:
        """Load guest theme strengths from Supabase."""
        response = self.client.table("guest_theme_strengths").select("*").execute()
        
        strengths = {}
        for row in response.data:
            guest_id = row["guest_id"]
            theme_id = row["theme_id"]
            
            if guest_id not in strengths:
                strengths[guest_id] = {}
            
            strengths[guest_id][theme_id] = {
                "strength": float(row["strength"]),
                "chunk_count": int(row["chunk_count"])
            }
        
        return strengths
    
    # Chunk Theme Assignments
    def save_chunk_theme_assignments(self, assignments: Dict[str, Optional[str]]):
        """Save chunk theme assignments to Supabase.
        
        Args:
            assignments: Dict[chunk_id] = theme_id or None
        """
        records = []
        for chunk_id, theme_id in assignments.items():
            records.append({
                "chunk_id": chunk_id,
                "theme_id": theme_id
            })
        
        # Insert in batches
        batch_size = 1000
        for i in range(0, len(records), batch_size):
            batch = records[i:i + batch_size]
            self.client.table("chunk_theme_assignments").upsert(batch).execute()
        
        print(f"  Saved {len(assignments)} chunk theme assignments to Supabase")
    
    def load_chunk_theme_assignments(self) -> Dict[str, Optional[str]]:
        """Load chunk theme assignments from Supabase."""
        response = self.client.table("chunk_theme_assignments").select("*").execute()
        
        assignments = {}
        for row in response.data:
            assignments[row["chunk_id"]] = row.get("theme_id")
        
        return assignments
    
    # Chunk Embeddings (Vector Store)
    def save_chunk_embeddings(
        self,
        chunks: List[Dict],
        embeddings: np.ndarray
    ):
        """Save chunk embeddings to Supabase.
        
        Args:
            chunks: List of dicts with keys: chunk_id, text, metadata (ChunkMetadata)
            embeddings: numpy array of shape (num_chunks, dimension)
        """
        records = []
        for i, chunk_data in enumerate(chunks):
            chunk_id = chunk_data["chunk_id"]
            text = chunk_data["text"]
            metadata = chunk_data["metadata"]
            embedding = embeddings[i].tolist()  # Convert to list for Supabase
            
            records.append({
                "chunk_id": chunk_id,
                "text": text,
                "embedding": embedding,
                "guest_id": metadata.guest_id,
                "episode_id": metadata.episode_id,
                "theme_id": metadata.theme_id,
                "speaker": metadata.speaker,
                "timestamp": metadata.timestamp,
                "token_count": metadata.token_count
            })
        
        # Insert in batches
        batch_size = 100
        for i in range(0, len(records), batch_size):
            batch = records[i:i + batch_size]
            self.client.table("chunk_embeddings").upsert(batch).execute()
        
        print(f"  Saved {len(chunks)} chunk embeddings to Supabase")
    
    def search_chunks(
        self,
        query_embedding: np.ndarray,
        limit: int = 10,
        filter_guest_id: Optional[str] = None,
        filter_theme_id: Optional[str] = None
    ) -> List[Dict]:
        """Search chunks using vector similarity.
        
        Args:
            query_embedding: Query embedding vector
            limit: Number of results to return
            filter_guest_id: Optional guest filter
            filter_theme_id: Optional theme filter
        
        Returns:
            List of dicts with keys: chunk_id, text, score, metadata
        """
        query_vec = query_embedding.tolist()
        
        # Build query
        query = self.client.table("chunk_embeddings").select("*")
        
        # Apply filters
        if filter_guest_id:
            query = query.eq("guest_id", filter_guest_id)
        if filter_theme_id:
            query = query.eq("theme_id", filter_theme_id)
        
        # Use Supabase vector similarity search via RPC function
        try:
            response = self.client.rpc(
                "match_chunks",
                {
                    "query_embedding": query_vec,
                    "match_threshold": 0.0,
                    "match_count": limit,
                    "filter_guest_id": filter_guest_id,
                    "filter_theme_id": filter_theme_id
                }
            ).execute()
            
            results = []
            for row in response.data:
                from src.knowledge.vector_store import ChunkMetadata
                results.append({
                    "chunk_id": row["chunk_id"],
                    "text": row["text_content"] if "text_content" in row else row.get("text", ""),
                    "score": float(row.get("similarity", 1.0)),
                    "metadata": ChunkMetadata(
                        chunk_id=row["chunk_id"],
                        guest_id=row["guest_id"],
                        episode_id=row["episode_id"],
                        theme_id=row.get("theme_id"),
                        speaker=row.get("speaker"),
                        timestamp=row.get("time_stamp") or row.get("timestamp"),
                        token_count=row.get("token_count")
                    )
                })
            
            return results
        except Exception as e:
            print(f"Error in Supabase vector search: {e}")
            # Fallback to simple query without vector search
            query = self.client.table("chunk_embeddings").select("*").limit(limit)
            if filter_guest_id:
                query = query.eq("guest_id", filter_guest_id)
            if filter_theme_id:
                query = query.eq("theme_id", filter_theme_id)
            
            response = query.execute()
            results = []
            for row in response.data:
                from src.knowledge.vector_store import ChunkMetadata
                results.append({
                    "chunk_id": row["chunk_id"],
                    "text": row["text"],
                    "score": 0.5,  # Default score without similarity
                    "metadata": ChunkMetadata(
                        chunk_id=row["chunk_id"],
                        guest_id=row["guest_id"],
                        episode_id=row["episode_id"],
                        theme_id=row.get("theme_id"),
                        speaker=row.get("speaker"),
                        timestamp=row.get("timestamp"),
                        token_count=row.get("token_count")
                    )
                })
            return results

