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

  // Generate avatar initials
  const guestInitials = guestName
    ?.split(' ')
    .map(n => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2) || 'G'

  const userInitials = userContext?.name
    ?.split(' ')
    .map(n => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2) || 'U'

  return (
    <div className="min-h-screen bg-cream-100 flex">
      {/* Left Panel: Thread (60%) */}
      <div className="w-full lg:w-[60%] border-r border-charcoal-200 bg-white">
        <div className="sticky top-0 bg-white border-b border-charcoal-200 px-6 py-4 z-10">
          <button
            onClick={onBack}
            className="flex items-center gap-2 text-charcoal-600 hover:text-charcoal-700 transition-colors mb-2"
          >
            <ArrowLeft className="w-4 h-4" />
            <span className="text-sm font-medium">Back to panel</span>
          </button>
          <h2 className="text-xl font-semibold text-charcoal-700">Thread</h2>
        </div>
        
        <div className="p-6 space-y-6">
          {/* Original Question */}
          <div className="editorial-card p-6">
            <div className="flex items-start gap-4">
              <div className="w-10 h-10 rounded-full bg-orange-100 flex items-center justify-center flex-shrink-0">
                <span className="text-orange-600 font-semibold text-sm">
                  {userInitials}
                </span>
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-2">
                  <span className="font-semibold text-charcoal-700">{userContext?.name || 'You'}</span>
                  <span className="text-sm text-charcoal-500">asked</span>
                </div>
                <p className="text-charcoal-700 leading-relaxed">{originalQuery}</p>
              </div>
            </div>
          </div>

          {/* Initial Response */}
          <div className="editorial-card p-6 bg-orange-50/50">
            <div className="flex items-start gap-4">
              <div className="w-10 h-10 rounded-full bg-orange-100 flex items-center justify-center flex-shrink-0">
                <span className="text-orange-600 font-semibold text-sm">
                  {guestInitials}
                </span>
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-2">
                  <span className="font-semibold text-charcoal-700">{guestName}</span>
                  <span className="text-xs text-charcoal-500">From Lenny's Podcast</span>
                </div>
                <p className="text-charcoal-700 leading-relaxed">{previousResponse}</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Right Panel: Private Chat (40%) */}
      <div className="w-full lg:w-[40%] flex flex-col bg-cream-100">
        <div className="sticky top-0 bg-cream-100 border-b border-charcoal-200 px-6 py-4 z-10">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-orange-100 flex items-center justify-center">
              <span className="text-orange-600 font-semibold text-sm">
                {guestInitials}
              </span>
            </div>
            <div>
              <h2 className="font-semibold text-charcoal-700">{guestName}</h2>
              <p className="text-xs text-charcoal-500">Private conversation</p>
            </div>
          </div>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-6 py-6 space-y-4">
          {messages.map((message) => (
            <MessageCard
              key={message.id}
              message={message}
              guestInitials={guestInitials}
              userInitials={userInitials}
            />
        ))}

        {isLoading && (
            <div className="flex items-center gap-2 text-charcoal-500">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span className="text-sm">Thinking...</span>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
        <div className="border-t border-charcoal-200 bg-white px-6 py-4">
        <div className="flex gap-3">
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && handleSend()}
              placeholder="Ask a follow-up question..."
              className="editorial-input flex-1"
            disabled={isLoading}
          />
          <button
            onClick={handleSend}
            disabled={isLoading || !input.trim()}
              className="soft-button disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
              <Send className="w-4 h-4" />
          </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function MessageCard({
  message,
  guestInitials,
  userInitials,
}: {
  message: Message
  guestInitials: string
  userInitials: string
}) {
  const isGuest = message.senderType === 'guest'
  
  return (
    <div className={`editorial-card p-4 ${isGuest ? 'bg-orange-50/50' : ''}`}>
      <div className="flex items-start gap-3">
        <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
          isGuest ? 'bg-orange-100' : 'bg-charcoal-100'
        }`}>
          <span className={`font-semibold text-xs ${
            isGuest ? 'text-orange-600' : 'text-charcoal-600'
          }`}>
            {isGuest ? guestInitials : userInitials}
          </span>
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="font-medium text-sm text-charcoal-700">
              {message.sender}
            </span>
            <span className="text-xs text-charcoal-400">
              {new Date(message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </span>
          </div>
          <p className="text-charcoal-700 text-sm leading-relaxed whitespace-pre-wrap">
            {message.text}
          </p>
        </div>
      </div>
    </div>
  )
}
