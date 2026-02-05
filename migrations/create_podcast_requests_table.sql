-- Create podcast_requests table for storing YouTube podcast conversion requests

CREATE TABLE IF NOT EXISTS podcast_requests (
    id BIGSERIAL PRIMARY KEY,
    -- New format fields
    podcast_name TEXT,
    podcast_link TEXT,
    questions TEXT,
    note TEXT,
    email TEXT,
    -- Legacy format fields
    name TEXT,
    request_type TEXT CHECK (request_type IN ('guest', 'topic')),
    youtube_url TEXT,
    description TEXT,
    -- Common fields
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'rejected')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    processed_at TIMESTAMPTZ
);

-- Create index on status for filtering
CREATE INDEX IF NOT EXISTS idx_podcast_requests_status ON podcast_requests(status);

-- Create index on created_at for sorting
CREATE INDEX IF NOT EXISTS idx_podcast_requests_created_at ON podcast_requests(created_at DESC);

-- Create unique index on youtube_url to prevent duplicates (optional - remove if you want to allow multiple requests)
-- CREATE UNIQUE INDEX IF NOT EXISTS idx_podcast_requests_youtube_url ON podcast_requests(youtube_url);

-- Add RLS (Row Level Security) policies if needed
ALTER TABLE podcast_requests ENABLE ROW LEVEL SECURITY;

-- Policy: Allow anyone to insert (for public requests)
CREATE POLICY "Allow public inserts" ON podcast_requests
    FOR INSERT
    WITH CHECK (true);

-- Policy: Only authenticated users can read (adjust as needed)
-- For now, we'll allow reads but you can restrict this
CREATE POLICY "Allow public reads" ON podcast_requests
    FOR SELECT
    USING (true);

-- Add updated_at trigger
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_podcast_requests_updated_at BEFORE UPDATE
    ON podcast_requests FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

