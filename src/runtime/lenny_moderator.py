"""
Lenny Moderator - Handles clarification mode for ambiguous queries.
Lenny is a moderator, not an oracle. He clarifies ambiguity.
"""
import os
from typing import Optional
from dotenv import load_dotenv

# Try to import new Gemini API first, fallback to OpenAI, then Anthropic
try:
    from google import genai
    GEMINI_AVAILABLE = True
except ImportError:
    GEMINI_AVAILABLE = False

try:
    from openai import OpenAI
    OPENAI_AVAILABLE = True
except ImportError:
    OPENAI_AVAILABLE = False

try:
    from anthropic import Anthropic
    ANTHROPIC_AVAILABLE = True
except ImportError:
    ANTHROPIC_AVAILABLE = False

load_dotenv()


class LennyModerator:
    """
    Lenny's moderation system.
    
    Responsibilities:
    - Detect ambiguous queries
    - Ask 2-3 sharp clarifying questions
    - Narrow the theme space
    - Do NOT answer yet
    """
    
    def __init__(self, model: Optional[str] = None, provider: str = "gemini"):
        """
        Initialize Lenny moderator.
        
        Args:
            model: Model name (auto-selected if None)
            provider: "gemini", "openai", or "anthropic"
        """
        self.provider = provider.lower()
        
        # Initialize client based on provider
        if self.provider == "gemini" and GEMINI_AVAILABLE:
            api_key = os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY")
            if not api_key:
                raise ValueError("GEMINI_API_KEY or GOOGLE_API_KEY not found in environment")
            self.client = genai.Client(api_key=api_key)
            self.model = model or "models/gemini-2.5-flash"
        elif self.provider == "openai" and OPENAI_AVAILABLE:
            api_key = os.getenv("OPENAI_API_KEY")
            if not api_key:
                raise ValueError("OPENAI_API_KEY not found in environment")
            self.client = OpenAI(api_key=api_key)
            self.model = model or "gpt-4o-mini"
        elif self.provider == "anthropic" and ANTHROPIC_AVAILABLE:
            api_key = os.getenv("ANTHROPIC_API_KEY")
            if not api_key:
                raise ValueError("ANTHROPIC_API_KEY not found in environment")
            self.client = Anthropic(api_key=api_key)
            self.model = model or "claude-3-5-sonnet-20241022"
        else:
            # Auto-detect
            if GEMINI_AVAILABLE and (os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY")):
                api_key = os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY")
                self.client = genai.Client(api_key=api_key)
                self.model = model or "models/gemini-2.5-flash"
                self.provider = "gemini"
            elif OPENAI_AVAILABLE and os.getenv("OPENAI_API_KEY"):
                self.client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))
                self.model = model or "gpt-4o-mini"
                self.provider = "openai"
            elif ANTHROPIC_AVAILABLE and os.getenv("ANTHROPIC_API_KEY"):
                self.client = Anthropic(api_key=os.getenv("ANTHROPIC_API_KEY"))
                self.model = model or "claude-3-5-sonnet-20241022"
                self.provider = "anthropic"
            else:
                raise ValueError("No API key found. Set GEMINI_API_KEY, OPENAI_API_KEY, or ANTHROPIC_API_KEY")
    
    def generate_clarification_questions(
        self,
        user_query: str,
        active_themes: list,
        ambiguity_reason: str,
        user_context: Optional[str] = None
    ) -> list[str]:
        """
        Generate 2-3 sharp clarifying questions.
        
        Args:
            user_query: Original user query
            active_themes: List of matched themes (may be ambiguous)
            ambiguity_reason: Why the query is ambiguous
            user_context: Optional user context (role, company, etc.)
            
        Returns:
            List of clarifying questions
        """
        theme_labels = [f"T{theme.theme_id}" for theme in active_themes[:3]]
        
        context_note = ""
        if user_context:
            context_note = f"\n\nUser context: {user_context}. Use this context to ask more relevant questions, but don't assume too much - still clarify when needed."
        
        prompt = f"""You are Lenny Rachitsky, host of Lenny's Podcast.

A user asked: "{user_query}"

The query is ambiguous because: {ambiguity_reason}

The system matched these potential themes: {', '.join(theme_labels)}{context_note}

Your role is to ask 2-3 sharp, focused clarifying questions to narrow down what the user is really asking about.

Guidelines:
- Ask questions that help distinguish between the matched themes
- Be specific and actionable
- Don't answer the question yet - just clarify
- Keep questions concise (one sentence each)
- Focus on perspective, context, or scope
- If user context is provided, use it to ask more relevant questions, but don't over-assume

Example good questions:
- "Are you asking from a founder's perspective or as an IC?"
- "Is this about long-term decisions or short-term execution tradeoffs?"
- "Are you looking for tactical advice or strategic frameworks?"

Generate 2-3 clarifying questions:"""
        
        try:
            if self.provider == "gemini":
                response = self.client.models.generate_content(
                    model=self.model,
                    contents=prompt
                )
                content = response.text
            elif self.provider == "openai":
                response = self.client.chat.completions.create(
                    model=self.model,
                    max_tokens=200,
                    messages=[{"role": "user", "content": prompt}]
                )
                content = response.choices[0].message.content
            elif self.provider == "anthropic":
                response = self.client.messages.create(
                    model=self.model,
                    max_tokens=200,
                    messages=[{"role": "user", "content": prompt}]
                )
                content = response.content[0].text
            else:
                raise ValueError(f"Unknown provider: {self.provider}")
            
            # Parse questions (one per line)
            questions = [q.strip() for q in content.split("\n") if q.strip() and q.strip().startswith(("-", "•", "1.", "2.", "3."))]
            
            # Clean up question markers
            cleaned_questions = []
            for q in questions:
                # Remove markers
                q = q.lstrip("- •1234567890. ")
                if q:
                    cleaned_questions.append(q)
            
            # If parsing failed, try to extract questions another way
            if not cleaned_questions:
                # Split by sentence and look for question marks
                sentences = content.split(".")
                for sentence in sentences:
                    sentence = sentence.strip()
                    if "?" in sentence:
                        cleaned_questions.append(sentence)
            
            # Return 2-3 questions
            return cleaned_questions[:3]
            
        except Exception as e:
            print(f"Error generating clarification questions: {e}")
            # Fallback questions
            return [
                "Could you provide a bit more context about what you're trying to accomplish?",
                "Are you asking from a specific perspective (founder, IC, manager, etc.)?"
            ]
    
    def should_continue_after_clarification(
        self,
        original_query: str,
        clarification_response: str
    ) -> tuple[bool, str]:
        """
        Determine if we should proceed after user provides clarification.
        
        Args:
            original_query: Original ambiguous query
            clarification_response: User's response to clarification questions
            
        Returns:
            (should_continue, reason)
        """
        # Simple heuristic: if user provided substantial response, continue
        if len(clarification_response.split()) < 5:
            return False, "Clarification response too short"
        
        return True, "Ready to proceed"


if __name__ == "__main__":
    # Test moderator
    moderator = LennyModerator()
    
    from intelligence import ActiveTheme
    
    test_themes = [
        ActiveTheme(theme_id="T17", score=0.55),
        ActiveTheme(theme_id="T09", score=0.52)
    ]
    
    questions = moderator.generate_clarification_questions(
        user_query="How should I make decisions?",
        active_themes=test_themes,
        ambiguity_reason="Top 2 themes too close"
    )
    
    print("Clarification questions:")
    for i, q in enumerate(questions, 1):
        print(f"{i}. {q}")

