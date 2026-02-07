// Panel Page Types - Based on Product Specification

export type AgreementLevel = 'consensus' | 'moderate_disagreement' | 'strong_disagreement' | 'nuanced'

export interface Expert {
  id: string
  name: string
  title: string
  company: string
  avatar?: string
  bio?: string
  episodes?: string[]
  topics?: string[]
}

export interface Perspective {
  id: string
  discussionId: string
  expertId: string
  expertName: string
  expertTitle: string
  expertCompany: string
  expertAvatar?: string
  content: string
  episodeId: string
  episodeTitle: string
  episodeNumber: number
  timestamp: string
  audioUrl?: string
}

export interface KeyTakeaway {
  text: string
  type: 'consensus' | 'nuanced' | 'actionable'
}

export interface Discussion {
  id: string
  panelId: string
  title: string
  order: number
  agreementLevel: AgreementLevel
  perspectives: Perspective[]
  keyTakeaways: KeyTakeaway[]
  metadata: {
    viewCount: number
    expandCount: number
  }
}

export interface Panel {
  id: string
  slug: string
  title: string
  description: string
  shortDescription: string
  category: string
  experts: Expert[]
  discussions: Discussion[]
  metadata: {
    createdAt: string
    updatedAt: string
    viewCount: number
    valuableCount: number
  }
}

export interface PanelValuable {
  id: string
  panelId: string
  userId: string
  markedAt: string
}

export interface UserQuestion {
  id: string
  panelId: string
  questionText: string
  mentionedExpertIds: string[] | null // null means @Panel (all experts)
  userId: string
  responses: QuestionResponse[]
  metadata: {
    askedAt: string
    responseTime: number
  }
}

export interface QuestionResponse {
  id: string
  questionId: string
  expertId: string
  expertName: string
  expertTitle: string
  expertCompany: string
  expertAvatar?: string
  responseText: string
  sourceChunks: string[]
  episodeReferences: Array<{
    episodeId: string
    episodeTitle: string
    episodeNumber: number
    timestamp: string
  }>
  confidence: number
}

export interface PanelConsensus {
  summary: string
  agreeingExpertIds: string[]
}

export type QuickFilter = 'all' | 'disagreements' | 'consensus' | 'actionable'

export type PanelTab = 'discussion' | 'ask'

