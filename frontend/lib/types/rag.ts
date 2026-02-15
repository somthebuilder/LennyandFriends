export type SignalBadge = 'high_consensus' | 'split_view' | 'emerging'
export type InsightTrend = 'stable' | 'emerging' | 'fading'

export interface ChatReference {
  guest_name: string
  episode_title: string
  quote?: string
  timestamp?: string
  episode_url?: string
  time_seconds?: number
}

export interface ClarificationQuestion {
  text: string
  quickReply?: string
}

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  references?: ChatReference[]
  needs_clarification?: boolean
  clarification_questions?: ClarificationQuestion[]
  credits_remaining?: number
  credits_total?: number
  session_id?: string
}

export interface ConceptReference {
  guest_name: string
  guest_role?: string
  episode_title: string
  episode_url?: string
  timestamp?: string
  time_seconds?: number
  quote?: string
}

export interface Concept {
  id: string
  title: string
  body: string
  summary?: string
  slug: string
  category?: string
  theme_label?: string
  guest_count?: number
  episode_count?: number
  valuable_count: number
  created_at: string
  references?: ConceptReference[]
}

export interface InsightReference {
  guest_name: string
  guest_role?: string
  episode_title: string
  episode_url?: string
  timestamp?: string
  time_seconds?: number
  quote?: string
}

export interface Insight {
  id: string
  title: string
  takeaway: string
  signal: SignalBadge
  category?: string
  theme_label?: string
  guest_count: number
  episode_count: number
  explanation: string[]
  evidence: InsightReference[]
  trend?: InsightTrend
  valuable_count: number
  created_at: string
}

export const SIGNAL_LABELS: Record<SignalBadge, string> = {
  high_consensus: 'High consensus',
  split_view: 'Split view',
  emerging: 'Emerging',
}

/* ── Lightning Quiz Types ── */

export type QuizPath = 'book' | 'show' | 'mentor' | 'surprise'

export interface QuizPick {
  title: string
  author?: string
  why: string
  what_it_changes?: string
  guest_attribution?: string
}

export interface QuizResult {
  archetype: string
  top_pick: QuizPick
  alternative: QuizPick
  stretch_pick: QuizPick
}

export interface QuizResponse {
  id: string
  role: 'assistant'
  quiz_result: QuizResult
  quiz_path: QuizPath
  quiz_credits_remaining: number
  quiz_credits_total: number
  session_id?: string
}
