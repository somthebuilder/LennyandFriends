import { createServerSupabase } from '@/lib/supabase-server'
import type { Concept } from '@/lib/types/rag'
export type { Concept } from '@/lib/types/rag'

export async function getConcepts(podcastSlug: string) {
  const supabase = createServerSupabase()
  const { data: podcast, error: podcastError } = await supabase
    .from('podcasts')
    .select('id')
    .eq('slug', podcastSlug)
    .maybeSingle()
  if (podcastError || !podcast) return []

  const { data: conceptRows, error: conceptsError } = await supabase
    .from('concepts')
    .select(
      'id,title,slug,summary,body,category,theme_label,guest_count,episode_count,valuable_count,created_at'
    )
    .eq('podcast_id', podcast.id)
    .eq('status', 'published')
    .order('created_at', { ascending: false })
  if (conceptsError || !conceptRows?.length) return []

  const conceptIds = conceptRows.map((c) => c.id)
  const { data: referenceRows } = await supabase
    .from('concept_references')
    .select('concept_id,guest_id,episode_id,quote,timestamp,time_seconds,episode_url,display_order')
    .in('concept_id', conceptIds)
    .order('display_order', { ascending: true })

  const guestIds = Array.from(new Set((referenceRows ?? []).map((r) => r.guest_id).filter(Boolean)))
  const episodeIds = Array.from(new Set((referenceRows ?? []).map((r) => r.episode_id).filter(Boolean)))

  const [{ data: guests }, { data: episodes }] = await Promise.all([
    guestIds.length
      ? supabase.from('guests').select('id,full_name,current_role,current_company').in('id', guestIds)
      : Promise.resolve({ data: [] as Array<{ id: string; full_name: string; current_role: string | null; current_company: string | null }> }),
    episodeIds.length
      ? supabase.from('episodes').select('id,title,youtube_url').in('id', episodeIds)
      : Promise.resolve({ data: [] as Array<{ id: string; title: string; youtube_url: string | null }> }),
  ])

  const guestMap = new Map((guests ?? []).map((g) => [g.id, { name: g.full_name, role: [g.current_role, g.current_company].filter(Boolean).join(' at ') || undefined }]))
  const episodeMap = new Map((episodes ?? []).map((e) => [e.id, { title: e.title, youtube_url: e.youtube_url }]))
  const refsByConcept = new Map<string, NonNullable<Concept['references']>>()

  for (const ref of referenceRows ?? []) {
    const existing = refsByConcept.get(ref.concept_id) ?? []
    const episodeMeta = ref.episode_id ? episodeMap.get(ref.episode_id) : null
    const guestInfo = ref.guest_id ? guestMap.get(ref.guest_id) : null
    existing.push({
      guest_name: guestInfo?.name ?? 'Unknown guest',
      guest_role: guestInfo?.role,
      episode_title: episodeMeta?.title ?? 'Unknown episode',
      timestamp: ref.timestamp ?? undefined,
      time_seconds: ref.time_seconds ?? undefined,
      episode_url: ref.episode_url ?? episodeMeta?.youtube_url ?? undefined,
      quote: ref.quote ?? undefined,
    })
    refsByConcept.set(ref.concept_id, existing)
  }

  return conceptRows.map((row) => ({
    id: row.id,
    title: row.title,
    slug: row.slug,
    summary: row.summary ?? undefined,
    body: row.body,
    category: row.category ?? undefined,
    theme_label: row.theme_label ?? undefined,
    guest_count: row.guest_count ?? 0,
    episode_count: row.episode_count ?? 0,
    valuable_count: row.valuable_count ?? 0,
    created_at: row.created_at,
    references: refsByConcept.get(row.id) ?? [],
  }))
}

export async function getConceptBySlug(slug: string, podcastSlug = 'lennys-podcast'): Promise<Concept | undefined> {
  const supabase = createServerSupabase()

  // Resolve podcast ID
  const { data: podcast } = await supabase
    .from('podcasts')
    .select('id')
    .eq('slug', podcastSlug)
    .maybeSingle()
  if (!podcast) return undefined

  // Fetch single concept by slug
  const { data: row, error } = await supabase
    .from('concepts')
    .select('id,title,slug,summary,body,category,theme_label,guest_count,episode_count,valuable_count,created_at')
    .eq('podcast_id', podcast.id)
    .eq('slug', slug)
    .eq('status', 'published')
    .maybeSingle()
  if (error || !row) return undefined

  // Fetch references for this single concept
  const { data: referenceRows } = await supabase
    .from('concept_references')
    .select('guest_id,episode_id,quote,timestamp,time_seconds,episode_url,display_order')
    .eq('concept_id', row.id)
    .order('display_order', { ascending: true })

  const guestIds = Array.from(new Set((referenceRows ?? []).map((r) => r.guest_id).filter(Boolean)))
  const episodeIds = Array.from(new Set((referenceRows ?? []).map((r) => r.episode_id).filter(Boolean)))

  const [{ data: guests }, { data: episodes }] = await Promise.all([
    guestIds.length
      ? supabase.from('guests').select('id,full_name,current_role,current_company').in('id', guestIds)
      : Promise.resolve({ data: [] as Array<{ id: string; full_name: string; current_role: string | null; current_company: string | null }> }),
    episodeIds.length
      ? supabase.from('episodes').select('id,title,youtube_url').in('id', episodeIds)
      : Promise.resolve({ data: [] as Array<{ id: string; title: string; youtube_url: string | null }> }),
  ])

  const guestMap = new Map((guests ?? []).map((g) => [g.id, { name: g.full_name, role: [g.current_role, g.current_company].filter(Boolean).join(' at ') || undefined }]))
  const episodeMap = new Map((episodes ?? []).map((e) => [e.id, { title: e.title, youtube_url: e.youtube_url }]))

  const references = (referenceRows ?? []).map((ref) => {
    const episodeMeta = ref.episode_id ? episodeMap.get(ref.episode_id) : null
    const guestInfo = ref.guest_id ? guestMap.get(ref.guest_id) : null
    return {
      guest_name: guestInfo?.name ?? 'Unknown guest',
      guest_role: guestInfo?.role,
      episode_title: episodeMeta?.title ?? 'Unknown episode',
      timestamp: ref.timestamp ?? undefined,
      time_seconds: ref.time_seconds ?? undefined,
      episode_url: ref.episode_url ?? episodeMeta?.youtube_url ?? undefined,
      quote: ref.quote ?? undefined,
    }
  })

  return {
    id: row.id,
    title: row.title,
    slug: row.slug,
    summary: row.summary ?? undefined,
    body: row.body,
    category: row.category ?? undefined,
    theme_label: row.theme_label ?? undefined,
    guest_count: row.guest_count ?? 0,
    episode_count: row.episode_count ?? 0,
    valuable_count: row.valuable_count ?? 0,
    created_at: row.created_at,
    references,
  }
}

