'use client'

import { useState, useRef, useEffect } from 'react'
import { Send, ArrowLeft, Loader2 } from 'lucide-react'
import axios from 'axios'

interface Message {
  id: string
  sender: string
  senderType: 'user' | 'guest'
  text: string
  timestamp: Date
}

interface UserContext {
  name: string
  role?: string
  company?: string
  interests?: string
  goals?: string
}

export default function SplitChat({
  guestId,
  guestName,
  originalQuery,
  previousResponse,
  userContext,
  onBack,
}: {
  guestId: string
  guestName: string
  originalQuery: string
  previousResponse: string
  userContext: UserContext | null
  onBack: () => void
}) {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: '1',
      sender: userContext?.name || 'You',
      senderType: 'user',
      text: originalQuery,
      timestamp: new Date(),
    },
    {
      id: '2',
      sender: guestName,
      senderType: 'guest',
      text: previousResponse,
      timestamp: new Date(),
    },
  ])
  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    scrollToBottom()
    inputRef.current?.focus()
  }, [messages])

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  const addMessage = (message: Omit<Message, 'id' | 'timestamp'>) => {
    setMessages((prev) => [
      ...prev,
      {
        ...message,
        id: Date.now().toString(),
        timestamp: new Date(),
      },
    ])
  }

  const handleSend = async () => {
    const query = input.trim()
    if (!query || isLoading) return

    addMessage({
      sender: userContext?.name || 'You',
      senderType: 'user',
      text: query,
    })

    setInput('')
    setIsLoading(true)

    try {
      const response = await axios.post('/api/split-chat', {
        query,
        guest_id: guestId,
        original_query: originalQuery,
        previous_response: previousResponse,
        user_context: userContext ? {
          role: userContext.role,
          company: userContext.company,
          interests: userContext.interests,
          goals: userContext.goals,
        } : undefined,
      })

      addMessage({
        sender: guestName,
        senderType: 'guest',
        text: response.data.response,
      })
    } catch (error) {
      console.error('Error sending message:', error)
      addMessage({
        sender: guestName,
        senderType: 'guest',
        text: 'Sorry, I encountered an error. Please try again.',
      })
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="flex flex-col h-screen bg-gradient-to-br from-warm-50 via-fire-50 to-flame-50">
      {/* Header */}
      <header className="bg-white/90 backdrop-blur-sm border-b border-fire-200 px-6 py-4 shadow-sm">
        <div className="flex items-center gap-4">
          <button
            onClick={onBack}
            className="p-2 hover:bg-fire-50 rounded-lg transition-colors"
          >
            <ArrowLeft className="w-5 h-5 text-fire-600" />
          </button>
          <div>
            <h1 className="text-xl font-bold text-log-800">{guestName}</h1>
            <p className="text-sm text-log-500">1:1 conversation</p>
          </div>
        </div>
      </header>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
        {messages.map((message) => (
          <div
            key={message.id}
            className={`flex ${message.senderType === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className={`max-w-2xl rounded-2xl px-4 py-3 ${
                message.senderType === 'user'
                  ? 'fire-gradient text-white shadow-lg'
                  : 'bg-white text-log-800 border border-fire-200 shadow-sm'
              }`}
            >
              <div className="flex items-center gap-2 mb-1">
                <span
                  className={`font-semibold text-sm ${
                    message.senderType === 'user'
                      ? 'text-white'
                      : 'text-fire-600'
                  }`}
                >
                  {message.sender}
                </span>
              </div>
              <p className="whitespace-pre-wrap">{message.text}</p>
            </div>
          </div>
        ))}

        {isLoading && (
          <div className="flex items-center gap-2 text-log-600">
            <Loader2 className="w-4 h-4 animate-spin text-fire-500" />
            <span>{guestName} is thinking...</span>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="bg-white/90 backdrop-blur-sm border-t border-fire-200 px-6 py-4">
        <div className="flex gap-3">
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && handleSend()}
            placeholder={`Ask ${guestName} a follow-up question...`}
            className="flex-1 px-4 py-3 border border-fire-200 rounded-lg focus:ring-2 focus:ring-fire-500 focus:border-fire-400 outline-none bg-white text-log-800 placeholder-log-400"
            disabled={isLoading}
          />
          <button
            onClick={handleSend}
            disabled={isLoading || !input.trim()}
            className="px-6 py-3 fire-gradient text-white rounded-lg font-semibold hover:opacity-90 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 shadow-lg hover:shadow-xl"
          >
            <Send className="w-5 h-5" />
            Send
          </button>
        </div>
      </div>
    </div>
  )
}

