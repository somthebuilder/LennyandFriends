import type { Concept, Insight } from '@/lib/types/rag'

type PreviewOptions = {
  sampleChunks?: number
  conceptCount?: number
  insightCount?: number
}

type DryRunResponse = {
  dryRun: true
  modelUsed?: string
  rawConceptCount?: number
  rawInsightCount?: number
  conceptsGenerated?: number
  insightsGenerated?: number
  previewConcepts?: Array<Record<string, unknown>>
  previewInsights?: Array<Record<string, unknown>>
}

export type DryRunPreviewResult = {
  concepts: Concept[]
  insights: Insight[]
  meta: {
    modelUsed?: string
    rawConceptCount: number
    rawInsightCount: number
    conceptsGenerated: number
    insightsGenerated: number
  }
}

function asString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback
}

function asNumber(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

function asOptionalNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

export async function getDryRunPreview(
  podcastSlug: string,
  options: PreviewOptions = {}
): Promise<DryRunPreviewResult> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !serviceRole) {
    throw new Error('Missing Supabase server configuration for preview mode')
  }

  const payload = {
    podcastSlug,
    mode: 'both',
    dryRun: true,
    sampleChunks: options.sampleChunks ?? 240,
    conceptCount: options.conceptCount ?? 10,
    insightCount: options.insightCount ?? 10,
  }

  const response = await fetch(`${supabaseUrl}/functions/v1/extract_concepts_insights`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${serviceRole}`,
      apikey: serviceRole,
    },
    body: JSON.stringify(payload),
    cache: 'no-store',
  })

  const data = (await response.json().catch(() => ({}))) as DryRunResponse & { error?: string }
  if (!response.ok) {
    throw new Error(data.error || `Preview extraction failed (${response.status})`)
  }
  if (!Array.isArray(data.previewConcepts) && !Array.isArray(data.previewInsights)) {
    throw new Error('Dry-run preview payload unavailable. Deploy latest extract_concepts_insights function.')
  }

  const concepts: Concept[] = (data.previewConcepts ?? []).map((item, idx) => ({
    id: asString(item.id, `dry-concept-${idx + 1}`),
    title: asString(item.title, `Concept ${idx + 1}`),
    slug: asString(item.slug, `dry-concept-${idx + 1}`),
    summary: asString(item.summary) || undefined,
    body: asString(item.body),
    category: asString(item.category) || undefined,
    theme_label: asString(item.theme_label) || undefined,
    guest_count: asNumber(item.guest_count),
    episode_count: asNumber(item.episode_count),
    created_at: asString(item.created_at, new Date().toISOString()),
    valuable_count: asNumber(item.valuable_count),
    references: Array.isArray(item.references)
      ? item.references.map((ref) => ({
          guest_name: asString((ref as Record<string, unknown>).guest_name, 'Unknown guest'),
          guest_role: asString((ref as Record<string, unknown>).guest_role) || undefined,
          episode_title: asString((ref as Record<string, unknown>).episode_title, 'Unknown episode'),
          episode_url: asString((ref as Record<string, unknown>).episode_url) || undefined,
          timestamp: asString((ref as Record<string, unknown>).timestamp) || undefined,
          time_seconds: asOptionalNumber((ref as Record<string, unknown>).time_seconds),
          quote: asString((ref as Record<string, unknown>).quote) || undefined,
        }))
      : [],
  }))

  const insights: Insight[] = (data.previewInsights ?? []).map((item, idx) => ({
    id: asString(item.id, `dry-insight-${idx + 1}`),
    title: asString(item.title, `Insight ${idx + 1}`),
    takeaway: asString(item.takeaway),
    signal: (['high_consensus', 'split_view', 'emerging'].includes(asString(item.signal))
      ? asString(item.signal)
      : 'emerging') as Insight['signal'],
    category: asString(item.category) || undefined,
    theme_label: asString(item.theme_label) || undefined,
    guest_count: asNumber(item.guest_count),
    episode_count: asNumber(item.episode_count),
    explanation: Array.isArray(item.explanation)
      ? item.explanation.filter((x): x is string => typeof x === 'string')
      : [],
    evidence: Array.isArray(item.evidence)
      ? item.evidence.map((ref) => ({
          guest_name: asString((ref as Record<string, unknown>).guest_name, 'Unknown guest'),
          episode_title: asString((ref as Record<string, unknown>).episode_title, 'Unknown episode'),
          episode_url: asString((ref as Record<string, unknown>).episode_url) || undefined,
          timestamp: asString((ref as Record<string, unknown>).timestamp) || undefined,
          time_seconds: asOptionalNumber((ref as Record<string, unknown>).time_seconds),
          quote: asString((ref as Record<string, unknown>).quote) || undefined,
        }))
      : [],
    trend: (['stable', 'emerging', 'fading'].includes(asString(item.trend))
      ? asString(item.trend)
      : undefined) as Insight['trend'],
    created_at: asString(item.created_at, new Date().toISOString()),
    valuable_count: asNumber(item.valuable_count),
  }))

  return {
    concepts,
    insights,
    meta: {
      modelUsed: data.modelUsed,
      rawConceptCount: data.rawConceptCount ?? 0,
      rawInsightCount: data.rawInsightCount ?? 0,
      conceptsGenerated: data.conceptsGenerated ?? concepts.length,
      insightsGenerated: data.insightsGenerated ?? insights.length,
    },
  }
}


