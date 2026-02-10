import type { ChatMessage } from '@/lib/types/rag'
export type { ChatMessage } from '@/lib/types/rag'

export async function sendMessage(message: string, podcastSlug: string): Promise<ChatMessage> {
  const response = await fetch('/api/chat', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ message, podcastSlug }),
  })

  if (!response.ok) {
    throw new Error('Failed to send message')
  }

  return response.json()
}

