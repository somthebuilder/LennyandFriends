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
}

export interface ConceptReference {
  guest_name: string
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
  created_at: string
  references?: ConceptReference[]
}

export interface InsightReference {
  guest_name: string
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
  created_at: string
}

export const SIGNAL_LABELS: Record<SignalBadge, string> = {
  high_consensus: 'High consensus',
  split_view: 'Split view',
  emerging: 'Emerging',
}
