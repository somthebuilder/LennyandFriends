import { createServerSupabase } from '@/lib/supabase-server'
import type { Concept } from '@/lib/types/rag'
export type { Concept } from '@/lib/types/rag'

const IN_BATCH_SIZE = 40
const DEFAULT_CONCEPTS_PAGE_SIZE = 10
const MAX_CONCEPTS_PAGE_SIZE = 50

function chunkArray<T>(items: T[], size: number): T[][] {
  if (items.length <= size) return [items]
  const chunks: T[][] = []
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size))
  }
  return chunks
}

export type GetConceptsPageOptions = {
  limit?: number
  offset?: number
}

export type ConceptsPageResult = {
  items: Concept[]
  total: number
  limit: number
  offset: number
  hasMore: boolean
}

function sanitizeLimit(limit?: number) {
  if (typeof limit !== 'number' || !Number.isFinite(limit)) return DEFAULT_CONCEPTS_PAGE_SIZE
  return Math.min(MAX_CONCEPTS_PAGE_SIZE, Math.max(1, Math.floor(limit)))
}

function sanitizeOffset(offset?: number) {
  if (typeof offset !== 'number' || !Number.isFinite(offset)) return 0
  return Math.max(0, Math.floor(offset))
}

async function mapConceptRows(conceptRows: Array<{
  id: string
  title: string
  slug: string
  summary: string | null
  body: string
  category: string | null
  theme_label: string | null
  guest_count: number | null
  episode_count: number | null
  valuable_count: number | null
  created_at: string
}>) {
  if (!conceptRows.length) return [] as Concept[]

  const supabase = createServerSupabase()
  const conceptIds = conceptRows.map((c) => c.id)
  const referenceBatches = await Promise.all(
    chunkArray(conceptIds, IN_BATCH_SIZE).map((ids) =>
      supabase
        .from('concept_references')
        .select('concept_id,guest_id,episode_id,quote,timestamp,time_seconds,episode_url,display_order')
        .in('concept_id', ids)
        .order('display_order', { ascending: true })
    )
  )
  const referenceRows = referenceBatches.flatMap((r) => r.data ?? [])

  const guestIds = Array.from(new Set((referenceRows ?? []).map((r) => r.guest_id).filter(Boolean)))
  const episodeIds = Array.from(new Set((referenceRows ?? []).map((r) => r.episode_id).filter(Boolean)))

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

  return conceptRows.map((row): Concept => ({
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

export async function getConceptsPage(
  podcastSlug: string,
  options: GetConceptsPageOptions = {}
): Promise<ConceptsPageResult> {
  const limit = sanitizeLimit(options.limit)
  const offset = sanitizeOffset(options.offset)
  const supabase = createServerSupabase()

  const { data: podcast, error: podcastError } = await supabase
    .from('podcasts')
    .select('id')
    .eq('slug', podcastSlug)
    .maybeSingle()
  if (podcastError || !podcast) {
    return { items: [], total: 0, limit, offset, hasMore: false }
  }

  const { count, error: countError } = await supabase
    .from('concepts')
    .select('id', { count: 'exact', head: true })
    .eq('podcast_id', podcast.id)
    .eq('status', 'published')

  if (countError) {
    return { items: [], total: 0, limit, offset, hasMore: false }
  }

  const total = count ?? 0
  if (total === 0 || offset >= total) {
    return { items: [], total, limit, offset, hasMore: false }
  }

  const rangeEnd = offset + limit - 1
  const { data: conceptRows, error: conceptsError } = await supabase
    .from('concepts')
    .select(
      'id,title,slug,summary,body,category,theme_label,guest_count,episode_count,valuable_count,created_at'
    )
    .eq('podcast_id', podcast.id)
    .eq('status', 'published')
    .order('created_at', { ascending: false })
    .range(offset, rangeEnd)

  if (conceptsError || !conceptRows?.length) {
    return { items: [], total, limit, offset, hasMore: false }
  }

  const items = await mapConceptRows(conceptRows)
  return {
    items,
    total,
    limit,
    offset,
    hasMore: offset + items.length < total,
  }
}

export async function getConcepts(podcastSlug: string) {
  const pageSize = MAX_CONCEPTS_PAGE_SIZE
  const allItems: Concept[] = []
  let offset = 0
  let total = 0

  while (true) {
    const page = await getConceptsPage(podcastSlug, { limit: pageSize, offset })
    if (offset === 0) total = page.total
    allItems.push(...page.items)
    if (!page.hasMore || allItems.length >= total) break
    offset += page.items.length
  }

  return allItems
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

