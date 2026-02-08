"""
Panel Generator - Creates panels from LLM-extracted themes.
Ensures all guests are covered in at least one panel.

Process:
1. Load themes from Supabase
2. Load guest_theme_strengths to determine top guests per theme
3. Create panels (one per theme, or group related themes)
4. Select top N guests per panel based on theme strengths
5. Ensure all guests are covered
6. Generate panel metadata (title, description, category)
7. Use Gemini to generate content-aware slugs
"""
import sys
from pathlib import Path
import json
import re
import os
from typing import List, Dict, Set, Optional
from dataclasses import dataclass, asdict
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

load_dotenv()


@dataclass
class Panel:
    """Panel data structure."""
    slug: str
    title: str
    description: str
    short_description: str
    category: str
    theme_ids: List[str]
    guest_ids: List[str]


class PanelGenerator:
    """Generates panels from themes."""
    
    # Comprehensive categories based on all themes
    CATEGORIES = [
        # Product Development
        "Product Strategy & Development",
        "Product Discovery & Research",
        "B2B & Enterprise Product",
        "AI & Emerging Tech",
        
        # Growth & Marketing
        "Early Stage Growth",
        "Growth Strategy & Tactics",
        "User Acquisition & Engagement",
        "Content & Distribution",
        
        # Team & Leadership
        "Hiring & Building Teams",
        "Team Dynamics & Collaboration",
        "Leadership & Management",
        "Organizational Culture",
        
        # Strategy & Operations
        "Strategic Planning & Prioritization",
        "Go-to-Market Strategy",
        "Operational Excellence",
        "Competitive Strategy",
        
        # Career & Personal Development
        "Career Development",
        "Personal Growth & Skills",
        "Mentorship & Learning",
        
        # Business & Finance
        "Fundraising & Investment",
        "Pricing & Monetization",
    ]
    
    def __init__(self, supabase_store: SupabaseStore):
        self.supabase_store = supabase_store
        self.client = supabase_store.client
        
        # Initialize Gemini for slug generation
        self.gemini_client = None
        if GEMINI_AVAILABLE:
            api_key = os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY")
            if api_key:
                try:
                    self.gemini_client = genai.Client(api_key=api_key)
                    print("  ✅ Gemini initialized for slug generation")
                except Exception as e:
                    print(f"  ⚠️  Failed to initialize Gemini: {e}")
                    print("  Will use rule-based slug generation")
    
    # Comprehensive category keywords based on all themes
    CATEGORY_KEYWORDS = {
        # Product Development
        "Product Strategy & Development": [
            "product strategy", "product development", "product differentiation", 
            "iterative product", "customer-centric product", "product roadmap",
            "product vision", "product planning"
        ],
        "Product Discovery & Research": [
            "product discovery", "user research", "customer research", 
            "product-market fit", "validation", "user needs"
        ],
        "B2B & Enterprise Product": [
            "B2B", "enterprise", "SaaS enterprise", "enterprise features",
            "enterprise sales", "B2B product", "enterprise software"
        ],
        "AI & Emerging Tech": [
            "AI", "artificial intelligence", "AI product", "AI development",
            "AI safety", "machine learning", "emerging technology"
        ],
        
        # Growth & Marketing
        "Early Stage Growth": [
            "early stage", "startup growth", "early-stage startup", 
            "startup strategy", "founder", "launch"
        ],
        "Growth Strategy & Tactics": [
            "growth strategy", "growth tactics", "growth loops", 
            "growth engine", "scaling growth", "growth playbook"
        ],
        "User Acquisition & Engagement": [
            "user acquisition", "audience engagement", "user engagement",
            "listener engagement", "acquisition", "retention", "engagement"
        ],
        "Content & Distribution": [
            "content discoverability", "content distribution", "podcast promotion",
            "marketing", "distribution", "discoverability"
        ],
        
        # Team & Leadership
        "Hiring & Building Teams": [
            "hiring", "recruiting", "talent", "strategic hiring",
            "team building", "building teams", "recruitment"
        ],
        "Team Dynamics & Collaboration": [
            "team dynamics", "cross-functional", "collaboration",
            "team collaboration", "working together", "teamwork"
        ],
        "Leadership & Management": [
            "leadership", "management", "developing conviction",
            "organizational alignment", "strategic alignment", "role clarity"
        ],
        "Organizational Culture": [
            "culture", "organizational culture", "organizational values",
            "company culture", "team culture", "psychological safety",
            "values", "organizational"
        ],
        
        # Strategy & Operations
        "Strategic Planning & Prioritization": [
            "strategic prioritization", "prioritization", "strategic planning",
            "strategic focus", "strategic clarity", "resource allocation"
        ],
        "Go-to-Market Strategy": [
            "go-to-market", "GTM", "go to market", "market strategy",
            "launch strategy", "market entry"
        ],
        "Operational Excellence": [
            "operational efficiency", "operations", "efficiency",
            "process improvement", "operational"
        ],
        "Competitive Strategy": [
            "competitive differentiation", "differentiation", "competitive advantage",
            "market disruption", "competitive", "market position"
        ],
        
        # Career & Personal Development
        "Career Development": [
            "career", "professional", "professional development",
            "career growth", "career advice"
        ],
        "Personal Growth & Skills": [
            "skill development", "personal growth", "self-awareness",
            "emotional intelligence", "habits", "habit formation",
            "embracing challenges", "novelty", "learning"
        ],
        "Mentorship & Learning": [
            "mentorship", "professional mentorship", "mentor",
            "knowledge sharing", "knowledge acquisition", "experiential learning",
            "learning", "teaching"
        ],
        
        # Business & Finance
        "Fundraising & Investment": [
            "fundraising", "venture capital", "VC", "investment",
            "investor", "funding", "raise", "capital"
        ],
        "Pricing & Monetization": [
            "pricing", "monetization", "revenue", "pricing strategy",
            "pricing model", "value-based pricing", "monetization strategy"
        ],
    }
    
    def __init__(self, supabase_store: SupabaseStore):
        self.supabase_store = supabase_store
        self.client = supabase_store.client
    
    def generate_panels(self, min_guests_per_panel: int = 3, max_guests_per_panel: int = 10) -> List[Panel]:
        """
        Generate panels from themes.
        
        Args:
            min_guests_per_panel: Minimum guests per panel
            max_guests_per_panel: Maximum guests per panel
            
        Returns:
            List of Panel objects
        """
        print("\n🎯 Generating Panels from Themes...")
        print("=" * 60)
        
        # Load themes
        print("\n1. Loading themes...")
        themes = self._load_themes()
        print(f"   Found {len(themes)} themes")
        
        # Load guest theme strengths
        print("\n2. Loading guest theme strengths...")
        guest_strengths = self._load_guest_strengths()
        print(f"   Found strengths for {len(guest_strengths)} guest-theme pairs")
        
        # Get all unique guests
        all_guests = self._get_all_guests()
        print(f"   Total unique guests: {len(all_guests)}")
        
        # Create panels from themes
        print("\n3. Creating panels from themes...")
        panels = []
        covered_guests: Set[str] = set()
        
        # Sort themes by guest count (descending) to prioritize popular themes
        themes_sorted = sorted(themes, key=lambda t: len(t.get('guest_ids', [])), reverse=True)
        
        for theme in themes_sorted:
            theme_id = theme['theme_id']
            theme_label = theme.get('label', '')
            theme_guest_ids = theme.get('guest_ids', [])
            
            # Get top guests for this theme
            if guest_strengths:
                # Use guest_theme_strengths if available
                theme_guest_strengths = [
                    (gts['guest_id'], gts['strength'], gts.get('chunk_count', 0))
                    for gts in guest_strengths
                    if gts['theme_id'] == theme_id
                ]
                
                # Sort by strength (descending), then by chunk_count
                theme_guest_strengths.sort(key=lambda x: (x[1], x[2]), reverse=True)
                
                # Select top guests
                selected_guests = [
                    guest_id for guest_id, _, _ in theme_guest_strengths[:max_guests_per_panel]
                ]
            else:
                # Fallback: use theme's guest_ids directly
                selected_guests = list(theme_guest_ids[:max_guests_per_panel])
            
            # Ensure minimum guests
            if len(selected_guests) < min_guests_per_panel:
                # Add more guests from theme's guest_ids if available
                for guest_id in theme_guest_ids:
                    if guest_id not in selected_guests and len(selected_guests) < max_guests_per_panel:
                        selected_guests.append(guest_id)
            
            if len(selected_guests) < min_guests_per_panel:
                print(f"   ⚠️  Theme {theme_id} has only {len(selected_guests)} guests, skipping...")
                continue
            
            # Generate panel metadata
            panel = self._create_panel_from_theme(theme, selected_guests)
            panels.append(panel)
            covered_guests.update(selected_guests)
            
            print(f"   ✅ Panel: {panel.title} ({len(selected_guests)} guests)")
        
        print(f"\n   Created {len(panels)} panels")
        print(f"   Covered {len(covered_guests)}/{len(all_guests)} guests ({len(covered_guests)/len(all_guests)*100:.1f}%)")
        
        # Ensure all guests are covered
        print("\n4. Ensuring all guests are covered...")
        uncovered_guests = all_guests - covered_guests
        if uncovered_guests:
            print(f"   Found {len(uncovered_guests)} uncovered guests")
            self._add_guests_to_panels(panels, uncovered_guests, guest_strengths, max_guests_per_panel)
            covered_guests.update(uncovered_guests)
            print(f"   Now covering {len(covered_guests)}/{len(all_guests)} guests ({len(covered_guests)/len(all_guests)*100:.1f}%)")
        
        return panels
    
    def _load_themes(self) -> List[Dict]:
        """Load themes from Supabase."""
        try:
            response = self.client.table("themes").select("*").execute()
            return response.data or []
        except Exception as e:
            print(f"   ⚠️  Error loading themes: {e}")
            return []
    
    def _load_guest_strengths(self) -> List[Dict]:
        """Load guest theme strengths from Supabase."""
        try:
            # Load with pagination
            all_strengths = []
            offset = 0
            limit = 1000
            while True:
                response = self.client.table("guest_theme_strengths").select("*").range(offset, offset + limit - 1).execute()
                if not response.data:
                    break
                all_strengths.extend(response.data)
                offset += limit
            return all_strengths
        except Exception as e:
            print(f"   ⚠️  Error loading guest strengths: {e}")
            return []
    
    def _get_all_guests(self) -> Set[str]:
        """Get all unique guest IDs."""
        try:
            response = self.client.table("theme_extractions").select("guest_id").execute()
            guest_ids = set()
            offset = 0
            limit = 1000
            while True:
                response = self.client.table("theme_extractions").select("guest_id").range(offset, offset + limit - 1).execute()
                if not response.data:
                    break
                for row in response.data:
                    if row.get('guest_id'):
                        guest_ids.add(row['guest_id'])
                offset += limit
            return guest_ids
        except Exception as e:
            print(f"   ⚠️  Error getting guests: {e}")
            return set()
    
    def _create_panel_from_theme(self, theme: Dict, guest_ids: List[str]) -> Panel:
        """Create a panel from a theme."""
        theme_id = theme['theme_id']
        theme_label = theme.get('label', '')
        
        # Use pre-generated slug from database if available, otherwise generate
        theme_slug = theme.get('panel_slug')
        if theme_slug:
            slug = theme_slug
            print(f"      Using pre-generated slug: {slug}")
        else:
            # Generate slug using Gemini (content-aware) or fallback to rule-based
            slug = self._generate_slug_with_gemini(theme) or self._generate_slug(theme_label or f"theme-{theme_id}")
        
        # Generate title (capitalize and clean theme label)
        title = self._generate_title(theme_label or f"Theme {theme_id}")
        
        # Generate description
        description = self._generate_description(theme, guest_ids)
        short_description = description[:150] + "..." if len(description) > 150 else description
        
        # Determine category
        category = self._determine_category(theme_label)
        
        return Panel(
            slug=slug,
            title=title,
            description=description,
            short_description=short_description,
            category=category,
            theme_ids=[theme_id],
            guest_ids=guest_ids
        )
    
    def _generate_slug_with_gemini(self, theme: Dict) -> Optional[str]:
        """Generate a content-aware slug using Gemini based on theme content."""
        if not self.gemini_client:
            return None
        
        try:
            theme_label = theme.get('label', '')
            example_phrases = theme.get('example_phrases', [])
            guest_count = len(theme.get('guest_ids', []))
            chunk_ids = theme.get('chunk_ids', [])
            
            # Get sample core theses from chunks in this theme for better context
            sample_theses = []
            if chunk_ids:
                try:
                    # Get a few sample extractions to understand the theme content
                    sample_chunk_ids = chunk_ids[:3]  # Get first 3 chunks
                    for chunk_id in sample_chunk_ids:
                        response = self.client.table("theme_extractions").select("core_thesis").eq("chunk_id", chunk_id).limit(1).execute()
                        if response.data and response.data[0].get('core_thesis'):
                            sample_theses.append(response.data[0]['core_thesis'])
                except:
                    pass  # If we can't get sample theses, continue without them
            
            # Build context from theme
            context_parts = []
            if theme_label:
                context_parts.append(f"Theme: {theme_label}")
            if example_phrases and len(example_phrases) > 0:
                # Filter out duplicates and get unique examples
                unique_examples = list(dict.fromkeys(example_phrases[:8]))  # Preserve order, remove dupes
                context_parts.append(f"Example topics: {', '.join(unique_examples)}")
            if sample_theses:
                context_parts.append(f"Sample insights: {' | '.join(sample_theses[:2])}")
            if guest_count > 0:
                context_parts.append(f"Discussed by {guest_count} industry experts")
            
            context = "\n".join(context_parts)
            
            prompt = f"""Generate a URL-friendly slug (hyphenated, lowercase) for a panel discussion based on this theme.

Theme Information:
{context}

Requirements:
- 2-4 words maximum
- Descriptive and specific (not generic)
- Discussion/panel-focused (e.g., "growth-engine", "product-leadership", "pricing-mastery")
- 30-40 characters max
- No special characters except hyphens
- Should capture the essence of what experts discuss in this theme

Examples of good slugs:
- "the-growth-engine" (for growth strategies)
- "product-leadership" (for product management)
- "pricing-mastery" (for pricing strategies)
- "b2b-sales-motion" (for B2B sales)

Generate ONLY the slug, nothing else. No explanation, no quotes, just the slug:"""

            # Use the correct Gemini API format (matching theme_extractor.py)
            response = self.gemini_client.models.generate_content(
                model="models/gemini-2.5-flash",
                contents=prompt
            )
            
            # Extract slug from response
            slug = response.text.strip().lower()
            
            # Clean up: remove quotes, extra whitespace, etc.
            slug = re.sub(r'["\']', '', slug)
            slug = re.sub(r'[^\w-]', '-', slug)
            slug = re.sub(r'-+', '-', slug)
            slug = slug.strip('-')
            
            # Validate length
            if 5 <= len(slug) <= 45:
                return slug
            else:
                return None
                
        except Exception as e:
            print(f"   ⚠️  Error generating slug with Gemini for theme {theme.get('theme_id')}: {e}")
            return None
    
    def _generate_slug(self, text: str) -> str:
        """Generate URL-friendly slug that's descriptive and discussion-focused."""
        # Clean the text
        slug = text.lower().strip()
        
        # Remove common prefixes/suffixes that make it generic
        slug = re.sub(r'^(the|a|an)\s+', '', slug, flags=re.IGNORECASE)
        slug = re.sub(r'\s+(core|advanced|\(core\)|\(advanced\))', '', slug)
        
        # Remove parenthetical content
        slug = re.sub(r'\([^)]*\)', '', slug)
        
        # Replace spaces and special chars with hyphens
        slug = re.sub(r'[^\w\s-]', '', slug)
        slug = re.sub(r'[-\s]+', '-', slug)
        slug = slug.strip('-')
        
        # Make it more discussion-focused if it's too generic
        # Check if slug is just a single word or very generic
        words = slug.split('-')
        
        # Skip adding discussion if it already has action words
        has_action_word = any(word in ['discussion', 'insights', 'strategies', 'mastery', 'engine', 
                                       'motion', 'playbook', 'guide', 'framework'] for word in words)
        
        if len(words) <= 1:
            # Single word - definitely add context
            if not has_action_word:
                slug = f"{slug}-discussion"
        elif len(words) == 2:
            # Two words - add context if it's a generic combo
            if not has_action_word:
                # Check if it's a common generic combo
                generic_combos = ['strategy', 'growth', 'product', 'team', 'market', 'customer', 
                                'user', 'business', 'company', 'organization']
                if any(word in generic_combos for word in words):
                    slug = f"{slug}-insights"
                else:
                    # More specific two-word combo, add discussion
                    slug = f"{slug}-discussion"
        # For 3+ words, assume it's descriptive enough
        
        # Ensure it's not too long (max 45 chars for readability)
        if len(slug) > 45:
            # Try to shorten intelligently
            words = slug.split('-')
            if len(words) > 3:
                # Keep first 3 words
                slug = '-'.join(words[:3])
            else:
                # Truncate but keep word boundaries
                slug = slug[:45].rsplit('-', 1)[0]
        
        # Final cleanup
        slug = slug.strip('-')
        
        # Fallback
        if not slug or len(slug) < 3:
            slug = "expert-discussion"
        
        return slug
    
    def _generate_title(self, theme_label: str) -> str:
        """Generate panel title from theme label - make it discussion-focused."""
        # Clean the label
        title = theme_label.strip()
        
        # Remove parenthetical content like "(Core)" or "(Advanced)"
        title = re.sub(r'\s*\([^)]*\)', '', title)
        
        # Capitalize properly
        title = ' '.join(word.capitalize() for word in title.split())
        
        # Remove common prefixes
        title = re.sub(r'^(The|A|An)\s+', '', title, flags=re.IGNORECASE)
        
        # Make it more discussion-focused if it's too generic
        # Check if title is just a single concept
        words = title.split()
        if len(words) <= 2 and not any(word.lower() in ['discussion', 'insights', 'strategies', 'mastery', 'engine'] for word in words):
            # Add context to make it more panel-like
            if 'discussion' not in title.lower():
                title = f"{title} Discussion"
        
        return title or "Expert Panel Discussion"
    
    def _generate_description(self, theme: Dict, guest_ids: List[str]) -> str:
        """Generate panel description."""
        theme_label = theme.get('label', '')
        guest_count = len(guest_ids)
        
        # Get example phrases if available
        example_phrases = theme.get('example_phrases', [])
        if example_phrases and len(example_phrases) > 0:
            examples = ', '.join(example_phrases[:3])
            return f"Explore insights on {theme_label.lower()} from {guest_count} industry experts. Key topics include: {examples}."
        else:
            return f"Expert perspectives on {theme_label.lower()} from {guest_count} industry leaders. Learn from their real-world experiences and insights."
    
    def _determine_category(self, theme_label: str) -> str:
        """Determine panel category from theme label using comprehensive keyword matching."""
        theme_lower = theme_label.lower()
        
        # Score each category (weighted by keyword match)
        category_scores = {}
        for category, keywords in self.CATEGORY_KEYWORDS.items():
            score = 0
            for keyword in keywords:
                if keyword.lower() in theme_lower:
                    # Longer/more specific keywords get higher weight
                    score += len(keyword.split()) * 2
            if score > 0:
                category_scores[category] = score
        
        # Return highest scoring category
        if category_scores:
            best_category = max(category_scores.items(), key=lambda x: x[1])[0]
            return best_category
        
        # Fallback: use theme label to infer category
        # Check for common patterns
        if any(word in theme_lower for word in ["product", "development", "strategy"]):
            return "Product Strategy & Development"
        elif any(word in theme_lower for word in ["growth", "acquisition", "engagement"]):
            return "Growth Strategy & Tactics"
        elif any(word in theme_lower for word in ["team", "hiring", "collaboration"]):
            return "Team Dynamics & Collaboration"
        elif any(word in theme_lower for word in ["strategic", "prioritization", "planning"]):
            return "Strategic Planning & Prioritization"
        elif any(word in theme_lower for word in ["mentorship", "learning", "knowledge"]):
            return "Mentorship & Learning"
        elif any(word in theme_lower for word in ["venture", "capital", "investment", "fundraising"]):
            return "Fundraising & Investment"
        else:
            return "Product Strategy & Development"  # Default
    
    def _add_guests_to_panels(self, panels: List[Panel], uncovered_guests: Set[str], 
                              guest_strengths: List[Dict], max_guests: int):
        """Add uncovered guests to existing panels where they have strength."""
        # Build guest-to-strengths map
        guest_strength_map = defaultdict(list)
        for gts in guest_strengths:
            guest_strength_map[gts['guest_id']].append(gts)
        
        # For each uncovered guest, find their best theme and add to that panel
        for guest_id in uncovered_guests:
            guest_themes = guest_strength_map.get(guest_id, [])
            if not guest_themes:
                continue
            
            # Sort by strength
            guest_themes.sort(key=lambda x: x['strength'], reverse=True)
            
            # Find panel for this theme
            best_theme_id = guest_themes[0]['theme_id']
            for panel in panels:
                if best_theme_id in panel.theme_ids:
                    if len(panel.guest_ids) < max_guests and guest_id not in panel.guest_ids:
                        panel.guest_ids.append(guest_id)
                        print(f"   ➕ Added {guest_id} to panel: {panel.title}")
                        break
    
    def save_panels(self, panels: List[Panel]):
        """Save panels to Supabase."""
        print("\n5. Saving panels to Supabase...")
        
        # Load episode metadata for guest names
        episode_metadata = self._load_episode_metadata()
        guest_name_map = self._build_guest_name_map(episode_metadata)
        
        saved_count = 0
        for panel in panels:
            try:
                # Insert panel
                panel_data = {
                    "slug": panel.slug,
                    "title": panel.title,
                    "description": panel.description,
                    "short_description": panel.short_description,
                    "category": panel.category,
                    "is_featured": True,
                    "is_private": False,
                }
                
                panel_response = self.client.table("panels").insert(panel_data).execute()
                if not panel_response.data:
                    print(f"   ⚠️  Failed to insert panel: {panel.title}")
                    continue
                
                panel_id = panel_response.data[0]['id']
                
                # Insert panel-themes
                for theme_id in panel.theme_ids:
                    self.client.table("panel_themes").insert({
                        "panel_id": panel_id,
                        "theme_id": theme_id
                    }).execute()
                
                # Insert panel-guests
                for idx, guest_id in enumerate(panel.guest_ids):
                    guest_name = guest_name_map.get(guest_id, guest_id.replace("-", " ").title())
                    self.client.table("panel_guests").insert({
                        "panel_id": panel_id,
                        "guest_id": guest_id,
                        "guest_name": guest_name,
                        "display_order": idx
                    }).execute()
                
                saved_count += 1
                print(f"   ✅ Saved: {panel.title}")
                
            except Exception as e:
                print(f"   ⚠️  Error saving panel {panel.title}: {e}")
                continue
        
        print(f"\n   Saved {saved_count}/{len(panels)} panels")
    
    def _load_episode_metadata(self) -> List[Dict]:
        """Load episode metadata from Supabase or parse from transcripts."""
        # Try to load from episodes table first
        try:
            response = self.client.table("episodes").select("*").execute()
            if response.data:
                return response.data
        except:
            pass
        
        # If not available, we'll build guest names from guest_ids
        return []
    
    def _build_guest_name_map(self, episode_metadata: List[Dict]) -> Dict[str, str]:
        """Build map from guest_id to guest_name."""
        name_map = {}
        
        # From episode metadata
        for episode in episode_metadata:
            guest_id = episode.get('guest_id', '')
            guest_name = episode.get('guest_name', '')
            if guest_id and guest_name:
                name_map[guest_id] = guest_name
        
        # Fallback: convert guest_id to name
        # This will be used for guests not in episodes table
        return name_map


def main():
    """Main entry point."""
    import argparse
    
    parser = argparse.ArgumentParser(description="Generate panels from themes")
    parser.add_argument("--use-supabase", action="store_true", help="Use Supabase for storage")
    parser.add_argument("--min-guests", type=int, default=3, help="Minimum guests per panel")
    parser.add_argument("--max-guests", type=int, default=10, help="Maximum guests per panel")
    args = parser.parse_args()
    
    if not args.use_supabase:
        print("❌ This script requires --use-supabase")
        return
    
    # Initialize Supabase store
    supabase_store = SupabaseStore()
    
    # Generate panels
    generator = PanelGenerator(supabase_store)
    panels = generator.generate_panels(
        min_guests_per_panel=args.min_guests,
        max_guests_per_panel=args.max_guests
    )
    
    # Save panels
    generator.save_panels(panels)
    
    print("\n✅ Panel generation complete!")
    print(f"   Generated {len(panels)} panels")


if __name__ == "__main__":
    main()

