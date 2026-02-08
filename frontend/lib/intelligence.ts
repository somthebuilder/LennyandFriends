/**
 * Runtime Intelligence - TypeScript implementation
 * Theme matching, guest selection, ambiguity detection
 */
import { generateEmbedding } from './embeddings'
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

const supabase = createClient(supabaseUrl, supabaseServiceKey)

export interface ActiveTheme {
  theme_id: string
  score: number
}

export interface GuestScore {
  guest_id: string
  guest_name: string
  score: number
  contributing_themes: string[]
}

interface Theme {
  theme_id: string
  label: string
  centroid_embedding: number[] | null
}

interface GuestThemeStrengths {
  [guestId: string]: {
    [themeId: string]: {
      strength: number
      chunk_count: number
    }
  }
}

/**
 * Load themes from Supabase
 */
async function loadThemes(): Promise<Theme[]> {
  const { data, error } = await supabase
    .from('themes')
    .select('theme_id, label, centroid_embedding')

  if (error) {
    console.error('Error loading themes:', error)
    return []
  }

  return (data || []).map((row: any) => ({
    theme_id: row.theme_id,
    label: row.label,
    centroid_embedding: row.centroid_embedding ? (row.centroid_embedding as number[]) : null,
  }))
}

/**
 * Load guest theme strengths from Supabase
 */
async function loadGuestThemeStrengths(): Promise<GuestThemeStrengths> {
  const { data, error } = await supabase
    .from('guest_theme_strengths')
    .select('guest_id, theme_id, strength, chunk_count')

  if (error) {
    console.error('Error loading guest theme strengths:', error)
    return {}
  }

  const strengths: GuestThemeStrengths = {}

  for (const row of data || []) {
    if (!strengths[row.guest_id]) {
      strengths[row.guest_id] = {}
    }
    strengths[row.guest_id][row.theme_id] = {
      strength: row.strength,
      chunk_count: row.chunk_count,
    }
  }

  return strengths
}

/**
 * Match user query to themes (intent detection)
 */
export async function matchThemes(
  query: string,
  topN: number = 5,
  minScore: number = 0.3
): Promise<ActiveTheme[]> {
  // Load themes
  const themes = await loadThemes()

  // Generate query embedding
  const queryEmbedding = await generateEmbedding(query)

  // Normalize query embedding
  const queryNorm = normalizeVector(queryEmbedding)

  // Compare against theme centroids
  const themeScores: ActiveTheme[] = []

  for (const theme of themes) {
    if (!theme.centroid_embedding) continue

    // Normalize centroid
    const centroidNorm = normalizeVector(theme.centroid_embedding)

    // Cosine similarity
    const score = cosineSimilarity(queryNorm, centroidNorm)

    if (score >= minScore) {
      themeScores.push({
        theme_id: theme.theme_id,
        score: score,
      })
    }
  }

  // Sort by score (descending)
  themeScores.sort((a, b) => b.score - a.score)

  return themeScores.slice(0, topN)
}

/**
 * Check if query is ambiguous
 */
export function checkAmbiguity(
  activeThemes: ActiveTheme[],
  threshold: number = 0.6,
  closenessThreshold: number = 0.1
): { isAmbiguous: boolean; reason: string | null } {
  if (activeThemes.length === 0) {
    return { isAmbiguous: true, reason: 'No matching themes found' }
  }

  // Check if top score is below threshold
  if (activeThemes[0].score < threshold) {
    return { isAmbiguous: true, reason: 'Low confidence in theme matching' }
  }

  // Check if top themes are too close (ambiguous)
  if (activeThemes.length >= 2) {
    const scoreDiff = activeThemes[0].score - activeThemes[1].score
    if (scoreDiff < closenessThreshold) {
      return {
        isAmbiguous: true,
        reason: `Multiple themes with similar scores: ${activeThemes[0].theme_id} (${activeThemes[0].score.toFixed(2)}) vs ${activeThemes[1].theme_id} (${activeThemes[1].score.toFixed(2)})`,
      }
    }
  }

  return { isAmbiguous: false, reason: null }
}

/**
 * Select guests based on active themes
 */
export async function selectGuests(
  activeThemes: ActiveTheme[],
  maxGuests: number = 10
): Promise<GuestScore[]> {
  const guestStrengths = await loadGuestThemeStrengths()

  // Calculate guest scores
  const guestScoresMap: Map<string, { score: number; themes: string[] }> = new Map()

  for (const theme of activeThemes) {
    // Find guests with strength in this theme
    for (const [guestId, themeStrengths] of Object.entries(guestStrengths)) {
      if (themeStrengths[theme.theme_id]) {
        const strength = themeStrengths[theme.theme_id].strength
        const weightedScore = theme.score * strength

        if (!guestScoresMap.has(guestId)) {
          guestScoresMap.set(guestId, { score: 0, themes: [] })
        }

        const current = guestScoresMap.get(guestId)!
        current.score += weightedScore
        current.themes.push(theme.theme_id)
      }
    }
  }

  // Convert to array and get guest names
  const guestScores: GuestScore[] = []

  for (const [guestId, data] of guestScoresMap.entries()) {
    // Get guest name from episodes or panels
    const guestName = await getGuestName(guestId)

    guestScores.push({
      guest_id: guestId,
      guest_name: guestName,
      score: data.score,
      contributing_themes: data.themes,
    })
  }

  // Sort by score (descending)
  guestScores.sort((a, b) => b.score - a.score)

  return guestScores.slice(0, maxGuests)
}

/**
 * Get guest name from database
 */
async function getGuestName(guestId: string): Promise<string> {
  // Try to get from episodes first
  const { data: episode } = await supabase
    .from('episodes')
    .select('guest_name')
    .eq('guest_id', guestId)
    .limit(1)
    .single()

  if (episode?.guest_name) {
    return episode.guest_name
  }

  // Fallback to guest_id
  return guestId.replace('guest-', '').replace(/-/g, ' ')
}

/**
 * Normalize a vector
 */
function normalizeVector(vec: number[]): number[] {
  const norm = Math.sqrt(vec.reduce((sum, val) => sum + val * val, 0))
  if (norm === 0) return vec
  return vec.map(val => val / norm)
}

/**
 * Calculate cosine similarity between two vectors
 */
function cosineSimilarity(vec1: number[], vec2: number[]): number {
  if (vec1.length !== vec2.length) {
    throw new Error('Vectors must have the same length')
  }

  let dotProduct = 0
  let norm1 = 0
  let norm2 = 0

  for (let i = 0; i < vec1.length; i++) {
    dotProduct += vec1[i] * vec2[i]
    norm1 += vec1[i] * vec1[i]
    norm2 += vec2[i] * vec2[i]
  }

  return dotProduct / (Math.sqrt(norm1) * Math.sqrt(norm2))
}

