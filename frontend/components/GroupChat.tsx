'use client'

import { useState, useRef, useEffect, useMemo } from 'react'
import { Send, Users, Loader2, AlertCircle, CheckCircle2 } from 'lucide-react'
import axios from 'axios'

interface Message {
  id: string
  sender: string
  senderType: 'user' | 'lenny' | 'guest'
  text: string
  timestamp: Date
  guestId?: string
  guestName?: string
  isStreaming?: boolean
}

interface GuestResponse {
  guest_id: string
  guest_name: string
  response: string
  confidence: number
  source_chunks?: string[]
}

interface QueryResponse {
  needs_clarification: boolean
  clarification_questions?: string[]
  guest_responses?: GuestResponse[]
  active_themes?: Array<{ theme_id: string; score: number }>
}

interface UserContext {
  name: string
  role?: string
  company?: string
  interests?: string
  goals?: string
}

export default function GroupChat({
  userContext,
  onGuestClick,
}: {
  userContext: UserContext | null
  onGuestClick: (
    guestId: string,
    guestName: string,
    originalQuery: string,
    previousResponse: string
  ) => void
}) {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [clarificationQuestions, setClarificationQuestions] = useState<string[]>([])
  const [waitingForClarification, setWaitingForClarification] = useState(false)
  const [pendingQuery, setPendingQuery] = useState('')
  const [apiStatus, setApiStatus] = useState<'checking' | 'online' | 'offline'>('checking')
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  useEffect(() => {
    scrollToBottom()
  }, [messages])

  // Check API status on mount
  useEffect(() => {
    const checkApiStatus = async () => {
      try {
        await axios.get('/api/health', { timeout: 3000 })
        setApiStatus('online')
      } catch (error) {
        setApiStatus('offline')
      }
    }
    checkApiStatus()
    // Check every 30 seconds
    const interval = setInterval(checkApiStatus, 30000)
    return () => clearInterval(interval)
  }, [])

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

  const handleSend = async (text?: string) => {
    const query = text || input.trim()
    if (!query || isLoading) return

    // Add user message
    addMessage({
      sender: userContext?.name || 'You',
      senderType: 'user',
      text: query,
    })

    setInput('')
    setIsLoading(true)
    setWaitingForClarification(false)

    try {
      const response = await axios.post<QueryResponse>('/api/query', {
        query,
        user_name: userContext?.name || 'User',
        user_context: userContext ? {
          role: userContext.role,
          company: userContext.company,
          interests: userContext.interests,
          goals: userContext.goals,
        } : undefined,
        clarification: waitingForClarification ? input : null,
      })

      if (response.data.needs_clarification) {
        // Lenny needs clarification
        setClarificationQuestions(response.data.clarification_questions || [])
        setWaitingForClarification(true)
        setPendingQuery(query)
        
        addMessage({
          sender: 'Lenny',
          senderType: 'lenny',
          text: `I need a bit more context. ${response.data.clarification_questions?.join(' ')}`,
        })
      } else if (response.data.guest_responses) {
        // Add Lenny's intro message
        addMessage({
          sender: 'Lenny',
          senderType: 'lenny',
          text: `Great question! Let me bring in some guests who can help...`,
        })

        // Add guest responses
        response.data.guest_responses.forEach((guestResp, index) => {
          setTimeout(() => {
            addMessage({
              sender: guestResp.guest_name,
              senderType: 'guest',
              text: guestResp.response,
              guestId: guestResp.guest_id,
              guestName: guestResp.guest_name,
            })
          }, index * 500) // Stagger responses
        })
      }
    } catch (error: any) {
      console.error('Error sending query:', error)
      const errorMessage = error.response?.status === 503
        ? 'The knowledge base is still being built. Please wait for it to complete.'
        : error.response?.status === 404
        ? 'API endpoint not found. Make sure the backend is running.'
        : 'Sorry, I encountered an error. Please try again.'
      
      addMessage({
        sender: 'Lenny',
        senderType: 'lenny',
        text: errorMessage,
      })
    } finally {
      setIsLoading(false)
    }
  }

  const handleGuestMessageClick = (message: Message) => {
    if (message.guestId && message.guestName) {
      // Find the original user query
      const userMessages = messages.filter(m => m.senderType === 'user')
      const originalQuery = userMessages[userMessages.length - 1]?.text || ''
      
      onGuestClick(
        message.guestId,
        message.guestName,
        originalQuery,
        message.text
      )
    }
  }

  // Calculate member count
  const memberCount = useMemo(() => {
    const uniqueGuests = new Set<string>()
    messages.forEach(msg => {
      if (msg.senderType === 'guest' && msg.guestId) {
        uniqueGuests.add(msg.guestId)
      }
    })
    return uniqueGuests.size
  }, [messages])

  return (
    <div className="flex flex-col h-screen bg-gradient-to-br from-warm-50 via-fire-50 to-flame-50">
      {/* Header */}
      <header className="bg-white/90 backdrop-blur-sm border-b border-fire-200 px-6 py-4 shadow-sm">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img 
              src="/lennylogo.svg" 
              alt="Lenny and Friends" 
              className="h-8 w-auto"
            />
            <div>
              <h1 className="text-2xl font-bold bg-gradient-to-r from-fire-600 to-flame-600 bg-clip-text text-transparent">
                Lenny & Friends
              </h1>
              <div className="flex items-center gap-2 text-sm text-log-500 mt-0.5">
                <Users className="w-4 h-4" />
                <span>
                  Members: You, Lenny{memberCount > 0 ? ` and ${memberCount} other${memberCount !== 1 ? 's' : ''}` : ''}
                </span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-4">
            {apiStatus === 'checking' && (
              <div className="flex items-center gap-2 text-gray-500 text-sm">
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Checking API...</span>
              </div>
            )}
            {apiStatus === 'online' && (
              <div className="flex items-center gap-2 text-fire-600 text-sm">
                <CheckCircle2 className="w-4 h-4" />
                <span>API Online</span>
              </div>
            )}
            {apiStatus === 'offline' && (
              <div className="flex items-center gap-2 text-red-500 text-sm">
                <AlertCircle className="w-4 h-4" />
                <span>API Offline</span>
              </div>
            )}
            <div className="text-sm text-log-600 font-medium">
              {userContext?.name || 'User'}
            </div>
          </div>
        </div>
      </header>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
        {messages.length === 0 && (
          <div className="text-center text-log-600 mt-20">
            <img 
              src="/lennylogo.svg" 
              alt="Lenny and Friends" 
              className="h-16 w-auto mx-auto mb-4 opacity-60"
            />
            <p className="text-lg mb-2 font-semibold text-log-700">👋 Welcome, {userContext?.name || 'there'}!</p>
            <p className="text-log-500">Ask a question and get responses from Lenny's Podcast guests</p>
          </div>
        )}

        {messages.map((message) => (
          <MessageBubble
            key={message.id}
            message={message}
            onGuestClick={handleGuestMessageClick}
          />
        ))}

        {isLoading && (
          <div className="flex items-center gap-2 text-log-600">
            <Loader2 className="w-4 h-4 animate-spin text-fire-500" />
            <span>Thinking...</span>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="bg-white/90 backdrop-blur-sm border-t border-fire-200 px-6 py-4">
        {waitingForClarification && (
          <div className="mb-3 p-3 bg-flame-50 border border-flame-200 rounded-lg">
            <p className="text-sm text-flame-800 font-medium mb-2">Lenny's Questions:</p>
            <ul className="list-disc list-inside text-sm text-flame-700 space-y-1">
              {clarificationQuestions.map((q, i) => (
                <li key={i}>{q}</li>
              ))}
            </ul>
          </div>
        )}
        <div className="flex gap-3">
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && handleSend()}
            placeholder={waitingForClarification ? "Answer Lenny's questions..." : "Ask a question..."}
            className="flex-1 px-4 py-3 border border-fire-200 rounded-lg focus:ring-2 focus:ring-fire-500 focus:border-fire-400 outline-none bg-white text-log-800 placeholder-log-400"
            disabled={isLoading}
          />
          <button
            onClick={() => handleSend()}
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

function MessageBubble({
  message,
  onGuestClick,
}: {
  message: Message
  onGuestClick: (message: Message) => void
}) {
  const isGuest = message.senderType === 'guest'
  const isLenny = message.senderType === 'lenny'
  const isUser = message.senderType === 'user'

  return (
    <div
      className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}
    >
      <div
        className={`max-w-2xl rounded-2xl px-4 py-3 ${
          isUser
            ? 'fire-gradient text-white shadow-lg'
            : isLenny
            ? 'bg-flame-100 text-flame-900 border border-flame-300 shadow-sm'
            : 'bg-white text-log-800 border border-fire-200 shadow-sm hover:shadow-md hover:border-fire-300 transition-all cursor-pointer'
        }`}
        onClick={isGuest ? () => onGuestClick(message) : undefined}
      >
        <div className="flex items-center gap-2 mb-1">
          <span className={`font-semibold text-sm ${
            isUser ? 'text-white' : isLenny ? 'text-flame-800' : 'text-fire-600'
          }`}>
            {message.sender}
          </span>
          {isGuest && (
            <span className="text-xs text-log-500">(click to chat 1:1)</span>
          )}
        </div>
        <p className="whitespace-pre-wrap">{message.text}</p>
      </div>
    </div>
  )
}

