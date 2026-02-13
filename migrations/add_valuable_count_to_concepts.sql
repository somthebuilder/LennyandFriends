-- Add valuable_count column to concepts table for tracking user "lightbulb" clicks
ALTER TABLE concepts ADD COLUMN IF NOT EXISTS valuable_count INTEGER NOT NULL DEFAULT 0;

-- Create index for sorting by most valuable
CREATE INDEX IF NOT EXISTS idx_concepts_valuable_count ON concepts(valuable_count DESC);

-- Votes table: one vote per voter per concept (matches insight_valuable_votes pattern)
CREATE TABLE IF NOT EXISTS concept_valuable_votes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    concept_id UUID NOT NULL REFERENCES concepts(id) ON DELETE CASCADE,
    voter_id TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (concept_id, voter_id)
);

CREATE INDEX IF NOT EXISTS idx_concept_valuable_votes_voter ON concept_valuable_votes(voter_id);
CREATE INDEX IF NOT EXISTS idx_concept_valuable_votes_concept ON concept_valuable_votes(concept_id);

-- Enable RLS
ALTER TABLE concept_valuable_votes ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'concept_valuable_votes' AND policyname = 'Public read concept votes'
  ) THEN
    CREATE POLICY "Public read concept votes" ON concept_valuable_votes FOR SELECT USING (true);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'concept_valuable_votes' AND policyname = 'Public insert concept votes'
  ) THEN
    CREATE POLICY "Public insert concept votes" ON concept_valuable_votes FOR INSERT WITH CHECK (true);
  END IF;
END $$;

-- Atomic RPC: check-then-insert-then-increment (matches vote_insight_valuable pattern)
CREATE OR REPLACE FUNCTION public.vote_concept_valuable(
    p_concept_id UUID,
    p_voter_id TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    INSERT INTO concept_valuable_votes (concept_id, voter_id)
    VALUES (p_concept_id, p_voter_id)
    ON CONFLICT (concept_id, voter_id) DO NOTHING;

    IF NOT FOUND THEN
        RETURN FALSE;
    END IF;

    UPDATE concepts
    SET valuable_count = valuable_count + 1
    WHERE id = p_concept_id;

    RETURN TRUE;
END;
$$;

COMMENT ON FUNCTION public.vote_concept_valuable IS
'Atomically marks a concept as valuable for a given voter_id. Returns true if vote was recorded, false if already voted.';
