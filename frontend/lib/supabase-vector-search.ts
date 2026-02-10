/**
 * Supabase Vector Search Utility
 * Performs vector similarity search using pgvector
 */
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

const supabase = createClient(supabaseUrl, supabaseServiceKey)

export interface ChunkResult {
  chunk_id: string
  text: string
  similarity: number
  guest_id: string
  episode_id: string
  theme_id: string | null
  speaker: string | null
  timestamp: string | null
  token_count: number | null
  segment_type?: 'intro' | 'sponsor' | 'interview' | 'lightning_round' | 'outro'
}

/**
 * Search chunks using vector similarity
 */
export async function searchChunks(
  queryEmbedding: number[],
  options: {
    limit?: number
    matchThreshold?: number
    filterGuestId?: string
    filterThemeId?: string
    filterSegmentTypes?: Array<'interview' | 'lightning_round'>
  } = {}
): Promise<ChunkResult[]> {
  const {
    limit = 10,
    matchThreshold = 0.0,
    filterGuestId,
    filterThemeId,
    filterSegmentTypes = ['interview', 'lightning_round'],
  } = options

  try {
    const { data, error } = await supabase.rpc('match_chunks', {
      query_embedding: queryEmbedding,
      match_threshold: matchThreshold,
      match_count: limit,
      filter_guest_id: filterGuestId || null,
      filter_theme_id: filterThemeId || null,
      filter_segment_types: filterSegmentTypes,
    })

    if (error) {
      console.error('Supabase vector search error:', error)
      throw new Error(`Vector search failed: ${error.message}`)
    }

    return (data || []).map((row: any) => ({
      chunk_id: row.chunk_id,
      text: row.text,
      similarity: row.similarity,
      guest_id: row.guest_id,
      episode_id: row.episode_id,
      theme_id: row.theme_id ?? null,
      speaker: row.speaker ?? null,
      timestamp: row.time_stamp ?? row.timestamp ?? null,
      token_count: row.token_count ?? null,
      segment_type: row.segment_type ?? undefined,
    }))
  } catch (error: any) {
    console.error('Error in vector search:', error)
    throw error
  }
}

