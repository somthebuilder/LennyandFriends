-- Drop the old podcast_likes table
DROP TABLE IF EXISTS podcast_likes CASCADE;

-- Create podcasts table for curated podcast list
CREATE TABLE IF NOT EXISTS podcasts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL UNIQUE,
    description TEXT NOT NULL,
    category TEXT, -- e.g., 'business', 'tech', 'health'
    podcast_link TEXT, -- Spotify, Apple, etc.
    like_count INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
    display_order INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create index on status and display_order for efficient queries
CREATE INDEX IF NOT EXISTS idx_podcasts_status_order ON podcasts(status, display_order);

-- Add check constraint to ensure like_count is never negative
ALTER TABLE podcasts 
ADD CONSTRAINT check_podcasts_like_count_positive CHECK (like_count >= 0);

-- Enable RLS
ALTER TABLE podcasts ENABLE ROW LEVEL SECURITY;

-- Policy: Allow public reads
CREATE POLICY "Allow public reads on podcasts" ON podcasts
    FOR SELECT
    USING (status = 'active');

-- Policy: Allow public updates to like_count only
CREATE POLICY "Allow public like updates" ON podcasts
    FOR UPDATE
    USING (true)
    WITH CHECK (true);

-- Insert initial curated podcast data
INSERT INTO podcasts (name, description, category, like_count, display_order, created_at, updated_at)
VALUES 
    ('20VC', 'Venture & Fundraising', 'business', 7, 1, NOW(), NOW()),
    ('My First Million', 'Business Ideas & Revenue', 'business', 5, 2, NOW(), NOW()),
    ('All-In Podcast', 'Tech, Markets & Strategy', 'tech', 8, 3, NOW(), NOW()),
    ('The India Opportunity', 'Indian Tech & Startups', 'tech', 3, 4, NOW(), NOW()),
    ('Huberman Lab', 'Science & Health', 'health', 1, 5, NOW(), NOW())
ON CONFLICT (name) DO NOTHING;

-- Add updated_at trigger
CREATE OR REPLACE FUNCTION update_podcasts_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_podcasts_updated_at BEFORE UPDATE
    ON podcasts FOR EACH ROW
    EXECUTE FUNCTION update_podcasts_updated_at();

