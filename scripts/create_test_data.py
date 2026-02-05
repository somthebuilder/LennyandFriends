#!/usr/bin/env python3
"""
Create test data for quick testing of the RAG system.
Generates a few fake episodes with realistic content.
"""
import sys
from pathlib import Path
import yaml

# Add src to path
sys.path.insert(0, str(Path(__file__).parent.parent))

# Create test episodes directory
test_episodes_dir = Path("test_episodes")
test_episodes_dir.mkdir(exist_ok=True)

# Test episodes data
test_episodes = [
    {
        "episode_id": "test-guest-1",
        "guest": "Sarah Chen",
        "title": "Building Great Products: A Product Manager's Guide",
        "description": "Sarah shares her experience building products at top tech companies.",
        "content": """Lenny (00:00:00): Welcome to the podcast, Sarah! Thanks for joining us.

Sarah Chen (00:00:05): Thanks for having me, Lenny!

Lenny (00:00:10): So, let's start with the basics. How do you approach building a great product?

Sarah Chen (00:00:15): Well, I think the key is really understanding your users. You need to spend time with them, understand their pain points, and build something that truly solves their problems. Too many product managers jump straight into building features without really understanding what users actually need.

Lenny (00:00:45): That makes sense. Can you give us an example?

Sarah Chen (00:00:50): Sure! When I was at my previous company, we were building a dashboard feature. Instead of just building what we thought users wanted, we spent two weeks talking to 20 different users. We discovered that what they really needed wasn't more charts, but better ways to export and share data. So we pivoted and built export functionality first, and it was a huge hit.

Lenny (00:01:20): That's a great example. What about prioritization? How do you decide what to build next?

Sarah Chen (00:01:25): I use a framework I call "Impact vs Effort". For each potential feature, I score it on impact to users and effort to build. High impact, low effort features are obvious wins. But I also look at strategic alignment - does this move us toward our long-term vision? Sometimes you need to invest in high effort features that are strategically important.

Lenny (00:02:00): How do you measure success?

Sarah Chen (00:02:05): I look at a combination of metrics. User engagement is key - are people actually using the feature? But also business metrics like retention and revenue. The most important thing is to set clear success criteria before you start building, so you know what you're optimizing for."""
    },
    {
        "episode_id": "test-guest-2",
        "guest": "Michael Rodriguez",
        "title": "Growth Strategies for SaaS Companies",
        "description": "Michael discusses proven growth strategies for scaling SaaS businesses.",
        "content": """Lenny (00:00:00): Michael, welcome! You've helped scale several SaaS companies. What's your secret?

Michael Rodriguez (00:00:05): Thanks Lenny! I think the biggest mistake I see is companies trying to grow too fast without a solid foundation.

Lenny (00:00:15): What do you mean by foundation?

Michael Rodriguez (00:00:20): Product-market fit, first of all. You need to have a product that people actually want and are willing to pay for. Then you need systems in place - good onboarding, customer support, retention strategies. Too many companies focus on acquisition before they've figured out retention.

Lenny (00:00:45): So what's your approach to growth?

Michael Rodriguez (00:00:50): I focus on three pillars: acquisition, activation, and retention. For acquisition, I like to start with content marketing and SEO. It's slower but more sustainable than paid ads. For activation, we make sure new users see value within their first session. And for retention, we have automated email sequences, in-app messaging, and regular check-ins with customers.

Lenny (00:01:30): What about pricing? How do you think about pricing strategy?

Michael Rodriguez (00:01:35): Pricing is critical. I've seen companies leave millions on the table because they priced too low. The key is understanding the value you provide. If you're saving a customer 10 hours a week, that's worth a lot. Don't be afraid to charge what you're worth. But also, make sure you have a clear upgrade path. Start with a low entry point, then show the value of premium features."""
    },
    {
        "episode_id": "test-guest-3",
        "guest": "Emily Watson",
        "title": "Leadership Lessons from Building Teams",
        "description": "Emily shares insights on building and leading high-performing teams.",
        "content": """Lenny (00:00:00): Emily, you've built some incredible teams. What's your philosophy on leadership?

Emily Watson (00:00:05): Hi Lenny! I think great leadership starts with trust. You need to trust your team, and they need to trust you.

Lenny (00:00:15): How do you build that trust?

Emily Watson (00:00:20): Transparency is huge. I share context about why decisions are made, what challenges we're facing, and where we're headed. I also make sure to give credit where it's due and take responsibility when things go wrong. And I try to be consistent - people need to know what to expect from you.

Lenny (00:00:50): What about hiring? How do you identify great people?

Emily Watson (00:00:55): I look for three things: competence, character, and culture fit. Competence is obvious - can they do the job? Character matters because I want people who will do the right thing even when no one is watching. And culture fit doesn't mean everyone thinks the same - it means they share our values and can work well with the team.

Lenny (00:01:30): How do you handle difficult situations or conflicts?

Emily Watson (00:01:35): I address them head-on, but with empathy. I try to understand all perspectives before making a decision. Sometimes that means having difficult conversations, but avoiding them usually makes things worse. I also try to focus on the problem, not the person, and work together to find a solution."""
    }
]

# Create episode directories and transcript files
for episode in test_episodes:
    episode_dir = test_episodes_dir / episode["episode_id"]
    episode_dir.mkdir(exist_ok=True)
    
    # Create frontmatter
    frontmatter = {
        "guest": episode["guest"],
        "title": episode["title"],
        "youtube_url": f"https://youtube.com/watch?v=test{episode['episode_id']}",
        "video_id": f"test{episode['episode_id']}",
        "publish_date": "2024-01-15",
        "description": episode["description"],
        "duration_seconds": 600.0,
        "duration": "10:00"
    }
    
    # Write transcript file
    transcript_path = episode_dir / "transcript.md"
    with open(transcript_path, "w") as f:
        f.write("---\n")
        f.write(yaml.dump(frontmatter, default_flow_style=False))
        f.write("---\n\n")
        f.write(episode["content"])
    
    print(f"✅ Created test episode: {episode['episode_id']} - {episode['title']}")

print(f"\n✅ Created {len(test_episodes)} test episodes in {test_episodes_dir}/")
print("\nNow you can build the knowledge base with:")
print(f"  python3 scripts/build_knowledge_base.py --episodes-dir test_episodes --output-dir test_knowledge_base")

