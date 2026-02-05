-- Create podcast_likes table to track likes for podcast requests
CREATE TABLE IF NOT EXISTS podcast_likes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    podcast_name TEXT NOT NULL UNIQUE,
    like_count INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create index on podcast_name for faster lookups
CREATE INDEX IF NOT EXISTS idx_podcast_likes_name ON podcast_likes(podcast_name);

-- Add check constraint to ensure like_count is never negative
ALTER TABLE podcast_likes 
ADD CONSTRAINT check_like_count_positive CHECK (like_count >= 0);

-- Insert initial podcast data with their starting like counts
INSERT INTO podcast_likes (podcast_name, like_count, created_at, updated_at)
VALUES 
    ('20VC', 7, NOW(), NOW()),
    ('My First Million', 5, NOW(), NOW()),
    ('All-In Podcast', 8, NOW(), NOW()),
    ('The India Opportunity', 3, NOW(), NOW()),
    ('Huberman Lab', 1, NOW(), NOW())
ON CONFLICT (podcast_name) DO NOTHING;

