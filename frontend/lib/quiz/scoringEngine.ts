import type { QuizOption } from './quizConfig'

/**
 * Accumulate weighted tag scores from all user answers.
 */
export function accumulateScores(answers: QuizOption[]): Record<string, number> {
  const scores: Record<string, number> = {}
  for (const answer of answers) {
    for (const [tag, weight] of Object.entries(answer.tags)) {
      scores[tag] = (scores[tag] ?? 0) + weight
    }
  }
  return scores
}

/**
 * Return the top N tags sorted by score descending.
 */
export function getTopTags(scores: Record<string, number>, count = 5): string[] {
  return Object.entries(scores)
    .sort((a, b) => b[1] - a[1])
    .slice(0, count)
    .map(([tag]) => tag)
}

/* ── Archetype Label Generation ── */

const ARCHETYPE_FRAGMENTS: Record<string, string[]> = {
  // Adjective-style fragments (first position)
  execution: ['Execution-First'],
  strategy: ['Strategic'],
  introspection: ['Reflective'],
  systems: ['Systems-Oriented'],
  ambition: ['High-Ambition'],
  discipline: ['Disciplined'],
  creative: ['Creative'],
  cerebral: ['Cerebral'],
  philosophical: ['Philosophical'],
  data_driven: ['Data-Driven'],
  intuition: ['Intuition-Led'],
  intense: ['High-Intensity'],
  balanced: ['Balanced'],
  practical: ['Practical'],
  modern: ['Modern'],
  classic: ['Timeless'],

  // Noun-style fragments (second position)
  operator: ['Operator'],
  startup: ['Builder'],
  big_tech: ['Scale Operator'],
  storytelling: ['Storyteller'],
  emotional: ['Empath'],
  intellectual: ['Thinker'],
}

/**
 * Generate a two-word archetype label from the user's top tags.
 * e.g. "Strategic Systems-Oriented Builder"
 */
export function generateArchetypeLabel(topTags: string[]): string {
  if (topTags.length === 0) return 'Curious Explorer'

  // Pick the best adjective (from first 2 tags) and best noun (from remaining)
  const adjCandidates = ['execution', 'strategy', 'introspection', 'systems', 'ambition',
    'discipline', 'creative', 'cerebral', 'philosophical', 'data_driven', 'intuition',
    'intense', 'balanced', 'practical', 'modern', 'classic']
  const nounCandidates = ['operator', 'startup', 'big_tech', 'storytelling', 'emotional', 'intellectual']

  let adjective = ''
  let noun = ''

  for (const tag of topTags) {
    if (!adjective && adjCandidates.includes(tag) && ARCHETYPE_FRAGMENTS[tag]) {
      adjective = ARCHETYPE_FRAGMENTS[tag][0]
    }
    if (!noun && nounCandidates.includes(tag) && ARCHETYPE_FRAGMENTS[tag]) {
      noun = ARCHETYPE_FRAGMENTS[tag][0]
    }
    if (adjective && noun) break
  }

  if (!adjective && !noun) return 'Curious Explorer'
  if (!adjective) return noun
  if (!noun) return `${adjective} Mind`

  return `${adjective} ${noun}`
}
