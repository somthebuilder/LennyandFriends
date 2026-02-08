"""
Discussion Generator - Creates curated discussions from chunks within panel themes.
Uses Gemini to extract meaningful conversations and perspectives.

Process:
1. For each panel, get chunks from its themes
2. Group chunks by semantic similarity (using core_thesis)
3. Create discussions from these groups
4. Extract perspectives from individual chunks
5. Use Gemini to determine agreement levels and generate takeaways
"""
import sys
from pathlib import Path
import os
import re
import time
from typing import List, Dict, Optional, Set
from collections import defaultdict
from dotenv import load_dotenv

# Add src to path
sys.path.insert(0, str(Path(__file__).parent.parent))

from src.knowledge.supabase_store import SupabaseStore

# Try to import Gemini
try:
    from google import genai
    GEMINI_AVAILABLE = True
except ImportError:
    GEMINI_AVAILABLE = False
    print("❌ Gemini not available. Install: pip install google-generativeai")

load_dotenv()


class DiscussionGenerator:
    """Generate discussions from panel themes."""
    
    def __init__(self, supabase_store: SupabaseStore):
        self.supabase_store = supabase_store
        self.client = supabase_store.client
        
        # Initialize Gemini
        if GEMINI_AVAILABLE:
            api_key = os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY")
            if api_key:
                try:
                    self.gemini_client = genai.Client(api_key=api_key)
                    print("  ✅ Gemini initialized for discussion generation")
                except Exception as e:
                    print(f"  ⚠️  Failed to initialize Gemini: {e}")
                    self.gemini_client = None
            else:
                self.gemini_client = None
        else:
            self.gemini_client = None
    
    def generate_discussions_for_panel(self, panel_id: str, panel_slug: str, theme_ids: List[str]) -> tuple[int, int]:
        """Generate discussions for a single panel. Returns (discussions_count, perspectives_count)."""
        print(f"   Processing panel: {panel_slug}")
        
        # Get chunks for this panel's themes
        chunks = self._get_chunks_for_themes(theme_ids)
        if not chunks:
            print(f"      ⚠️  No chunks found for themes")
            return (0, 0)
        
        print(f"      Found {len(chunks)} chunks")
        
        # Group chunks by semantic similarity (using core_thesis)
        discussion_groups = self._group_chunks_by_topic(chunks)
        print(f"      Created {len(discussion_groups)} discussion groups")
        
        # Create discussions
        discussions_created = 0
        perspectives_created = 0
        
        for idx, (topic, group_chunks) in enumerate(discussion_groups.items(), 1):
            if len(group_chunks) < 2:  # Need at least 2 perspectives
                continue
            
            # Create discussion
            discussion_id = self._create_discussion(
                panel_id=panel_id,
                title=topic,
                chunks=group_chunks,
                order=idx
            )
            
            if discussion_id:
                discussions_created += 1
                # Create perspectives for this discussion
                count = self._create_perspectives(discussion_id, group_chunks)
                perspectives_created += count
        
        return (discussions_created, perspectives_created)
    
    def _get_chunks_for_themes(self, theme_ids: List[str]) -> List[Dict]:
        """Get chunks that belong to these themes."""
        chunks = []
        
        for theme_id in theme_ids:
            try:
                # Get theme to get chunk_ids
                theme_response = self.client.table("themes").select("chunk_ids").eq("theme_id", theme_id).execute()
                if not theme_response.data:
                    continue
                
                chunk_ids = theme_response.data[0].get("chunk_ids", [])
                if not chunk_ids:
                    continue
                
                # Get extractions for these chunks (in batches)
                batch_size = 100
                for i in range(0, len(chunk_ids), batch_size):
                    batch_ids = chunk_ids[i:i + batch_size]
                    
                    # Get theme extractions (this is what we have available)
                    extractions_response = self.client.table("theme_extractions").select(
                        "chunk_id, guest_id, episode_id, core_thesis, semantic_descriptors, confidence"
                    ).in_("chunk_id", batch_ids).execute()
                    
                    # Try to get chunk text from chunk_embeddings (may be empty)
                    try:
                        chunks_response = self.client.table("chunk_embeddings").select(
                            "chunk_id, text, timestamp, speaker"
                        ).in_("chunk_id", batch_ids).execute()
                        chunk_text_dict = {c["chunk_id"]: c for c in chunks_response.data}
                    except:
                        chunk_text_dict = {}
                    
                    # Combine data - use core_thesis as text if chunk_embeddings is empty
                    for ext in extractions_response.data:
                        chunk_id = ext["chunk_id"]
                        chunk_data = {
                            "chunk_id": chunk_id,
                            "guest_id": ext.get("guest_id", ""),
                            "episode_id": ext.get("episode_id", ""),
                            "core_thesis": ext.get("core_thesis", ""),
                            "semantic_descriptors": ext.get("semantic_descriptors", []),
                            "confidence": ext.get("confidence", 0.0)
                        }
                        
                        # Add text if available from chunk_embeddings
                        if chunk_id in chunk_text_dict:
                            chunk_data["text"] = chunk_text_dict[chunk_id].get("text", "")
                            chunk_data["timestamp"] = chunk_text_dict[chunk_id].get("timestamp")
                            chunk_data["speaker"] = chunk_text_dict[chunk_id].get("speaker")
                        else:
                            # Use core_thesis as text (will be expanded later)
                            chunk_data["text"] = ext.get("core_thesis", "")
                            chunk_data["timestamp"] = None
                            chunk_data["speaker"] = None
                        
                        chunks.append(chunk_data)
                
            except Exception as e:
                print(f"      ⚠️  Error getting chunks for theme {theme_id}: {e}")
                continue
        
        return chunks
    
    def _group_chunks_by_topic(self, chunks: List[Dict]) -> Dict[str, List[Dict]]:
        """Group chunks by topic using core_thesis similarity."""
        # Simple grouping: chunks with similar core_thesis go together
        groups = defaultdict(list)
        
        # Group by guest first, then by similar thesis
        guest_groups = defaultdict(list)
        for chunk in chunks:
            guest_id = chunk.get("guest_id", "unknown")
            guest_groups[guest_id].append(chunk)
        
        # For each guest, group their chunks by topic
        for guest_id, guest_chunks in guest_groups.items():
            # Simple grouping: use first few words of core_thesis as topic key
            for chunk in guest_chunks:
                thesis = chunk.get("core_thesis", "")
                if not thesis or len(thesis) < 20:
                    # Use semantic descriptors if no thesis
                    descriptors = chunk.get("semantic_descriptors", [])
                    if descriptors:
                        topic = descriptors[0] if descriptors else "General Discussion"
                    else:
                        topic = "General Discussion"
                else:
                    # Use first meaningful phrase from thesis (first 5-7 words)
                    words = thesis.split()[:7]
                    topic = " ".join(words)
                    if len(topic) > 60:
                        topic = topic[:60]
                
                groups[topic].append(chunk)
        
        # Merge very similar topics (simple heuristic)
        merged_groups = {}
        for topic, group_chunks in groups.items():
            # Check if similar topic exists
            found_similar = False
            for existing_topic in merged_groups:
                # Simple similarity: check if topics share significant words
                topic_words = set(topic.lower().split())
                existing_words = set(existing_topic.lower().split())
                common_words = topic_words & existing_words
                if len(common_words) >= 2 and len(common_words) / max(len(topic_words), len(existing_words)) > 0.4:
                    merged_groups[existing_topic].extend(group_chunks)
                    found_similar = True
                    break
            
            if not found_similar:
                merged_groups[topic] = group_chunks
        
        # Filter: only keep groups with 2+ unique guests
        filtered_groups = {}
        for topic, group_chunks in merged_groups.items():
            unique_guests = set(c.get("guest_id") for c in group_chunks)
            if len(unique_guests) >= 2:
                filtered_groups[topic] = group_chunks
        
        return filtered_groups
    
    def _create_discussion(self, panel_id: str, title: str, chunks: List[Dict], order: int) -> Optional[str]:
        """Create a discussion in the database."""
        try:
            # Use Gemini to generate a better title and determine agreement level
            agreement_level = self._determine_agreement_level(chunks)
            
            # Clean up title - use Gemini to generate a better title if too long
            title = title.strip()
            
            # If title is too long or incomplete, use Gemini to create a concise title
            if len(title) > 100 or not title:
                title = self._generate_discussion_title(chunks) or title[:100].rsplit('.', 1)[0] or "Expert Discussion"
            
            # Final cleanup - ensure reasonable length
            if len(title) > 150:
                # Try to truncate at sentence boundary
                title = title[:147].rsplit('.', 1)[0]
                if not title or len(title) < 20:
                    title = title[:147] + "..."
            
            # Insert discussion
            discussion_response = self.client.table("discussions").insert({
                "panel_id": panel_id,
                "title": title,
                "display_order": order,
                "agreement_level": agreement_level
            }).execute()
            
            if discussion_response.data:
                discussion_id = discussion_response.data[0]["id"]
                print(f"      ✅ Created discussion: {title[:50]}... ({agreement_level})")
                return discussion_id
            else:
                print(f"      ⚠️  Failed to create discussion: {title}")
                return None
                
        except Exception as e:
            print(f"      ⚠️  Error creating discussion: {e}")
            return None
    
    def _generate_discussion_title(self, chunks: List[Dict]) -> Optional[str]:
        """Generate a concise, meaningful discussion title using Gemini."""
        if not self.gemini_client or len(chunks) < 2:
            return None
        
        try:
            # Get core theses from chunks
            theses = [c.get("core_thesis", "") for c in chunks if c.get("core_thesis")]
            if not theses:
                return None
            
            # Sample theses (max 3)
            sample_theses = theses[:3]
            
            prompt = f"""Generate a concise, engaging discussion title (max 80 characters) based on these expert perspectives.

Perspectives:
{chr(10).join(f"- {thesis}" for thesis in sample_theses)}

Requirements:
- 5-12 words maximum
- Captures the core topic being discussed
- Engaging and specific (not generic)
- No quotes, no markdown
- Examples: "Prioritizing High-Impact Initiatives", "Building Effective Product Teams", "Growth Strategies for Early-Stage Startups"

Generate ONLY the title, nothing else:"""

            response = self.gemini_client.models.generate_content(
                model="models/gemini-2.5-flash",
                contents=prompt
            )
            
            title = response.text.strip()
            # Clean up
            title = re.sub(r'["\']', '', title)
            title = title.strip()
            
            if 20 <= len(title) <= 150:
                return title
            else:
                return None
                
        except Exception as e:
            return None
    
    def _determine_agreement_level(self, chunks: List[Dict]) -> str:
        """Determine agreement level using Gemini or heuristics."""
        if not self.gemini_client or len(chunks) < 2:
            return "nuanced"  # Default
        
        try:
            # Get core theses from chunks
            theses = [c.get("core_thesis", "") for c in chunks if c.get("core_thesis")]
            if len(theses) < 2:
                return "nuanced"
            
            # Sample theses (max 5)
            sample_theses = theses[:5]
            
            prompt = f"""Analyze these expert perspectives on the same topic and determine the agreement level.

Perspectives:
{chr(10).join(f"{i+1}. {thesis}" for i, thesis in enumerate(sample_theses))}

Determine the agreement level:
- "consensus" - Experts largely agree
- "moderate_disagreement" - Some differences but not fundamental
- "strong_disagreement" - Fundamental disagreements
- "nuanced" - Complex topic with multiple valid perspectives

Respond with ONLY one word: consensus, moderate_disagreement, strong_disagreement, or nuanced"""

            response = self.gemini_client.models.generate_content(
                model="models/gemini-2.5-flash",
                contents=prompt
            )
            
            level = response.text.strip().lower()
            if level in ["consensus", "moderate_disagreement", "strong_disagreement", "nuanced"]:
                return level
            else:
                return "nuanced"
                
        except Exception as e:
            print(f"         ⚠️  Error determining agreement: {e}")
            return "nuanced"
    
    def _create_perspectives(self, discussion_id: str, chunks: List[Dict]):
        """Create perspectives from chunks."""
        perspectives_created = 0
        
        for idx, chunk in enumerate(chunks):
            try:
                chunk_id = chunk.get("chunk_id")
                guest_id = chunk.get("guest_id", "")
                guest_name = chunk.get("guest_name") or guest_id.replace("-", " ").title()
                
                # Get episode metadata
                episode_id = chunk.get("episode_id", "")
                episode_title = None
                episode_number = None
                
                # Try to get episode info
                try:
                    episode_response = self.client.table("episodes").select("title, episode_number").eq("id", episode_id).limit(1).execute()
                    if episode_response.data:
                        episode_title = episode_response.data[0].get("title")
                        episode_number = episode_response.data[0].get("episode_number")
                except:
                    pass
                
                # Get chunk text - use core_thesis if text is not available
                chunk_text = chunk.get("text", "")
                if not chunk_text or len(chunk_text) < 20:
                    # Fallback to core_thesis
                    chunk_text = chunk.get("core_thesis", "")
                    if not chunk_text or len(chunk_text) < 20:
                        # Use semantic descriptors
                        descriptors = chunk.get("semantic_descriptors", [])
                        if descriptors:
                            chunk_text = ". ".join(descriptors[:3])
                        else:
                            continue  # Skip if no content
                
                # Expand if too short (use semantic descriptors to enrich)
                if len(chunk_text) < 100:
                    descriptors = chunk.get("semantic_descriptors", [])
                    if descriptors:
                        additional = ". ".join(descriptors[:2])
                        chunk_text = f"{chunk_text}. {additional}"
                
                # Truncate if too long (perspectives should be 3-6 sentences)
                if len(chunk_text) > 500:
                    # Try to truncate at sentence boundary
                    sentences = chunk_text[:500].rsplit('.', 1)[0]
                    if len(sentences) > 200:
                        chunk_text = sentences + "."
                    else:
                        chunk_text = chunk_text[:500] + "..."
                
                # Insert perspective (chunk_id can be null if chunk_embeddings doesn't exist)
                perspective_data = {
                    "discussion_id": discussion_id,
                    "guest_id": guest_id,
                    "guest_name": guest_name,
                    "guest_title": None,  # Will be populated from episodes table later
                    "guest_company": None,
                    "content": chunk_text,
                    "episode_id": episode_id,
                    "episode_title": episode_title,
                    "episode_number": episode_number,
                    "timestamp": chunk.get("timestamp"),
                    "display_order": idx
                }
                
                # Only include chunk_id if it exists in theme_extractions (for FK constraint)
                if chunk_id:
                    # Verify chunk_id exists in theme_extractions
                    try:
                        check_response = self.client.table("theme_extractions").select("chunk_id").eq("chunk_id", chunk_id).limit(1).execute()
                        if check_response.data:
                            perspective_data["chunk_id"] = chunk_id
                    except:
                        pass  # Skip chunk_id if check fails
                
                perspective_response = self.client.table("perspectives").insert(perspective_data).execute()
                
                if perspective_response.data:
                    perspectives_created += 1
                    
            except Exception as e:
                print(f"         ⚠️  Error creating perspective: {e}")
                continue
        
        return perspectives_created
    
    def generate_all_discussions(self, max_discussions_per_panel: int = 5):
        """Generate discussions for all panels."""
        print("\n🎯 Generating Discussions for Panels...")
        print("=" * 60)
        
        # Get all panels
        print("\n1. Loading panels...")
        try:
            panels_response = self.client.table("panels").select("id, slug, title").execute()
            panels = panels_response.data or []
            print(f"   Found {len(panels)} panels")
        except Exception as e:
            print(f"   ❌ Error loading panels: {e}")
            return
        
        if not panels:
            print("   ⚠️  No panels found")
            return
        
        # Get panel themes
        print("\n2. Loading panel-theme relationships...")
        panel_themes = {}
        for panel in panels:
            panel_id = panel["id"]
            try:
                pt_response = self.client.table("panel_themes").select("theme_id").eq("panel_id", panel_id).execute()
                panel_themes[panel_id] = [pt["theme_id"] for pt in pt_response.data]
            except:
                panel_themes[panel_id] = []
        
        # Generate discussions
        print(f"\n3. Generating discussions (max {max_discussions_per_panel} per panel)...")
        total_discussions = 0
        total_perspectives = 0
        start_time = time.time()
        last_progress_time = start_time
        
        for idx, panel in enumerate(panels, 1):
            panel_id = panel["id"]
            panel_slug = panel["slug"]
            theme_ids = panel_themes.get(panel_id, [])
            
            if not theme_ids:
                print(f"   [{idx}/{len(panels)}] ⚠️  Panel {panel_slug} has no themes")
                continue
            
            print(f"\n   [{idx}/{len(panels)}] Panel: {panel_slug}")
            discussions_count, perspectives_count = self.generate_discussions_for_panel(panel_id, panel_slug, theme_ids)
            total_discussions += discussions_count
            total_perspectives += perspectives_count
            
            # Progress update every 5 seconds or every panel
            current_time = time.time()
            if current_time - last_progress_time >= 5 or idx % 5 == 0:
                elapsed = current_time - start_time
                rate = idx / elapsed if elapsed > 0 else 0
                remaining = (len(panels) - idx) / rate if rate > 0 else 0
                
                print(f"\n   📊 Progress: {idx}/{len(panels)} panels ({idx/len(panels)*100:.1f}%)")
                print(f"      Discussions: {total_discussions} | Perspectives: {total_perspectives}")
                print(f"      Rate: {rate:.1f} panels/min | ETA: {remaining/60:.1f} min")
                last_progress_time = current_time
            
            # Rate limiting
            if idx < len(panels):
                time.sleep(0.2)
        
        elapsed_total = time.time() - start_time
        
        print("\n" + "=" * 60)
        print(f"✅ Discussion generation complete!")
        print(f"   Panels processed: {len(panels)}")
        print(f"   Discussions created: {total_discussions}")
        print(f"   Perspectives created: {total_perspectives}")
        print(f"   Time elapsed: {elapsed_total/60:.1f} minutes")
        print(f"   Average: {total_discussions/len(panels):.1f} discussions per panel")


def main():
    """Main entry point."""
    import argparse
    
    parser = argparse.ArgumentParser(description="Generate discussions for panels")
    parser.add_argument("--use-supabase", action="store_true", help="Use Supabase for storage")
    parser.add_argument("--max-discussions", type=int, default=5, help="Max discussions per panel")
    args = parser.parse_args()
    
    if not args.use_supabase:
        print("❌ This script requires --use-supabase")
        return
    
    # Initialize
    supabase_store = SupabaseStore()
    generator = DiscussionGenerator(supabase_store)
    
    # Generate discussions
    generator.generate_all_discussions(max_discussions_per_panel=args.max_discussions)


if __name__ == "__main__":
    main()

