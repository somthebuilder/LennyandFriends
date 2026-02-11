import type { ChatMessage } from '@/lib/types/rag'
export type { ChatMessage } from '@/lib/types/rag'

export type ConversationTurn = {
  role: 'user' | 'assistant'
  content: string
}

export async function sendMessage(
  message: string,
  podcastSlug: string,
  conversationHistory: ConversationTurn[] = []
): Promise<ChatMessage> {
  const response = await fetch('/api/chat', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ message, podcastSlug, conversationHistory }),
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
