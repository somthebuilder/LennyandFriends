#!/usr/bin/env python3
"""
Resume Theme Extractions - Resume theme extraction from where it left off.

This script:
1. Loads all chunks
2. Checks what's already in Supabase
3. Only extracts themes for chunks that are missing
4. Saves to Supabase incrementally
"""
import sys
from pathlib import Path
import json
from tqdm import tqdm

# Add src to path
sys.path.insert(0, str(Path(__file__).parent.parent))

from src.knowledge.transcript_parser import TranscriptParser
from src.knowledge.chunker import IntelligentChunker
from src.knowledge.theme_extractor import ThemeExtractor
from src.knowledge.supabase_store import SupabaseStore, ThemeExtraction


def resume_extractions(
    episodes_dir: str = "episodes",
    batch_size: int = 100
):
    """
    Resume theme extraction, skipping chunks already in Supabase.
    
    Args:
        episodes_dir: Directory containing episode transcripts
        batch_size: Number of extractions to save per batch
    """
    print("=" * 60)
    print("Resuming Theme Extractions")
    print("=" * 60)
    
    # Initialize Supabase store
    try:
        supabase_store = SupabaseStore()
        print("✅ Connected to Supabase")
    except Exception as e:
        print(f"❌ Failed to connect to Supabase: {e}")
        return
    
    # Check what's already in Supabase using pagination to get all chunk_ids
    print("\n🔍 Checking existing extractions in Supabase...")
    try:
        existing_chunk_ids = set()
        page_size = 1000
        offset = 0
        
        # Fetch all chunk_ids using pagination
        while True:
            response = supabase_store.client.table("theme_extractions").select("chunk_id").range(offset, offset + page_size - 1).execute()
            
            if not response.data or len(response.data) == 0:
                break
            
            existing_chunk_ids.update({row["chunk_id"] for row in response.data})
            
            # If we got fewer than page_size, we've reached the end
            if len(response.data) < page_size:
                break
            
            offset += page_size
            print(f"   Loaded {len(existing_chunk_ids)} chunk_ids so far...")
        
        print(f"   Found {len(existing_chunk_ids)} extractions already in Supabase")
    except Exception as e:
        print(f"   ⚠️  Error loading from Supabase: {e}")
        print("   Will process all chunks...")
        existing_chunk_ids = set()
    
    # Step 1: Parse transcripts
    print("\n[1/3] Parsing transcripts...")
    parser = TranscriptParser(episodes_dir=episodes_dir)
    transcripts = parser.parse_all_episodes()
    print(f"  Parsed {len(transcripts)} episodes")
    
    # Step 2: Chunk transcripts
    print("\n[2/3] Chunking transcripts...")
    chunker = IntelligentChunker()
    all_chunks = []
    
    for transcript in tqdm(transcripts, desc="Chunking"):
        chunks = chunker.chunk_transcript(transcript)
        all_chunks.extend(chunks)
    
    print(f"  Created {len(all_chunks)} chunks")
    
    # Filter out chunks already processed
    chunks_to_process = [
        chunk for chunk in all_chunks
        if chunk.chunk_id not in existing_chunk_ids
    ]
    
    if not chunks_to_process:
        print("\n✅ All chunks have already been processed!")
        return
    
    print(f"\n📊 Processing {len(chunks_to_process)} remaining chunks (skipping {len(all_chunks) - len(chunks_to_process)} already processed)")
    
    # Step 3: Extract themes for remaining chunks
    print("\n[3/3] Extracting themes from remaining chunks...")
    try:
        print("  Using Gemini for theme extraction...")
        extractor = ThemeExtractor(provider="gemini")
    except Exception as e:
        print(f"  Gemini not available ({e}), using OpenAI...")
        extractor = ThemeExtractor(provider="openai")
    
    extraction_batch = []
    saved_count = 0
    failed_count = 0
    
    for chunk in tqdm(chunks_to_process, desc="Extracting themes"):
        extraction = extractor.extract_theme(
            chunk_text=chunk.text,
            chunk_id=chunk.chunk_id,
            guest_id=chunk.guest_id,
            episode_id=chunk.episode_id
        )
        
        # Convert to ThemeExtraction object
        extraction_obj = ThemeExtraction(
            chunk_id=extraction.chunk_id,
            guest_id=extraction.guest_id,
            episode_id=extraction.episode_id,
            semantic_descriptors=extraction.semantic_descriptors or [],
            core_thesis=extraction.core_thesis or "",
            confidence=float(extraction.confidence) if extraction.confidence is not None else 0.0
        )
        
        extraction_batch.append(extraction_obj)
        
        # Save to Supabase in batches
        if len(extraction_batch) >= batch_size:
            try:
                supabase_store.save_theme_extractions(extraction_batch)
                saved_count += len(extraction_batch)
                extraction_batch = []  # Clear batch after successful save
            except Exception as e:
                print(f"\n  ⚠️  Error saving batch: {e}")
                failed_count += len(extraction_batch)
                extraction_batch = []  # Clear batch even on error to continue
    
    # Save remaining extractions
    if extraction_batch:
        try:
            supabase_store.save_theme_extractions(extraction_batch)
            saved_count += len(extraction_batch)
        except Exception as e:
            print(f"\n  ⚠️  Error saving final batch: {e}")
            failed_count += len(extraction_batch)
    
    # Summary
    print("\n" + "=" * 60)
    print("Resume Complete!")
    print("=" * 60)
    print(f"  ✅ Successfully saved: {saved_count} extractions")
    if failed_count > 0:
        print(f"  ❌ Failed to save: {failed_count} extractions")
    else:
        print(f"  🎉 All remaining chunks processed successfully!")


if __name__ == "__main__":
    import argparse
    
    parser = argparse.ArgumentParser(description="Resume theme extraction from where it left off")
    parser.add_argument("--episodes-dir", default="episodes", help="Episodes directory")
    parser.add_argument("--batch-size", type=int, default=100,
                       help="Number of extractions to save per batch")
    
    args = parser.parse_args()
    
    resume_extractions(
        episodes_dir=args.episodes_dir,
        batch_size=args.batch_size
    )

