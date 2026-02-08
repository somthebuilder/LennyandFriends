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
  } = {}
): Promise<ChunkResult[]> {
  const {
    limit = 10,
    matchThreshold = 0.0,
    filterGuestId,
    filterThemeId,
  } = options

  try {
    const { data, error } = await supabase.rpc('match_chunks', {
      query_embedding: queryEmbedding,
      match_threshold: matchThreshold,
      match_count: limit,
      filter_guest_id: filterGuestId || null,
      filter_theme_id: filterThemeId || null,
    })

    if (error) {
      console.error('Supabase vector search error:', error)
      throw new Error(`Vector search failed: ${error.message}`)
    }

    return (data || []) as ChunkResult[]
  } catch (error: any) {
    console.error('Error in vector search:', error)
    throw error
  }
}

