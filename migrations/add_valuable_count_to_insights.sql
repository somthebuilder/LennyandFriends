-- Add valuable_count column to insights table for tracking user "lightbulb" clicks
ALTER TABLE insights ADD COLUMN IF NOT EXISTS valuable_count INTEGER NOT NULL DEFAULT 0;

-- Create index for sorting by most valuable
CREATE INDEX IF NOT EXISTS idx_insights_valuable_count ON insights(valuable_count DESC);

-- Votes table: one vote per voter per insight (matches podcast_request_votes pattern)
CREATE TABLE IF NOT EXISTS insight_valuable_votes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    insight_id UUID NOT NULL REFERENCES insights(id) ON DELETE CASCADE,
    voter_id TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (insight_id, voter_id)
);

CREATE INDEX IF NOT EXISTS idx_insight_valuable_votes_voter ON insight_valuable_votes(voter_id);
CREATE INDEX IF NOT EXISTS idx_insight_valuable_votes_insight ON insight_valuable_votes(insight_id);

-- Enable RLS
ALTER TABLE insight_valuable_votes ENABLE ROW LEVEL SECURITY;

-- Allow public reads (so voter can check their own votes via voter_id filter)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'insight_valuable_votes' AND policyname = 'Public read insight votes'
  ) THEN
    CREATE POLICY "Public read insight votes" ON insight_valuable_votes FOR SELECT USING (true);
  END IF;
END $$;

-- Allow public inserts (controlled via RPC, but needed for direct inserts too)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'insight_valuable_votes' AND policyname = 'Public insert insight votes'
  ) THEN
    CREATE POLICY "Public insert insight votes" ON insight_valuable_votes FOR INSERT WITH CHECK (true);
  END IF;
END $$;

-- Atomic RPC: check-then-insert-then-increment (matches vote_for_podcast_request pattern)
CREATE OR REPLACE FUNCTION public.vote_insight_valuable(
    p_insight_id UUID,
    p_voter_id TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    -- Try to insert; if unique constraint fires, voter already voted
    INSERT INTO insight_valuable_votes (insight_id, voter_id)
    VALUES (p_insight_id, p_voter_id)
    ON CONFLICT (insight_id, voter_id) DO NOTHING;

    -- If no row was inserted (already voted), return false
    IF NOT FOUND THEN
        RETURN FALSE;
    END IF;

    -- Increment the count on the insight
    UPDATE insights
    SET valuable_count = valuable_count + 1
    WHERE id = p_insight_id;

    RETURN TRUE;
END;
$$;

COMMENT ON FUNCTION public.vote_insight_valuable IS
'Atomically marks an insight as valuable for a given voter_id. Returns true if vote was recorded, false if already voted.';
