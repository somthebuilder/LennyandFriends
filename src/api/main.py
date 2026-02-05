"""
FastAPI server for Lenny and Friends.
Provides endpoints for group chat and split chat interactions.
"""
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Optional, Dict
import json
import sys
from pathlib import Path

# Add src to path
sys.path.insert(0, str(Path(__file__).parent.parent.parent))

from src.runtime.intelligence import RuntimeIntelligence
from src.runtime.rag_engine import RAGEngine
from src.runtime.lenny_moderator import LennyModerator
from src.knowledge.vector_store import VectorStore
from src.knowledge.theme_clusterer import Theme
import numpy as np
import pickle
import json as json_lib


# Load knowledge base (use test_knowledge_base if it exists, otherwise use knowledge_base)
import os
if Path("test_knowledge_base").exists():
    KNOWLEDGE_BASE_DIR = Path("test_knowledge_base")
    print("✅ Using test knowledge base for testing")
else:
    KNOWLEDGE_BASE_DIR = Path("knowledge_base")

# Load themes
themes_data = json_lib.load(open(KNOWLEDGE_BASE_DIR / "themes.json"))
themes = []
for theme_data in themes_data:
    # Load centroid
    with open(KNOWLEDGE_BASE_DIR / "theme_centroids.pkl", "rb") as f:
        centroids = pickle.load(f)
    
    theme = Theme(
        theme_id=theme_data["theme_id"],
        label=theme_data["label"],
        centroid_embedding=centroids[theme_data["theme_id"]],
        example_phrases=theme_data["example_phrases"],
        chunk_ids=theme_data["chunk_ids"],
        guest_ids=theme_data["guest_ids"]
    )
    themes.append(theme)

# Load guest strengths
with open(KNOWLEDGE_BASE_DIR / "guest_theme_strengths.json", "r") as f:
    guest_theme_strengths = json_lib.load(f)

# Load vector store
vector_store = VectorStore(index_path=str(KNOWLEDGE_BASE_DIR / "vector_store"))

# Initialize runtime components
runtime_intelligence = RuntimeIntelligence(
    themes=themes,
    guest_theme_strengths=guest_theme_strengths,
    vector_store=vector_store
)

rag_engine = RAGEngine(vector_store=vector_store, provider="gemini")
lenny_moderator = LennyModerator(provider="gemini")

# FastAPI app
app = FastAPI(title="Lenny and Friends API")

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# Request/Response models
class UserContext(BaseModel):
    role: Optional[str] = None
    company: Optional[str] = None
    interests: Optional[str] = None
    goals: Optional[str] = None

class QueryRequest(BaseModel):
    query: str
    user_name: str
    user_context: Optional[UserContext] = None
    clarification: Optional[str] = None  # Response to Lenny's clarification


class QueryResponse(BaseModel):
    needs_clarification: bool
    clarification_questions: Optional[List[str]] = None
    guest_responses: Optional[List[Dict]] = None
    active_themes: Optional[List[Dict]] = None


class ValidationRequest(BaseModel):
    name: str
    role: Optional[str] = None
    company: Optional[str] = None
    interests: Optional[str] = None
    goals: Optional[str] = None


class ValidationResponse(BaseModel):
    is_valid: bool
    confidence: float  # 0-1
    nudge: Optional[str] = None  # Friendly nudge if something seems off


# In-memory sessions (supports concurrent users)
# Key: session_id (user_name + timestamp), Value: session data
sessions: Dict[str, Dict] = {}


@app.get("/")
async def root():
    return {
        "message": "Lenny and Friends API",
        "status": "running"
    }


@app.get("/health")
async def health_check():
    """Health check endpoint for frontend status monitoring."""
    # Check if knowledge base is loaded
    kb_ready = KNOWLEDGE_BASE_DIR.exists() and (KNOWLEDGE_BASE_DIR / "themes.json").exists()
    
    return {
        "status": "ok" if kb_ready else "building",
        "knowledge_base_ready": kb_ready,
        "message": "Knowledge base ready" if kb_ready else "Knowledge base is still being built"
    }


@app.post("/query", response_model=QueryResponse)
async def handle_query(request: QueryRequest):
    """
    Main query endpoint.
    
    Flow:
    1. Store/update user context in session
    2. Match themes (intent detection)
    3. Check for ambiguity
    4. If ambiguous, return clarification questions
    5. If clear (or after clarification), select guests and generate responses
    """
    import time
    
    # Create or update session for concurrent user support
    session_id = f"{request.user_name}_{int(time.time())}"
    if request.user_context:
        sessions[session_id] = {
            "user_name": request.user_name,
            "user_context": request.user_context.dict() if request.user_context else None,
            "last_activity": time.time()
        }
    
    query = request.query
    
    # Build context-aware query if user context is available
    context_prefix = ""
    if request.user_context:
        context_parts = []
        if request.user_context.role:
            context_parts.append(f"Role: {request.user_context.role}")
        if request.user_context.company:
            context_parts.append(f"Company: {request.user_context.company}")
        if request.user_context.interests:
            context_parts.append(f"Interests: {request.user_context.interests}")
        if request.user_context.goals:
            context_parts.append(f"Goals: {request.user_context.goals}")
        
        if context_parts:
            context_prefix = f"User context: {', '.join(context_parts)}. "
    
    # If this is a clarification response, combine with original query
    if request.clarification:
        query = f"{query} {request.clarification}"
    
    # Prepend context to query for better understanding
    contextual_query = f"{context_prefix}{query}" if context_prefix else query
    
    # Step 1: Match themes (use contextual query for better matching)
    active_themes = runtime_intelligence.match_themes(contextual_query, top_n=5)
    
    # Step 2: Check ambiguity
    is_ambiguous, reason = runtime_intelligence.check_ambiguity(active_themes)
    
    if is_ambiguous:
        # Generate clarification questions (use original query for clarity)
        # Pass user context to help generate more relevant questions
        user_context_str = None
        if request.user_context:
            context_parts = []
            if request.user_context.role:
                context_parts.append(f"Role: {request.user_context.role}")
            if request.user_context.company:
                context_parts.append(f"Company: {request.user_context.company}")
            if context_parts:
                user_context_str = ", ".join(context_parts)
        
        questions = lenny_moderator.generate_clarification_questions(
            user_query=request.query,
            active_themes=active_themes,
            ambiguity_reason=reason,
            user_context=user_context_str
        )
        
        return QueryResponse(
            needs_clarification=True,
            clarification_questions=questions,
            active_themes=[
                {"theme_id": t.theme_id, "score": t.score}
                for t in active_themes
            ]
        )
    
    # Step 3: Select guests
    guest_scores = runtime_intelligence.select_guests(
        active_themes=active_themes,
        max_guests=10
    )
    
    # Step 4: Generate responses
    guest_configs = [
        {"guest_id": gs.guest_id, "guest_name": gs.guest_name}
        for gs in guest_scores
    ]
    
    theme_ids = [t.theme_id for t in active_themes]
    responses = rag_engine.generate_batch_responses(
        query=contextual_query,  # Use contextual query for better responses
        guest_configs=guest_configs,
        theme_ids=theme_ids
    )
    
    # Format responses
    guest_responses = [
        {
            "guest_id": r.guest_id,
            "guest_name": r.guest_name,
            "response": r.response_text,
            "confidence": r.confidence,
            "source_chunks": r.source_chunks
        }
        for r in responses
    ]
    
    return QueryResponse(
        needs_clarification=False,
        guest_responses=guest_responses,
        active_themes=[
            {"theme_id": t.theme_id, "score": t.score}
            for t in active_themes
        ]
    )


class SplitChatRequest(BaseModel):
    query: str
    guest_id: str
    original_query: Optional[str] = None
    previous_response: Optional[str] = None
    user_context: Optional[UserContext] = None

@app.post("/split-chat")
async def handle_split_chat(request: SplitChatRequest):
    """
    Split chat endpoint - 1:1 conversation with a specific guest.
    
    Args:
        query: Current question
        guest_id: Guest to talk to
        original_query: Original question from group chat
        previous_response: Guest's previous response
        user_context: Optional user context
    """
    # Build context
    context_query = request.query
    if request.original_query and request.previous_response:
        context_query = f"Original question: {request.original_query}\n\nPrevious response: {request.previous_response}\n\nFollow-up: {request.query}"
    
    # Add user context if available
    if request.user_context:
        context_parts = []
        if request.user_context.role:
            context_parts.append(f"Role: {request.user_context.role}")
        if request.user_context.company:
            context_parts.append(f"Company: {request.user_context.company}")
        if request.user_context.interests:
            context_parts.append(f"Interests: {request.user_context.interests}")
        if request.user_context.goals:
            context_parts.append(f"Goals: {request.user_context.goals}")
        
        if context_parts:
            context_prefix = f"User context: {', '.join(context_parts)}. "
            context_query = f"{context_prefix}{context_query}"
    
    # Get guest name (would need a mapping)
    guest_name = request.guest_id.replace("-", " ").title()
    
    # Generate response (no theme filtering in split chat, just guest filtering)
    response = rag_engine.generate_guest_response(
        query=context_query,
        guest_id=request.guest_id,
        guest_name=guest_name,
        theme_ids=None  # No theme filter in split chat
    )
    
    return {
        "guest_id": response.guest_id,
        "guest_name": response.guest_name,
        "response": response.response_text,
        "confidence": response.confidence
    }


@app.post("/validate-user-input", response_model=ValidationResponse)
async def validate_user_input(request: ValidationRequest):
    """
    Validate user input using AI to check if information seems genuine.
    Returns validation result with optional friendly nudge.
    """
    # Build prompt for validation
    prompt = f"""You are validating user registration information for a professional podcast discussion platform.

User provided:
- Name: {request.name}
- Role: {request.role if request.role else 'Not provided'}
- Company: {request.company if request.company else 'Not provided'}
- Interests: {request.interests if request.interests else 'Not provided'}
- Goals: {request.goals if request.goals else 'Not provided'}

Your task: Determine if this information seems genuine and professional.

Consider:
- Names that are clearly fake (e.g., "Test User", "John Doe", "asdf", single letters, profanity)
- Roles that don't make sense or are too vague
- Companies that seem made up or are clearly fake
- Interests that are too generic or nonsensical
- Any combination that suggests testing or trolling

Be lenient - only flag obvious issues. Real people might have unusual names or work at small companies.

If the information seems fake or suspicious, provide a brief, friendly, warm, and persuasive nudge that:
- Uses a conversational, encouraging tone
- Is concise (1-2 sentences max, under 100 characters ideally)
- Explains the benefit briefly (better responses, personalized experience)
- Makes the user feel valued
- Uses friendly phrases like "We'd love to...", "It helps us...", "To get you..."

Examples of good brief nudges:
- "We'd love to know your real name to personalize your experience! ✨"
- "A bit more detail about your role helps us give better responses."
- "Sharing your interests helps us match you with relevant conversations!"

Respond in this exact format:
VALID: true/false
CONFIDENCE: 0.0-1.0 (how confident you are)
NUDGE: [if invalid, provide a warm, friendly, persuasive nudge - otherwise leave empty]"""

    try:
        # Use the same provider as lenny_moderator
        if lenny_moderator.provider == "gemini":
            response = lenny_moderator.client.models.generate_content(
                model=lenny_moderator.model,
                contents=prompt
            )
            content = response.text
        elif lenny_moderator.provider == "openai":
            response = lenny_moderator.client.chat.completions.create(
                model=lenny_moderator.model,
                max_tokens=150,
                messages=[{"role": "user", "content": prompt}]
            )
            content = response.choices[0].message.content
        elif lenny_moderator.provider == "anthropic":
            response = lenny_moderator.client.messages.create(
                model=lenny_moderator.model,
                max_tokens=150,
                messages=[{"role": "user", "content": prompt}]
            )
            content = response.content[0].text
        else:
            # Fallback - assume valid
            return ValidationResponse(
                is_valid=True,
                confidence=0.5,
                nudge=None
            )
        
        # Parse response
        is_valid = True
        confidence = 0.8
        nudge = None
        
        lines = content.split("\n")
        for line in lines:
            line = line.strip()
            if line.startswith("VALID:"):
                val = line.split(":", 1)[1].strip().lower()
                is_valid = val == "true"
            elif line.startswith("CONFIDENCE:"):
                try:
                    conf_str = line.split(":", 1)[1].strip()
                    confidence = float(conf_str)
                except:
                    pass
            elif line.startswith("NUDGE:"):
                nudge_str = line.split(":", 1)[1].strip()
                if nudge_str and nudge_str.lower() != "none" and nudge_str.lower() != "null":
                    nudge = nudge_str
        
        return ValidationResponse(
            is_valid=is_valid,
            confidence=confidence,
            nudge=nudge
        )
    except Exception as e:
        print(f"Error validating user input: {e}")
        # On error, assume valid (don't block users)
        return ValidationResponse(
            is_valid=True,
            confidence=0.5,
            nudge=None
        )


@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    """WebSocket endpoint for streaming responses."""
    await websocket.accept()
    
    try:
        while True:
            data = await websocket.receive_text()
            request = json.loads(data)
            
            # Handle query
            query_request = QueryRequest(**request)
            response = await handle_query(query_request)
            
            # Send response
            await websocket.send_json(response.dict())
            
    except WebSocketDisconnect:
        pass


# Podcast Request endpoint
class PodcastRequest(BaseModel):
    # New format fields
    podcast_name: Optional[str] = None
    podcast_link: Optional[str] = None
    questions: Optional[str] = None
    note: Optional[str] = None
    email: Optional[str] = None
    # Legacy format fields (for backward compatibility)
    name: Optional[str] = None
    request_type: Optional[str] = None
    youtube_url: Optional[str] = None
    description: Optional[str] = None

@app.post("/podcast-request")
async def submit_podcast_request(request: PodcastRequest):
    """
    Submit a request for a new podcast.
    Supports both new format (podcast_name, podcast_link, questions, email) and legacy format.
    """
    import re
    from datetime import datetime
    from supabase import create_client, Client
    
    # Determine if this is new format or legacy format
    is_new_format = request.podcast_name is not None or request.podcast_link is not None or request.email is not None
    
    if is_new_format:
        # New format validation
        if not request.podcast_name or not request.podcast_name.strip():
            raise HTTPException(status_code=400, detail="Podcast name is required")
        if not request.podcast_link or not request.podcast_link.strip():
            raise HTTPException(status_code=400, detail="Podcast link is required")
        if not request.questions or not request.questions.strip():
            raise HTTPException(status_code=400, detail="Questions field is required")
        if not request.email or not request.email.strip():
            raise HTTPException(status_code=400, detail="Email is required")
        
        # Validate email
        email_pattern = r'^[^\s@]+@[^\s@]+\.[^\s@]+$'
        if not re.match(email_pattern, request.email.strip()):
            raise HTTPException(status_code=400, detail="Invalid email format")
        
        # Validate podcast link (Spotify, Apple, RSS, or YouTube)
        link = request.podcast_link.strip()
        link_patterns = [
            r'^https?://(open\.)?spotify\.com/.+$',
            r'^https?://podcasts\.apple\.com/.+$',
            r'^https?://.+\.rss$',
            r'^https?://.+\.xml$',
            r'^https?://(www\.)?(youtube\.com|youtu\.be)/.+$',
        ]
        
        is_valid_link = any(re.match(pattern, link, re.IGNORECASE) for pattern in link_patterns)
        if not is_valid_link:
            raise HTTPException(status_code=400, detail="Invalid podcast link. Must be Spotify, Apple, RSS, or YouTube URL")
        
        # Security: Check for malicious patterns
        malicious_patterns = [
            r'javascript:',
            r'data:',
            r'vbscript:',
            r'on\w+\s*=',
        ]
        
        has_malicious = any(re.search(pattern, link, re.IGNORECASE) for pattern in malicious_patterns)
        if has_malicious:
            raise HTTPException(status_code=400, detail="Invalid URL format")
        
        # Prepare data for new format
        data_to_insert = {
            "podcast_name": request.podcast_name.strip(),
            "podcast_link": link,
            "questions": request.questions.strip(),
            "note": request.note.strip() if request.note else None,
            "email": request.email.strip(),
            "status": "pending",
            "created_at": datetime.utcnow().isoformat()
        }
    else:
        # Legacy format validation
        if request.request_type and request.request_type not in ['guest', 'topic']:
            raise HTTPException(status_code=400, detail="request_type must be 'guest' or 'topic'")
        
        # Validate YouTube URL if provided
        url = request.youtube_url.strip() if request.youtube_url else None
        if url:
            youtube_patterns = [
                r'^https?://(www\.)?(youtube\.com|youtu\.be)/.+$',
                r'^https?://youtube\.com/watch\?v=[\w-]+',
                r'^https?://youtu\.be/[\w-]+',
                r'^https?://www\.youtube\.com/embed/[\w-]+',
                r'^https?://www\.youtube\.com/v/[\w-]+',
            ]
            
            is_valid = any(re.match(pattern, url) for pattern in youtube_patterns)
            if not is_valid:
                raise HTTPException(status_code=400, detail="Invalid YouTube URL. Must be from youtube.com or youtu.be")
            
            malicious_patterns = [
                r'javascript:',
                r'data:',
                r'vbscript:',
                r'on\w+\s*=',
            ]
            
            has_malicious = any(re.search(pattern, url, re.IGNORECASE) for pattern in malicious_patterns)
            if has_malicious:
                raise HTTPException(status_code=400, detail="Invalid URL format")
        
        # Prepare data for legacy format
        data_to_insert = {
            "name": request.name if request.name else None,
            "request_type": request.request_type,
            "youtube_url": url if url else None,
            "description": request.description if request.description else None,
            "status": "pending",
            "created_at": datetime.utcnow().isoformat()
        }
    
    # Save to Supabase
    try:
        supabase_url = os.getenv("SUPABASE_URL", "https://rhzpjvuutpjtdsbnskdy.supabase.co")
        supabase_key = os.getenv("SUPABASE_KEY", os.getenv("SUPABASE_PUBLISHABLE_KEY", "sb_publishable_2yKt6iNyAT4XEizznV8_1A_QlDKGoBo"))
        supabase: Client = create_client(supabase_url, supabase_key)
        
        # Insert into podcast_requests table
        result = supabase.table("podcast_requests").insert(data_to_insert).execute()
        
        return {"success": True, "message": "Request submitted successfully"}
        
    except Exception as e:
        print(f"Error saving podcast request: {e}")
        raise HTTPException(status_code=500, detail="Error saving request. Please try again.")


class PodcastLike(BaseModel):
    podcast_name: str
    action: str  # 'like' or 'unlike'

@app.get("/podcasts")
async def get_podcasts():
    """
    Get all active podcasts with their like counts.
    Returns the curated list shown in "Other Podcasts requests" section.
    """
    from supabase import create_client, Client
    
    try:
        # Initialize Supabase client
        supabase_url = os.getenv("SUPABASE_URL")
        supabase_key = os.getenv("SUPABASE_KEY")
        
        if not supabase_url or not supabase_key:
            raise HTTPException(status_code=500, detail="Database configuration error")
        
        supabase: Client = create_client(supabase_url, supabase_key)
        
        # Fetch all active podcasts ordered by display_order
        result = supabase.table("podcasts").select("*").eq("status", "active").order("display_order").execute()
        
        if not result.data:
            return []
        
        # Transform data for frontend
        podcasts = [
            {
                "id": podcast["id"],
                "name": podcast["name"],
                "description": podcast["description"],
                "category": podcast.get("category"),
                "like_count": podcast["like_count"],
                "podcast_link": podcast.get("podcast_link")
            }
            for podcast in result.data
        ]
        
        return podcasts
    
    except Exception as e:
        print(f"Error fetching podcasts: {e}")
        raise HTTPException(status_code=500, detail="Error fetching podcasts")

@app.post("/podcast-like")
async def podcast_like(request: PodcastLike):
    """
    Like or unlike a podcast.
    Uses the podcast name to update the like count in the podcasts table.
    """
    from datetime import datetime
    from supabase import create_client, Client
    
    if request.action not in ['like', 'unlike']:
        raise HTTPException(status_code=400, detail="Action must be 'like' or 'unlike'")
    
    if not request.podcast_name or not request.podcast_name.strip():
        raise HTTPException(status_code=400, detail="Podcast name is required")
    
    try:
        # Initialize Supabase client
        supabase_url = os.getenv("SUPABASE_URL")
        supabase_key = os.getenv("SUPABASE_KEY")
        
        if not supabase_url or not supabase_key:
            raise HTTPException(status_code=500, detail="Database configuration error")
        
        supabase: Client = create_client(supabase_url, supabase_key)
        
        # Get current podcast
        result = supabase.table("podcasts").select("*").eq("name", request.podcast_name.strip()).execute()
        
        if not result.data or len(result.data) == 0:
            raise HTTPException(status_code=404, detail="Podcast not found")
        
        current_podcast = result.data[0]
        current_likes = current_podcast.get("like_count", 0)
        
        # Calculate new like count
        if request.action == 'like':
            new_count = current_likes + 1
        else:  # unlike
            new_count = max(0, current_likes - 1)
        
        # Update the like count
        supabase.table("podcasts").update({
            "like_count": new_count,
            "updated_at": datetime.utcnow().isoformat()
        }).eq("name", request.podcast_name.strip()).execute()
        
        return {
            "success": True, 
            "message": f"Successfully {request.action}d {request.podcast_name}",
            "new_like_count": new_count
        }
    
    except HTTPException:
        raise
    except Exception as e:
        print(f"Error updating podcast like: {e}")
        raise HTTPException(status_code=500, detail="Error updating like. Please try again.")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)

