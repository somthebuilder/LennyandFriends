#!/usr/bin/env python3
"""
Build Knowledge Base - Complete pipeline to build the knowledge substrate.
This runs offline to process all transcripts and create the RAG system.
"""
import sys
from pathlib import Path
import json
import pickle
from tqdm import tqdm

# Add src to path
sys.path.insert(0, str(Path(__file__).parent.parent))

from src.knowledge.transcript_parser import TranscriptParser
from src.knowledge.chunker import IntelligentChunker
from src.knowledge.theme_extractor import ThemeExtractor
from src.knowledge.theme_clusterer import ThemeClusterer
from src.knowledge.guest_theme_mapper import GuestThemeMapper
from src.knowledge.vector_store import VectorStore, ChunkMetadata
from src.knowledge.supabase_store import SupabaseStore


def build_knowledge_base(
    episodes_dir: str = "episodes",
    output_dir: str = "knowledge_base",
    batch_size: int = 10,
    skip_extraction: bool = False,
    use_supabase: bool = True
):
    """
    Build the complete knowledge base.
    
    Steps:
    1. Parse all transcripts
    2. Chunk transcripts intelligently
    3. Extract themes from chunks (offline LLM pass)
    4. Cluster themes into intent ontology
    5. Map guest-theme strengths
    6. Build vector store with RAG
    """
    output_path = Path(output_dir)
    output_path.mkdir(exist_ok=True)
    
    # Initialize Supabase store if enabled
    supabase_store = None
    if use_supabase:
        try:
            supabase_store = SupabaseStore()
            print("✅ Using Supabase for storage")
        except Exception as e:
            print(f"⚠️  Supabase initialization failed: {e}")
            print("   Falling back to local file storage")
            use_supabase = False
    
    print("=" * 60)
    print("Building Lenny and Friends Knowledge Base")
    print("=" * 60)
    
    # Step 1: Parse transcripts
    print("\n[1/6] Parsing transcripts...")
    parser = TranscriptParser(episodes_dir=episodes_dir)
    transcripts = parser.parse_all_episodes()
    print(f"  Parsed {len(transcripts)} episodes")
    
    # Step 2: Chunk transcripts
    print("\n[2/6] Chunking transcripts...")
    chunker = IntelligentChunker()
    all_chunks = []
    chunk_metadata_dict = {}
    
    for transcript in tqdm(transcripts, desc="Chunking"):
        chunks = chunker.chunk_transcript(transcript)
        all_chunks.extend(chunks)
        
        # Store metadata
        for chunk in chunks:
            chunk_metadata_dict[chunk.chunk_id] = {
                "guest_id": chunk.guest_id,
                "episode_id": chunk.episode_id,
                "speaker": chunk.speaker,
                "timestamp": chunk.timestamp,
                "token_count": chunk.token_count
            }
    
    print(f"  Created {len(all_chunks)} chunks")
    
    # Step 3: Extract themes (offline LLM pass)
    print("\n[3/6] Extracting themes from chunks...")
    # Try Gemini first (new API), fallback to OpenAI
    try:
        print("  Using Gemini for theme extraction...")
        extractor = ThemeExtractor(provider="gemini")
    except Exception as e:
        print(f"  Gemini not available ({e}), using OpenAI...")
        extractor = ThemeExtractor(provider="openai")
    extractions = []
    
    if skip_extraction:
        # Load existing extractions from Supabase or local file
        if use_supabase and supabase_store:
            print("  Loading extractions from Supabase...")
            try:
                existing_extractions = supabase_store.load_theme_extractions()
                # Convert to dict format expected by clusterer
                extractions = [
                    {
                        "chunk_id": ext.chunk_id,
                        "guest_id": ext.guest_id,
                        "episode_id": ext.episode_id,
                        "semantic_descriptors": ext.semantic_descriptors,
                        "core_thesis": ext.core_thesis,
                        "confidence": ext.confidence
                    }
                    for ext in existing_extractions
                ]
                print(f"  Loaded {len(extractions)} extractions from Supabase")
            except Exception as e:
                print(f"  ⚠️  Error loading from Supabase: {e}")
                print("  Trying local file...")
                extraction_file = output_path / "theme_extractions.json"
                if extraction_file.exists():
                    with open(extraction_file, "r") as f:
                        extractions = json.load(f)
                    print(f"  Loaded {len(extractions)} extractions from local file")
                else:
                    print("  No extractions found in Supabase or local file.")
                    return
        else:
            # Load from local file
            extraction_file = output_path / "theme_extractions.json"
            if extraction_file.exists():
                print("  Loading existing extractions from local file...")
                with open(extraction_file, "r") as f:
                    extractions = json.load(f)
                print(f"  Loaded {len(extractions)} extractions")
            else:
                print("  No existing extractions found. Run without --skip-extraction first.")
                return
    else:
        # Extract themes and save incrementally
        batch_size = 100  # Save to Supabase every 100 extractions
        extraction_batch = []
        
        for chunk in tqdm(all_chunks, desc="Extracting themes"):
            extraction = extractor.extract_theme(
                chunk_text=chunk.text,
                chunk_id=chunk.chunk_id,
                guest_id=chunk.guest_id,
                episode_id=chunk.episode_id
            )
            extraction_dict = {
                "chunk_id": extraction.chunk_id,
                "guest_id": extraction.guest_id,
                "episode_id": extraction.episode_id,
                "semantic_descriptors": extraction.semantic_descriptors,
                "core_thesis": extraction.core_thesis,
                "confidence": extraction.confidence
            }
            extractions.append(extraction_dict)
            extraction_batch.append(extraction_dict)
        
            # Save to Supabase in batches
            if use_supabase and supabase_store and len(extraction_batch) >= batch_size:
                from src.knowledge.supabase_store import ThemeExtraction
                extraction_objects = [
                    ThemeExtraction(
                        chunk_id=e["chunk_id"],
                        guest_id=e["guest_id"],
                        episode_id=e["episode_id"],
                        semantic_descriptors=e["semantic_descriptors"],
                        core_thesis=e["core_thesis"],
                        confidence=e["confidence"]
                    )
                    for e in extraction_batch
                ]
                try:
                    supabase_store.save_theme_extractions(extraction_objects)
                    extraction_batch = []  # Clear batch after successful save
                except Exception as e:
                    print(f"  ⚠️  Error saving to Supabase: {e}")
                    print(f"  Continuing with local backup...")
        
        # Save remaining extractions
        if extraction_batch:
            if use_supabase and supabase_store:
                from src.knowledge.supabase_store import ThemeExtraction
                extraction_objects = [
                    ThemeExtraction(
                        chunk_id=e["chunk_id"],
                        guest_id=e["guest_id"],
                        episode_id=e["episode_id"],
                        semantic_descriptors=e["semantic_descriptors"],
                        core_thesis=e["core_thesis"],
                        confidence=e["confidence"]
                    )
                    for e in extraction_batch
                ]
                try:
                    supabase_store.save_theme_extractions(extraction_objects)
                except Exception as e:
                    print(f"  ⚠️  Error saving final batch to Supabase: {e}")
        
        # Also save to local file as backup
        extraction_file = output_path / "theme_extractions.json"
        with open(extraction_file, "w") as f:
            json.dump(extractions, f, indent=2)
        print(f"  Saved {len(extractions)} extractions (local backup)")
    
    # Step 4: Cluster themes
    print("\n[4/6] Clustering themes into intent ontology...")
    clusterer = ThemeClusterer()
    themes = clusterer.cluster_themes(extractions, max_themes=60)
    print(f"  Created {len(themes)} themes")
    
    # Assign chunks to themes
    chunk_dicts = [
        {
            "chunk_id": chunk.chunk_id,
            "text": chunk.text,
            "guest_id": chunk.guest_id
        }
        for chunk in all_chunks
    ]
    chunk_theme_assignments = clusterer.assign_chunks_to_themes(chunk_dicts, themes)
    print(f"  Assigned {len(chunk_theme_assignments)} chunks to themes")
    
    # Save themes
    if use_supabase and supabase_store:
        supabase_store.save_themes(themes)
    else:
        themes_file = output_path / "themes.json"
    themes_data = [
        {
            "theme_id": theme.theme_id,
            "label": theme.label,
            "example_phrases": theme.example_phrases,
            "chunk_ids": theme.chunk_ids,
            "guest_ids": theme.guest_ids
        }
        for theme in themes
    ]
    with open(themes_file, "w") as f:
        json.dump(themes_data, f, indent=2)
    
    # Save theme centroids (as numpy arrays)
    centroids_file = output_path / "theme_centroids.pkl"
    centroids_dict = {theme.theme_id: theme.centroid_embedding for theme in themes}
    with open(centroids_file, "wb") as f:
        pickle.dump(centroids_dict, f)
    
    # Step 5: Map guest-theme strengths
    print("\n[5/6] Computing guest-theme strength mappings...")
    mapper = GuestThemeMapper()
    guest_strengths = mapper.compute_strengths(
        themes=themes,
        chunk_theme_assignments=chunk_theme_assignments,
        chunk_metadata=chunk_metadata_dict
    )
    
    # Save guest strengths
    strengths_dict = mapper.get_guest_strength_dict(guest_strengths)
    if use_supabase and supabase_store:
        supabase_store.save_guest_theme_strengths(strengths_dict)
    else:
        strengths_file = output_path / "guest_theme_strengths.json"
    with open(strengths_file, "w") as f:
        json.dump(strengths_dict, f, indent=2)
    print(f"  Mapped {len(guest_strengths)} guests to themes")
    
    # Step 6: Build vector store
    print("\n[6/6] Building vector store (RAG)...")
    vector_store = VectorStore(
        embedding_model="all-MiniLM-L6-v2",
        index_path=str(output_path / "vector_store")
    )
    
    # Prepare chunks for vector store
    chunks_for_store = []
    for chunk in tqdm(all_chunks, desc="Adding to vector store"):
        theme_id = chunk_theme_assignments.get(chunk.chunk_id)
        metadata = ChunkMetadata(
            chunk_id=chunk.chunk_id,
            guest_id=chunk.guest_id,
            episode_id=chunk.episode_id,
            theme_id=theme_id,
            speaker=chunk.speaker,
            timestamp=chunk.timestamp,
            token_count=chunk.token_count
        )
        
        chunks_for_store.append({
            "chunk_id": chunk.chunk_id,
            "text": chunk.text,
            "metadata": metadata
        })
    
    # Add in batches and save
    batch_size = 100
    all_embeddings = []
    
    # Generate embeddings for all chunks
    if use_supabase and supabase_store:
        print("  Generating embeddings for Supabase...")
        all_texts = [chunk["text"] for chunk in chunks_for_store]
        all_embeddings = vector_store.encoder.encode(all_texts, show_progress_bar=True)
    
    # Add to vector store (for local backup or if not using Supabase)
    for i in tqdm(range(0, len(chunks_for_store), batch_size), desc="Adding to vector store"):
        batch = chunks_for_store[i:i + batch_size]
        vector_store.add_chunks_batch(batch)
    
    # Save vector store
    if use_supabase and supabase_store:
        # Save embeddings to Supabase
        import numpy as np
        embeddings_array = np.array(all_embeddings)
        supabase_store.save_chunk_embeddings(chunks_for_store, embeddings_array)
    else:
        vector_store.save()
    print(f"  Vector store saved with {len(chunks_for_store)} chunks")
    
    # Save chunk assignments
    if use_supabase and supabase_store:
        supabase_store.save_chunk_theme_assignments(chunk_theme_assignments)
    else:
        assignments_file = output_path / "chunk_theme_assignments.json"
    with open(assignments_file, "w") as f:
        json.dump(chunk_theme_assignments, f, indent=2)
    
    # Step 7: Generate panels from themes
    if use_supabase and supabase_store:
        print("\n[7/7] Generating panels from themes...")
        try:
            # Import here to avoid circular dependencies
            import importlib.util
            panel_gen_path = Path(__file__).parent / "generate_panels.py"
            spec = importlib.util.spec_from_file_location("generate_panels", panel_gen_path)
            generate_panels_module = importlib.util.module_from_spec(spec)
            spec.loader.exec_module(generate_panels_module)
            PanelGenerator = generate_panels_module.PanelGenerator
            
            panel_generator = PanelGenerator(supabase_store)
            panels = panel_generator.generate_panels(min_guests_per_panel=3, max_guests_per_panel=10)
            panel_generator.save_panels(panels)
            print(f"  Generated {len(panels)} panels")
        except Exception as e:
            print(f"  ⚠️  Error generating panels: {e}")
            import traceback
            traceback.print_exc()
    
    # Summary
    print("\n" + "=" * 60)
    print("Knowledge Base Build Complete!")
    print("=" * 60)
    print(f"  Episodes: {len(transcripts)}")
    print(f"  Chunks: {len(all_chunks)}")
    print(f"  Themes: {len(themes)}")
    print(f"  Guests: {len(guest_strengths)}")
    print(f"  Vector Store: {len(chunks_for_store)} chunks")
    if use_supabase and supabase_store:
        try:
            panel_count = len(panels) if 'panels' in locals() else 0
            print(f"  Panels: {panel_count}")
        except:
            pass
    print(f"\nOutput directory: {output_dir}/")


if __name__ == "__main__":
    import argparse
    
    parser = argparse.ArgumentParser(description="Build Lenny and Friends knowledge base")
    parser.add_argument("--episodes-dir", default="episodes", help="Episodes directory")
    parser.add_argument("--output-dir", default="knowledge_base", help="Output directory")
    parser.add_argument("--skip-extraction", action="store_true", help="Skip theme extraction (use existing)")
    parser.add_argument("--use-supabase", action="store_true", default=True, help="Use Supabase for storage (default: True)")
    parser.add_argument("--no-supabase", dest="use_supabase", action="store_false", help="Use local file storage instead of Supabase")
    
    args = parser.parse_args()
    
    build_knowledge_base(
        episodes_dir=args.episodes_dir,
        output_dir=args.output_dir,
        skip_extraction=args.skip_extraction,
        use_supabase=args.use_supabase
    )

