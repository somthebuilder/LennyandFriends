#!/usr/bin/env python3
"""
Retry Failed Extractions - Retry saving theme extractions that failed to save to Supabase.

This script:
1. Loads the local backup of theme extractions
2. Checks what's already in Supabase
3. Retries saving only the missing/failed extractions
"""
import sys
from pathlib import Path
import json
from tqdm import tqdm

# Add src to path
sys.path.insert(0, str(Path(__file__).parent.parent))

from src.knowledge.supabase_store import SupabaseStore, ThemeExtraction


def retry_failed_extractions(
    extraction_file: str = "knowledge_base/theme_extractions.json",
    batch_size: int = 100
):
    """
    Retry saving theme extractions that failed to save to Supabase.
    
    Args:
        extraction_file: Path to local backup JSON file
        batch_size: Number of extractions to save per batch
    """
    extraction_path = Path(extraction_file)
    
    if not extraction_path.exists():
        print(f"❌ Extraction file not found: {extraction_file}")
        print("   Run the build script first to generate theme_extractions.json")
        return
    
    print("=" * 60)
    print("Retrying Failed Theme Extractions")
    print("=" * 60)
    
    # Initialize Supabase store
    try:
        supabase_store = SupabaseStore()
        print("✅ Connected to Supabase")
    except Exception as e:
        print(f"❌ Failed to connect to Supabase: {e}")
        return
    
    # Load local extractions
    print(f"\n📂 Loading extractions from {extraction_file}...")
    with open(extraction_path, "r") as f:
        local_extractions = json.load(f)
    print(f"   Found {len(local_extractions)} extractions in local backup")
    
    # Check what's already in Supabase
    print("\n🔍 Checking what's already in Supabase...")
    try:
        existing_extractions = supabase_store.load_theme_extractions()
        existing_chunk_ids = {ext.chunk_id for ext in existing_extractions}
        print(f"   Found {len(existing_chunk_ids)} extractions already in Supabase")
    except Exception as e:
        print(f"   ⚠️  Error loading from Supabase: {e}")
        print("   Will retry all extractions...")
        existing_chunk_ids = set()
    
    # Find missing extractions
    missing_extractions = [
        ext for ext in local_extractions
        if ext["chunk_id"] not in existing_chunk_ids
    ]
    
    if not missing_extractions:
        print("\n✅ All extractions are already in Supabase!")
        return
    
    print(f"\n🔄 Found {len(missing_extractions)} extractions to retry")
    
    # Retry saving in batches
    print(f"\n💾 Saving missing extractions to Supabase (batch size: {batch_size})...")
    saved_count = 0
    failed_count = 0
    
    for i in tqdm(range(0, len(missing_extractions), batch_size), desc="Saving batches"):
        batch = missing_extractions[i:i + batch_size]
        
        # Convert to ThemeExtraction objects
        extraction_objects = []
        for ext_dict in batch:
            # Ensure semantic_descriptors is always a list (never None)
            semantic_descriptors = ext_dict.get("semantic_descriptors")
            if semantic_descriptors is None:
                semantic_descriptors = []
            elif not isinstance(semantic_descriptors, list):
                semantic_descriptors = []
            
            # Ensure core_thesis is always a string (never None)
            core_thesis = ext_dict.get("core_thesis") or ""
            
            extraction_objects.append(ThemeExtraction(
                chunk_id=ext_dict["chunk_id"],
                guest_id=ext_dict["guest_id"],
                episode_id=ext_dict["episode_id"],
                semantic_descriptors=semantic_descriptors,
                core_thesis=core_thesis,
                confidence=float(ext_dict.get("confidence", 0.0)) if ext_dict.get("confidence") is not None else 0.0
            ))
        
        # Try to save batch
        try:
            supabase_store.save_theme_extractions(extraction_objects)
            saved_count += len(batch)
        except Exception as e:
            print(f"\n  ⚠️  Error saving batch {i//batch_size + 1}: {e}")
            failed_count += len(batch)
            # Continue with next batch
    
    # Summary
    print("\n" + "=" * 60)
    print("Retry Complete!")
    print("=" * 60)
    print(f"  ✅ Successfully saved: {saved_count} extractions")
    if failed_count > 0:
        print(f"  ❌ Failed to save: {failed_count} extractions")
        print(f"  💡 Check the errors above and retry if needed")
    else:
        print(f"  🎉 All extractions saved successfully!")


if __name__ == "__main__":
    import argparse
    
    parser = argparse.ArgumentParser(description="Retry saving failed theme extractions to Supabase")
    parser.add_argument("--extraction-file", default="knowledge_base/theme_extractions.json", 
                       help="Path to local theme_extractions.json file")
    parser.add_argument("--batch-size", type=int, default=100,
                       help="Number of extractions to save per batch")
    
    args = parser.parse_args()
    
    retry_failed_extractions(
        extraction_file=args.extraction_file,
        batch_size=args.batch_size
    )

