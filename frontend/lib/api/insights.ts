import { createServerSupabase } from '@/lib/supabase-server'
import type { Insight } from '@/lib/types/rag'
export { SIGNAL_LABELS } from '@/lib/types/rag'
export type { Insight, SignalBadge } from '@/lib/types/rag'

const IN_BATCH_SIZE = 40

function chunkArray<T>(items: T[], size: number): T[][] {
  if (items.length <= size) return [items]
  const chunks: T[][] = []
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size))
  }
  return chunks
}

export async function getInsights(podcastSlug: string): Promise<Insight[]> {
  const supabase = createServerSupabase()
  const { data: podcast, error: podcastError } = await supabase
    .from('podcasts')
    .select('id')
    .eq('slug', podcastSlug)
    .maybeSingle()
  if (podcastError || !podcast) return []

  const { data: insightRows, error: insightsError } = await supabase
    .from('insights')
    .select(
      'id,title,takeaway,signal,category,theme_label,guest_count,episode_count,explanation,trend,valuable_count,created_at'
    )
    .eq('podcast_id', podcast.id)
    .order('guest_count', { ascending: false })
    .order('created_at', { ascending: false })
  if (insightsError || !insightRows?.length) return []

  const insightIds = insightRows.map((r) => r.id)
  const evidenceBatches = await Promise.all(
    chunkArray(insightIds, IN_BATCH_SIZE).map((ids) =>
      supabase
        .from('insight_evidence')
        .select('insight_id,guest_id,episode_id,quote,timestamp,time_seconds,episode_url,display_order')
        .in('insight_id', ids)
        .order('display_order', { ascending: true })
    )
  )
  const evidenceRows = evidenceBatches.flatMap((r) => r.data ?? [])

  const guestIds = Array.from(new Set((evidenceRows ?? []).map((r) => r.guest_id).filter(Boolean)))
  const episodeIds = Array.from(new Set((evidenceRows ?? []).map((r) => r.episode_id).filter(Boolean)))

  const [guestBatches, episodeBatches] = await Promise.all([
    guestIds.length
      ? Promise.all(
          chunkArray(guestIds, IN_BATCH_SIZE).map((ids) =>
            supabase.from('guests').select('id,full_name,current_role,current_company').in('id', ids)
          )
        )
      : Promise.resolve([] as Array<{ data: Array<{ id: string; full_name: string; current_role: string | null; current_company: string | null }> | null }>),
    episodeIds.length
      ? Promise.all(
          chunkArray(episodeIds, IN_BATCH_SIZE).map((ids) =>
            supabase.from('episodes').select('id,title,youtube_url').in('id', ids)
          )
        )
      : Promise.resolve([] as Array<{ data: Array<{ id: string; title: string; youtube_url: string | null }> | null }>),
  ])
  const guests = guestBatches.flatMap((r) => r.data ?? [])
  const episodes = episodeBatches.flatMap((r) => r.data ?? [])

  const guestMap = new Map((guests ?? []).map((g) => [g.id, { name: g.full_name, role: [g.current_role, g.current_company].filter(Boolean).join(' at ') || undefined }]))
  const episodeMap = new Map((episodes ?? []).map((e) => [e.id, { title: e.title, youtube_url: e.youtube_url }]))
  const evidenceByInsight = new Map<string, Insight['evidence']>()

  for (const ev of evidenceRows ?? []) {
    const existing = evidenceByInsight.get(ev.insight_id) ?? []
    const episodeMeta = ev.episode_id ? episodeMap.get(ev.episode_id) : null
    const guestInfo = ev.guest_id ? guestMap.get(ev.guest_id) : null
    existing.push({
      guest_name: guestInfo?.name ?? 'Unknown guest',
      guest_role: guestInfo?.role,
      episode_title: episodeMeta?.title ?? 'Unknown episode',
      episode_url: ev.episode_url ?? episodeMeta?.youtube_url ?? undefined,
      timestamp: ev.timestamp ?? undefined,
      time_seconds: ev.time_seconds ?? undefined,
      quote: ev.quote ?? undefined,
    })
    evidenceByInsight.set(ev.insight_id, existing)
  }

  return insightRows.map((row) => {
    const evidence = evidenceByInsight.get(row.id) ?? []
    // Compute counts from actual evidence instead of relying on (possibly stale) DB values
    const uniqueGuests = new Set(evidence.map((e) => e.guest_name).filter((n) => n && n !== 'Unknown guest'))
    const uniqueEpisodes = new Set(evidence.map((e) => e.episode_title).filter((t) => t && t !== 'Unknown episode'))
    const computedGuestCount = uniqueGuests.size
    const computedEpisodeCount = uniqueEpisodes.size

    return {
      id: row.id,
      title: row.title,
      takeaway: row.takeaway,
      signal: row.signal,
      category: row.category ?? undefined,
      theme_label: row.theme_label ?? undefined,
      guest_count: computedGuestCount || (row.guest_count ?? 0),
      episode_count: computedEpisodeCount || (row.episode_count ?? 0),
      explanation: Array.isArray(row.explanation)
        ? row.explanation.filter((item): item is string => typeof item === 'string')
        : [],
      evidence,
      trend: row.trend ?? undefined,
      valuable_count: row.valuable_count ?? 0,
      created_at: row.created_at,
    }
  })
}

