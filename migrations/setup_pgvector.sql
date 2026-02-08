-- Enable pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- Create chunk_embeddings table with vector column (if it doesn't exist)
-- This table stores transcript chunks with their embeddings for RAG
CREATE TABLE IF NOT EXISTS chunk_embeddings (
    chunk_id TEXT PRIMARY KEY,
    text TEXT NOT NULL,
    embedding vector(384), -- 384 dimensions for all-MiniLM-L6-v2 model
    guest_id TEXT NOT NULL,
    episode_id TEXT NOT NULL,
    theme_id TEXT,
    speaker TEXT,
    timestamp TEXT,
    token_count INTEGER,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create index for vector similarity search (HNSW for fast approximate search)
CREATE INDEX IF NOT EXISTS chunk_embeddings_embedding_idx 
ON chunk_embeddings 
USING hnsw (embedding vector_cosine_ops)
WITH (m = 16, ef_construction = 64);

-- Create indexes for filtering
CREATE INDEX IF NOT EXISTS chunk_embeddings_guest_id_idx ON chunk_embeddings(guest_id);
CREATE INDEX IF NOT EXISTS chunk_embeddings_episode_id_idx ON chunk_embeddings(episode_id);
CREATE INDEX IF NOT EXISTS chunk_embeddings_theme_id_idx ON chunk_embeddings(theme_id);

-- Create RPC function for vector similarity search
-- This function is called by your Python code via supabase.rpc('match_chunks', ...)
CREATE OR REPLACE FUNCTION match_chunks(
    query_embedding vector(384),
    match_threshold float DEFAULT 0.0,
    match_count int DEFAULT 10,
    filter_guest_id text DEFAULT NULL,
    filter_theme_id text DEFAULT NULL
)
RETURNS TABLE (
    chunk_id text,
    text text,
    similarity float,
    guest_id text,
    episode_id text,
    theme_id text,
    speaker text,
    timestamp text,
    token_count integer
)
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN QUERY
    SELECT
        ce.chunk_id,
        ce.text,
        1 - (ce.embedding <=> query_embedding) as similarity, -- Cosine distance (<=>) converted to similarity
        ce.guest_id,
        ce.episode_id,
        ce.theme_id,
        ce.speaker,
        ce.timestamp,
        ce.token_count
    FROM chunk_embeddings ce
    WHERE
        -- Filter by guest if provided
        (filter_guest_id IS NULL OR ce.guest_id = filter_guest_id)
        AND
        -- Filter by theme if provided
        (filter_theme_id IS NULL OR ce.theme_id = filter_theme_id)
        AND
        -- Only return results above threshold
        (1 - (ce.embedding <=> query_embedding)) >= match_threshold
    ORDER BY ce.embedding <=> query_embedding -- Order by cosine distance (ascending = most similar)
    LIMIT match_count;
END;
$$;

-- Grant permissions (adjust as needed for your RLS policies)
GRANT USAGE ON SCHEMA public TO anon, authenticated;
GRANT SELECT ON chunk_embeddings TO anon, authenticated;
GRANT EXECUTE ON FUNCTION match_chunks TO anon, authenticated;

-- Add comment
COMMENT ON FUNCTION match_chunks IS 'Vector similarity search for chunk embeddings using pgvector. Returns chunks ordered by similarity to query embedding.';

