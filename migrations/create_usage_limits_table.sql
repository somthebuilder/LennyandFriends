-- Usage limits table for server-side AI rate limiting and budget protection.
-- Key is flexible: can store authenticated user IDs or anonymous fingerprints.

CREATE TABLE IF NOT EXISTS usage_limits (
    user_key TEXT PRIMARY KEY,
    minute_window_start TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    minute_request_count INTEGER NOT NULL DEFAULT 0,
    day_window_start TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    day_request_count INTEGER NOT NULL DEFAULT 0,
    day_token_count INTEGER NOT NULL DEFAULT 0,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_usage_limits_day_window_start ON usage_limits(day_window_start);

ALTER TABLE usage_limits ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'usage_limits' AND policyname = 'No direct client access to usage limits'
  ) THEN
    CREATE POLICY "No direct client access to usage limits"
      ON usage_limits
      FOR ALL
      USING (false)
      WITH CHECK (false);
  END IF;
END $$;


