"""
Generate Panel Slugs using Gemini - Creates content-aware slugs for all themes.
This script generates slugs now, before panel creation, using theme content and guest context.
"""
import sys
from pathlib import Path
import os
import re
import time
from typing import Dict, Optional
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


class PanelSlugGenerator:
    """Generate content-aware panel slugs using Gemini."""
    
    def __init__(self, supabase_store: SupabaseStore):
        self.supabase_store = supabase_store
        self.client = supabase_store.client
        
        # Initialize Gemini
        if not GEMINI_AVAILABLE:
            raise ValueError("Gemini not available")
        
        api_key = os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY")
        if not api_key:
            raise ValueError("GEMINI_API_KEY or GOOGLE_API_KEY not found in environment")
        
        self.gemini_client = genai.Client(api_key=api_key)
        print("✅ Gemini initialized for slug generation")
    
    def generate_slug_for_theme(self, theme: Dict) -> Optional[str]:
        """Generate a content-aware slug for a theme using Gemini."""
        try:
            theme_id = theme.get('theme_id', '')
            theme_label = theme.get('label', '')
            example_phrases = theme.get('example_phrases', [])
            guest_ids = theme.get('guest_ids', [])
            chunk_ids = theme.get('chunk_ids', [])
            
            # Get sample core theses from chunks
            sample_theses = []
            if chunk_ids:
                try:
                    sample_chunk_ids = chunk_ids[:5]  # Get first 5 chunks
                    for chunk_id in sample_chunk_ids:
                        response = self.client.table("theme_extractions").select("core_thesis").eq("chunk_id", chunk_id).limit(1).execute()
                        if response.data and response.data[0].get('core_thesis'):
                            thesis = response.data[0]['core_thesis']
                            if thesis and len(thesis.strip()) > 10:  # Valid thesis
                                sample_theses.append(thesis)
                                if len(sample_theses) >= 3:  # Max 3 samples
                                    break
                except Exception as e:
                    print(f"   ⚠️  Error getting sample theses: {e}")
            
            # Get guest names (convert guest_ids to names)
            guest_names = []
            if guest_ids:
                # Try to get guest names from episodes or use formatted guest_ids
                for guest_id in guest_ids[:10]:  # Top 10 guests
                    # Format guest_id to name (e.g., "brian-chesky" -> "Brian Chesky")
                    guest_name = guest_id.replace("-", " ").title()
                    guest_names.append(guest_name)
            
            # Build comprehensive context
            context_parts = []
            
            if theme_label:
                context_parts.append(f"**Theme**: {theme_label}")
            
            if example_phrases and len(example_phrases) > 0:
                # Get unique, meaningful examples
                unique_examples = []
                seen = set()
                for phrase in example_phrases:
                    phrase_lower = phrase.lower().strip()
                    if phrase_lower and phrase_lower not in seen and len(phrase_lower) > 3:
                        unique_examples.append(phrase)
                        seen.add(phrase_lower)
                        if len(unique_examples) >= 10:
                            break
                if unique_examples:
                    context_parts.append(f"**Key Topics**: {', '.join(unique_examples)}")
            
            if sample_theses:
                context_parts.append(f"**Sample Insights**:")
                for i, thesis in enumerate(sample_theses, 1):
                    context_parts.append(f"  {i}. {thesis}")
            
            if guest_names:
                context_parts.append(f"**Panel Experts** ({len(guest_ids)} total): {', '.join(guest_names[:8])}")
                if len(guest_names) > 8:
                    context_parts.append(f"  ... and {len(guest_names) - 8} more experts")
            
            context = "\n".join(context_parts)
            
            # Create comprehensive prompt
            prompt = f"""Generate a URL-friendly slug (hyphenated, lowercase) for a panel discussion based on this expert panel theme.

PANEL INFORMATION:
{context}

REQUIREMENTS:
- 2-4 words maximum (preferably 2-3)
- Descriptive and specific (not generic like "discussion" or "insights")
- Captures the essence of what these experts discuss
- Panel discussion focused (think: "the-growth-engine", "product-leadership", "pricing-mastery")
- 25-40 characters max
- No special characters except hyphens
- Should be memorable and SEO-friendly

EXAMPLES OF EXCELLENT SLUGS:
- "the-growth-engine" (for growth strategies with multiple experts)
- "product-leadership" (for product management discussions)
- "pricing-mastery" (for pricing strategy panels)
- "b2b-sales-motion" (for B2B sales discussions)
- "early-stage-growth" (for startup growth)
- "team-building-playbook" (for team building)

BAD EXAMPLES (too generic):
- "discussion" ❌
- "insights" ❌
- "expert-panel" ❌
- "theme-discussion" ❌

Generate ONLY the slug, nothing else. No explanation, no quotes, no markdown, just the slug:"""

            # Call Gemini
            response = self.gemini_client.models.generate_content(
                model="models/gemini-2.5-flash",
                contents=prompt
            )
            
            # Extract and clean slug
            slug = response.text.strip().lower()
            
            # Clean up
            slug = re.sub(r'["\']', '', slug)  # Remove quotes
            slug = re.sub(r'[^\w-]', '-', slug)  # Replace non-word chars with hyphens
            slug = re.sub(r'-+', '-', slug)  # Collapse multiple hyphens
            slug = slug.strip('-')  # Remove leading/trailing hyphens
            
            # Remove common suffixes that make it generic
            generic_suffixes = ['-discussion', '-insights', '-panel', '-experts', '-theme']
            for suffix in generic_suffixes:
                if slug.endswith(suffix) and len(slug) > len(suffix) + 5:
                    slug = slug[:-len(suffix)]
                    break
            
            # Validate
            if 5 <= len(slug) <= 45 and len(slug.split('-')) <= 5:
                return slug
            else:
                print(f"   ⚠️  Generated slug invalid: {slug} (length: {len(slug)})")
                return None
                
        except Exception as e:
            print(f"   ⚠️  Error generating slug for theme {theme.get('theme_id')}: {e}")
            import traceback
            traceback.print_exc()
            return None
    
    def generate_all_slugs(self, resume: bool = True):
        """Generate slugs for all themes and update database. Can resume from where it left off."""
        print("\n🎯 Generating Panel Slugs with Gemini...")
        print("=" * 60)
        
        # Load all themes
        print("\n1. Loading themes from Supabase...")
        try:
            response = self.client.table("themes").select("*").execute()
            themes = response.data or []
            print(f"   Found {len(themes)} themes")
        except Exception as e:
            print(f"   ❌ Error loading themes: {e}")
            return
        
        if not themes:
            print("   ⚠️  No themes found")
            return
        
        # Check which themes already have slugs (for resumption)
        themes_to_process = []
        already_done = 0
        
        if resume:
            print("\n2. Checking existing slugs...")
            for theme in themes:
                theme_id = theme.get('theme_id', '')
                # Check if slug already exists
                try:
                    check_response = self.client.table("themes").select("panel_slug").eq("theme_id", theme_id).execute()
                    if check_response.data and check_response.data[0].get('panel_slug'):
                        already_done += 1
                        continue
                except:
                    pass
                themes_to_process.append(theme)
            
            print(f"   Already have slugs: {already_done}/{len(themes)}")
            print(f"   Remaining to process: {len(themes_to_process)}/{len(themes)}")
        else:
            themes_to_process = themes
        
        if not themes_to_process:
            print("\n✅ All themes already have slugs!")
            return
        
        # Generate slugs
        print(f"\n3. Generating slugs with Gemini...")
        print(f"   Processing {len(themes_to_process)} themes...")
        print("   (This may take a while - script will save progress as it goes)")
        
        slugs_generated = 0
        slugs_failed = 0
        slugs_updated = 0
        
        for i, theme in enumerate(themes_to_process, 1):
            theme_id = theme.get('theme_id', '')
            theme_label = theme.get('label', '')
            
            print(f"\n   [{i}/{len(themes_to_process)}] Theme: {theme_label}")
            
            # Retry logic
            max_retries = 3
            slug = None
            
            for attempt in range(max_retries):
                try:
                    slug = self.generate_slug_for_theme(theme)
                    if slug:
                        break
                except Exception as e:
                    if attempt < max_retries - 1:
                        wait_time = (attempt + 1) * 2  # Exponential backoff: 2s, 4s, 6s
                        print(f"      ⚠️  Attempt {attempt + 1} failed: {e}")
                        print(f"      Retrying in {wait_time}s...")
                        time.sleep(wait_time)
                    else:
                        print(f"      ❌ All attempts failed: {e}")
            
            if slug:
                # Save slug to database immediately (so we can resume)
                try:
                    update_response = self.client.table("themes").update({
                        "panel_slug": slug
                    }).eq("theme_id", theme_id).execute()
                    
                    if update_response.data:
                        print(f"      ✅ Generated & saved: {slug}")
                        slugs_generated += 1
                        slugs_updated += 1
                    else:
                        print(f"      ⚠️  Generated but failed to save: {slug}")
                        slugs_generated += 1
                except Exception as e:
                    print(f"      ⚠️  Error saving slug to database: {e}")
                    slugs_generated += 1  # Count as generated even if save failed
            else:
                print(f"      ❌ Failed to generate slug after {max_retries} attempts")
                slugs_failed += 1
            
            # Rate limiting - small delay between requests
            if i < len(themes_to_process):
                time.sleep(0.5)  # 500ms delay to avoid rate limits
            
            # Progress update every 10 themes
            if i % 10 == 0:
                print(f"\n   📊 Progress: {i}/{len(themes_to_process)} processed, {slugs_generated} generated, {slugs_updated} saved")
        
        print("\n" + "=" * 60)
        print("✅ Slug Generation Complete!")
        print(f"   Total themes: {len(themes)}")
        print(f"   Already had slugs: {already_done}")
        print(f"   Generated: {slugs_generated}/{len(themes_to_process)}")
        print(f"   Saved to database: {slugs_updated}")
        print(f"   Failed: {slugs_failed}")
        print("\n💡 Slugs are saved in themes.panel_slug column")
        print("   Panel generator will use these when creating panels.")


def main():
    """Main entry point."""
    import argparse
    
    parser = argparse.ArgumentParser(description="Generate panel slugs using Gemini")
    parser.add_argument("--use-supabase", action="store_true", help="Use Supabase for storage")
    parser.add_argument("--no-resume", action="store_true", help="Don't resume - regenerate all slugs")
    args = parser.parse_args()
    
    if not args.use_supabase:
        print("❌ This script requires --use-supabase")
        return
    
    # Check Gemini availability
    if not GEMINI_AVAILABLE:
        print("❌ Gemini not available. Install: pip install google-generativeai")
        return
    
    api_key = os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY")
    if not api_key:
        print("❌ GEMINI_API_KEY or GOOGLE_API_KEY not found in environment")
        return
    
    # Initialize
    try:
        supabase_store = SupabaseStore()
        generator = PanelSlugGenerator(supabase_store)
        
        # Generate all slugs (with resume by default)
        generator.generate_all_slugs(resume=not args.no_resume)
    except KeyboardInterrupt:
        print("\n\n⚠️  Interrupted by user. Progress has been saved.")
        print("   Run the script again to resume from where it left off.")
        sys.exit(0)
    except Exception as e:
        print(f"\n\n❌ Error: {e}")
        import traceback
        traceback.print_exc()
        print("\n⚠️  Progress has been saved. Run the script again to resume.")
        sys.exit(1)


if __name__ == "__main__":
    main()

