-- Add deep-link metadata for references and taxonomy fields for artifacts.

ALTER TABLE public.concepts
ADD COLUMN IF NOT EXISTS category TEXT,
ADD COLUMN IF NOT EXISTS theme_label TEXT,
ADD COLUMN IF NOT EXISTS guest_count INTEGER NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS episode_count INTEGER NOT NULL DEFAULT 0;

ALTER TABLE public.insights
ADD COLUMN IF NOT EXISTS category TEXT,
ADD COLUMN IF NOT EXISTS theme_label TEXT;

ALTER TABLE public.concept_references
ADD COLUMN IF NOT EXISTS episode_url TEXT,
ADD COLUMN IF NOT EXISTS time_seconds INTEGER;

ALTER TABLE public.insight_evidence
ADD COLUMN IF NOT EXISTS time_seconds INTEGER;

CREATE INDEX IF NOT EXISTS idx_concepts_theme_label ON public.concepts(theme_label);
CREATE INDEX IF NOT EXISTS idx_concepts_category ON public.concepts(category);
CREATE INDEX IF NOT EXISTS idx_insights_theme_label ON public.insights(theme_label);
CREATE INDEX IF NOT EXISTS idx_insights_category ON public.insights(category);

COMMENT ON COLUMN public.concept_references.time_seconds IS
'Reference timestamp in seconds, used to build deep links like ?t=123.';

COMMENT ON COLUMN public.insight_evidence.time_seconds IS
'Evidence timestamp in seconds, used to build deep links like ?t=123.';

