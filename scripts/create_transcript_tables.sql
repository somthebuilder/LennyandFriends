-- Database schema for transcript ingestion pipeline
-- Run this migration in Supabase SQL editor

-- Guests table (text IDs to align with existing episodes.guest_id type)
CREATE TABLE IF NOT EXISTS guests (
    id TEXT PRIMARY KEY,
    full_name TEXT NOT NULL UNIQUE,
    "current_role" TEXT,
    current_company TEXT,
    previous_roles JSONB DEFAULT '[]'::jsonb,
    fun_facts JSONB DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Episodes table (extend existing table if present)
ALTER TABLE episodes ADD COLUMN IF NOT EXISTS slug TEXT;
ALTER TABLE episodes ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE episodes ADD COLUMN IF NOT EXISTS video_id TEXT;
ALTER TABLE episodes ADD COLUMN IF NOT EXISTS duration_seconds FLOAT;
ALTER TABLE episodes ADD COLUMN IF NOT EXISTS view_count INTEGER;
ALTER TABLE episodes ADD COLUMN IF NOT EXISTS channel TEXT DEFAULT 'Lenny''s Podcast';
ALTER TABLE episodes ADD COLUMN IF NOT EXISTS keywords JSONB DEFAULT '[]'::jsonb;
ALTER TABLE episodes ADD COLUMN IF NOT EXISTS cold_open_quote TEXT;
ALTER TABLE episodes ADD COLUMN IF NOT EXISTS transcript_hash TEXT;

-- Backfill slug for any existing rows
UPDATE episodes SET slug = id WHERE slug IS NULL;

-- Ensure slug uniqueness
CREATE UNIQUE INDEX IF NOT EXISTS idx_episodes_slug_unique ON episodes(slug);

-- Segments table
CREATE TABLE IF NOT EXISTS segments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    episode_id TEXT REFERENCES episodes(id) ON DELETE CASCADE,
    segment_type TEXT NOT NULL CHECK (segment_type IN ('intro', 'sponsor', 'interview', 'lightning_round', 'outro')),
    start_time TEXT, -- HH:MM:SS format
    end_time TEXT,
    content TEXT NOT NULL,
    display_order INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Lightning round answers
CREATE TABLE IF NOT EXISTS lightning_round_answers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    episode_id TEXT REFERENCES episodes(id) ON DELETE CASCADE UNIQUE,
    books TEXT,
    entertainment TEXT,
    interview_question TEXT,
    products TEXT,
    productivity_tip TEXT,
    life_motto TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Lightning round books (structured)
CREATE TABLE IF NOT EXISTS lightning_round_books (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    episode_id TEXT REFERENCES episodes(id) ON DELETE CASCADE,
    book_title TEXT NOT NULL,
    author TEXT,
    summary TEXT,
    genre TEXT,
    display_order INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Sponsor mentions
CREATE TABLE IF NOT EXISTS sponsor_mentions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    episode_id TEXT REFERENCES episodes(id) ON DELETE CASCADE,
    sponsor_name TEXT NOT NULL,
    ad_content TEXT NOT NULL,
    cta_url TEXT,
    position TEXT CHECK (position IN ('first_break', 'mid_break')),
    display_order INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_episodes_guest_id ON episodes(guest_id);
CREATE INDEX IF NOT EXISTS idx_episodes_publish_date ON episodes(publish_date);
CREATE INDEX IF NOT EXISTS idx_segments_episode_id ON segments(episode_id);
CREATE INDEX IF NOT EXISTS idx_segments_type ON segments(segment_type);
CREATE INDEX IF NOT EXISTS idx_lightning_round_books_episode_id ON lightning_round_books(episode_id);
CREATE INDEX IF NOT EXISTS idx_sponsor_mentions_episode_id ON sponsor_mentions(episode_id);

-- RLS policies (adjust as needed)
ALTER TABLE guests ENABLE ROW LEVEL SECURITY;
ALTER TABLE episodes ENABLE ROW LEVEL SECURITY;
ALTER TABLE segments ENABLE ROW LEVEL SECURITY;
ALTER TABLE lightning_round_answers ENABLE ROW LEVEL SECURITY;
ALTER TABLE lightning_round_books ENABLE ROW LEVEL SECURITY;
ALTER TABLE sponsor_mentions ENABLE ROW LEVEL SECURITY;

-- Allow service role to do everything (for ingestion)
DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'guests' AND policyname = 'Service role can do everything on guests'
    ) THEN
        CREATE POLICY "Service role can do everything on guests" ON guests FOR ALL USING (true);
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'episodes' AND policyname = 'Service role can do everything on episodes'
    ) THEN
        CREATE POLICY "Service role can do everything on episodes" ON episodes FOR ALL USING (true);
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'segments' AND policyname = 'Service role can do everything on segments'
    ) THEN
        CREATE POLICY "Service role can do everything on segments" ON segments FOR ALL USING (true);
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'lightning_round_books' AND policyname = 'Service role can do everything on lightning_round_books'
    ) THEN
        CREATE POLICY "Service role can do everything on lightning_round_books" ON lightning_round_books FOR ALL USING (true);
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'lightning_round_answers' AND policyname = 'Service role can do everything on lightning_round_answers'
    ) THEN
        CREATE POLICY "Service role can do everything on lightning_round_answers" ON lightning_round_answers FOR ALL USING (true);
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'sponsor_mentions' AND policyname = 'Service role can do everything on sponsor_mentions'
    ) THEN
        CREATE POLICY "Service role can do everything on sponsor_mentions" ON sponsor_mentions FOR ALL USING (true);
    END IF;
END $$;

