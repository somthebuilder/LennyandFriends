-- Espresso RAG Runtime Tables
-- Phase 1 foundational schema for concepts, insights, and chat runtime.
-- Also hardens chunk retrieval with a segment-type allowlist.

-- Ensure pgcrypto is available for gen_random_uuid()
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ------------------------------------------------------------
-- 1) Concepts
-- ------------------------------------------------------------

CREATE TABLE IF NOT EXISTS concepts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    podcast_id UUID NOT NULL REFERENCES podcasts(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    slug TEXT NOT NULL,
    summary TEXT,
    body TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'published' CHECK (status IN ('draft', 'published', 'archived')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (podcast_id, slug)
);

CREATE INDEX IF NOT EXISTS idx_concepts_podcast_id ON concepts(podcast_id);
CREATE INDEX IF NOT EXISTS idx_concepts_status ON concepts(status);

CREATE TABLE IF NOT EXISTS concept_references (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    concept_id UUID NOT NULL REFERENCES concepts(id) ON DELETE CASCADE,
    guest_id TEXT REFERENCES guests(id),
    episode_id TEXT REFERENCES episodes(id),
    quote TEXT,
    timestamp TEXT,
    display_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_concept_references_concept_id ON concept_references(concept_id);
CREATE INDEX IF NOT EXISTS idx_concept_references_episode_id ON concept_references(episode_id);

CREATE TABLE IF NOT EXISTS concept_chunks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    concept_id UUID NOT NULL REFERENCES concepts(id) ON DELETE CASCADE,
    chunk_id TEXT NOT NULL REFERENCES chunk_embeddings(chunk_id) ON DELETE CASCADE,
    relevance_score DOUBLE PRECISION,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (concept_id, chunk_id)
);

CREATE INDEX IF NOT EXISTS idx_concept_chunks_concept_id ON concept_chunks(concept_id);
CREATE INDEX IF NOT EXISTS idx_concept_chunks_chunk_id ON concept_chunks(chunk_id);

-- ------------------------------------------------------------
-- 2) Insights
-- ------------------------------------------------------------

CREATE TABLE IF NOT EXISTS insights (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    podcast_id UUID NOT NULL REFERENCES podcasts(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    slug TEXT NOT NULL,
    takeaway TEXT NOT NULL,
    signal TEXT NOT NULL CHECK (signal IN ('high_consensus', 'split_view', 'emerging')),
    guest_count INTEGER NOT NULL DEFAULT 0,
    episode_count INTEGER NOT NULL DEFAULT 0,
    explanation JSONB NOT NULL DEFAULT '[]'::jsonb,
    trend TEXT CHECK (trend IN ('stable', 'emerging', 'fading')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (podcast_id, slug)
);

CREATE INDEX IF NOT EXISTS idx_insights_podcast_id ON insights(podcast_id);
CREATE INDEX IF NOT EXISTS idx_insights_signal ON insights(signal);

CREATE TABLE IF NOT EXISTS insight_evidence (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    insight_id UUID NOT NULL REFERENCES insights(id) ON DELETE CASCADE,
    guest_id TEXT REFERENCES guests(id),
    episode_id TEXT REFERENCES episodes(id),
    quote TEXT,
    timestamp TEXT,
    episode_url TEXT,
    display_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_insight_evidence_insight_id ON insight_evidence(insight_id);
CREATE INDEX IF NOT EXISTS idx_insight_evidence_episode_id ON insight_evidence(episode_id);

-- ------------------------------------------------------------
-- 3) Chat session/message storage
-- ------------------------------------------------------------

CREATE TABLE IF NOT EXISTS chat_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    podcast_id UUID NOT NULL REFERENCES podcasts(id) ON DELETE CASCADE,
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    context_type TEXT NOT NULL DEFAULT 'general' CHECK (context_type IN ('general', 'insight', 'concept')),
    context_id UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_chat_sessions_podcast_id ON chat_sessions(podcast_id);
CREATE INDEX IF NOT EXISTS idx_chat_sessions_user_id ON chat_sessions(user_id);

CREATE TABLE IF NOT EXISTS chat_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID NOT NULL REFERENCES chat_sessions(id) ON DELETE CASCADE,
    role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
    content TEXT NOT NULL,
    citations JSONB NOT NULL DEFAULT '[]'::jsonb,
    token_usage JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_chat_messages_session_id ON chat_messages(session_id);
CREATE INDEX IF NOT EXISTS idx_chat_messages_created_at ON chat_messages(created_at);

-- ------------------------------------------------------------
-- 4) Updated-at trigger helper
-- ------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.espresso_set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_concepts_updated_at ON concepts;
CREATE TRIGGER trg_concepts_updated_at
BEFORE UPDATE ON concepts
FOR EACH ROW EXECUTE FUNCTION public.espresso_set_updated_at();

DROP TRIGGER IF EXISTS trg_insights_updated_at ON insights;
CREATE TRIGGER trg_insights_updated_at
BEFORE UPDATE ON insights
FOR EACH ROW EXECUTE FUNCTION public.espresso_set_updated_at();

DROP TRIGGER IF EXISTS trg_chat_sessions_updated_at ON chat_sessions;
CREATE TRIGGER trg_chat_sessions_updated_at
BEFORE UPDATE ON chat_sessions
FOR EACH ROW EXECUTE FUNCTION public.espresso_set_updated_at();

-- ------------------------------------------------------------
-- 5) RAG segment allowlist guardrail
-- ------------------------------------------------------------

ALTER TABLE chunk_embeddings
ADD COLUMN IF NOT EXISTS segment_type TEXT NOT NULL DEFAULT 'interview'
CHECK (segment_type IN ('intro', 'sponsor', 'interview', 'lightning_round', 'outro'));

CREATE INDEX IF NOT EXISTS idx_chunk_embeddings_segment_type ON chunk_embeddings(segment_type);

-- Recreate vector search function with segment allowlist and stable search_path.
DROP FUNCTION IF EXISTS public.match_chunks(vector(384), float, int, text, text);
DROP FUNCTION IF EXISTS public.match_chunks(vector(1536), float, int, text, text);
DROP FUNCTION IF EXISTS public.match_chunks(vector(1536), float, int, text, text, text[]);
CREATE OR REPLACE FUNCTION public.match_chunks(
    query_embedding vector(1536),
    match_threshold float DEFAULT 0.0,
    match_count int DEFAULT 10,
    filter_guest_id text DEFAULT NULL,
    filter_theme_id text DEFAULT NULL,
    filter_segment_types text[] DEFAULT ARRAY['interview', 'lightning_round']::text[]
)
RETURNS TABLE (
    chunk_id text,
    text text,
    similarity float,
    guest_id text,
    episode_id text,
    theme_id text,
    speaker text,
    time_stamp text,
    token_count integer,
    segment_type text
)
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
    RETURN QUERY
    SELECT
        ce.chunk_id,
        ce.text,
        1 - (ce.embedding <=> query_embedding) as similarity,
        ce.guest_id,
        ce.episode_id,
        ce.theme_id,
        ce.speaker,
        ce.timestamp AS time_stamp,
        ce.token_count,
        ce.segment_type
    FROM chunk_embeddings ce
    WHERE
        (filter_guest_id IS NULL OR ce.guest_id = filter_guest_id)
        AND (filter_theme_id IS NULL OR ce.theme_id = filter_theme_id)
        AND (filter_segment_types IS NULL OR ce.segment_type = ANY(filter_segment_types))
        AND (1 - (ce.embedding <=> query_embedding)) >= match_threshold
    ORDER BY ce.embedding <=> query_embedding
    LIMIT match_count;
END;
$$;

COMMENT ON FUNCTION public.match_chunks IS
'Vector similarity search with enforced segment allowlist. Defaults to interview + lightning_round evidence only.';

-- ------------------------------------------------------------
-- 6) RLS policies
-- ------------------------------------------------------------

ALTER TABLE concepts ENABLE ROW LEVEL SECURITY;
ALTER TABLE concept_references ENABLE ROW LEVEL SECURITY;
ALTER TABLE concept_chunks ENABLE ROW LEVEL SECURITY;
ALTER TABLE insights ENABLE ROW LEVEL SECURITY;
ALTER TABLE insight_evidence ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_messages ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'concepts' AND policyname = 'Public read concepts'
  ) THEN
    CREATE POLICY "Public read concepts" ON concepts FOR SELECT USING (status = 'published');
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'concept_references' AND policyname = 'Public read concept references'
  ) THEN
    CREATE POLICY "Public read concept references" ON concept_references FOR SELECT USING (true);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'concept_chunks' AND policyname = 'Public read concept chunks'
  ) THEN
    CREATE POLICY "Public read concept chunks" ON concept_chunks FOR SELECT USING (true);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'insights' AND policyname = 'Public read insights'
  ) THEN
    CREATE POLICY "Public read insights" ON insights FOR SELECT USING (true);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'insight_evidence' AND policyname = 'Public read insight evidence'
  ) THEN
    CREATE POLICY "Public read insight evidence" ON insight_evidence FOR SELECT USING (true);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'chat_sessions' AND policyname = 'Users manage own chat sessions'
  ) THEN
    CREATE POLICY "Users manage own chat sessions"
      ON chat_sessions
      FOR ALL
      USING (user_id = (SELECT auth.uid()))
      WITH CHECK (user_id = (SELECT auth.uid()));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'chat_messages' AND policyname = 'Users manage own chat messages'
  ) THEN
    CREATE POLICY "Users manage own chat messages"
      ON chat_messages
      FOR ALL
      USING (
        EXISTS (
          SELECT 1
          FROM chat_sessions cs
          WHERE cs.id = chat_messages.session_id
          AND cs.user_id = (SELECT auth.uid())
        )
      )
      WITH CHECK (
        EXISTS (
          SELECT 1
          FROM chat_sessions cs
          WHERE cs.id = chat_messages.session_id
          AND cs.user_id = (SELECT auth.uid())
        )
      );
  END IF;
END $$;


