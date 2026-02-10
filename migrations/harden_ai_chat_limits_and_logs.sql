-- Harden AI gateway limits and add request-level usage logging.

ALTER TABLE usage_limits
ADD COLUMN IF NOT EXISTS last_input_hash TEXT,
ADD COLUMN IF NOT EXISTS last_input_at TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS ai_usage_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_key TEXT NOT NULL,
    podcast_slug TEXT NOT NULL,
    model TEXT,
    endpoint TEXT NOT NULL DEFAULT 'ai_chat',
    request_chars INTEGER NOT NULL DEFAULT 0,
    context_chunks INTEGER NOT NULL DEFAULT 0,
    best_similarity DOUBLE PRECISION,
    tokens_in INTEGER NOT NULL DEFAULT 0,
    tokens_out INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL CHECK (status IN ('success', 'rejected', 'failed', 'fallback')),
    error_code TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ai_usage_logs_user_key_created_at
ON ai_usage_logs(user_key, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_ai_usage_logs_status_created_at
ON ai_usage_logs(status, created_at DESC);

ALTER TABLE ai_usage_logs ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'ai_usage_logs' AND policyname = 'No direct client access to ai usage logs'
  ) THEN
    CREATE POLICY "No direct client access to ai usage logs"
      ON ai_usage_logs
      FOR ALL
      USING (false)
      WITH CHECK (false);
  END IF;
END $$;


