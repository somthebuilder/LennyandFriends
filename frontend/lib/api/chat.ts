import type { ChatMessage, QuizPath, QuizResponse } from '@/lib/types/rag'
export type { ChatMessage } from '@/lib/types/rag'

export type ConversationTurn = {
  role: 'user' | 'assistant'
  content: string
}

/** Persistent device ID stored in localStorage to strengthen rate limiting */
function getDeviceId(): string {
  const STORAGE_KEY = 'espresso_device_id'
  try {
    let id = localStorage.getItem(STORAGE_KEY)
    if (!id) {
      id = crypto.randomUUID()
      localStorage.setItem(STORAGE_KEY, id)
    }
    return id
  } catch {
    // SSR or localStorage blocked — fall back to empty
    return ''
  }
}

export async function sendMessage(
  message: string,
  podcastSlug: string,
  conversationHistory: ConversationTurn[] = [],
  sessionId?: string
): Promise<ChatMessage> {
  const response = await fetch('/api/chat', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ message, podcastSlug, conversationHistory, sessionId, deviceId: getDeviceId() }),
  })

  const data = await response.json().catch(() => ({}))

  if (!response.ok) {
    const errorMsg =
      typeof data?.error === 'string' ? data.error : 'Failed to send message'
    const error = new Error(errorMsg) as Error & {
      credits_remaining?: number
      credits_total?: number
    }
    error.credits_remaining = data?.credits_remaining
    error.credits_total = data?.credits_total
    throw error
  }

  return data as ChatMessage
}

/** Submit completed quiz answers for recommendation generation */
export async function submitQuiz(
  podcastSlug: string,
  path: QuizPath,
  tags: Record<string, number>,
  topTags: string[]
): Promise<QuizResponse> {
  const response = await fetch('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message: `Lightning Quiz: ${path}`,
      podcastSlug,
      deviceId: getDeviceId(),
      quizMode: { path, tags, topTags },
    }),
  })

  const data = await response.json().catch(() => ({}))

  if (!response.ok) {
    const errorMsg =
      typeof data?.error === 'string' ? data.error : 'Quiz failed'
    throw new Error(errorMsg)
  }

  return data as QuizResponse
}
