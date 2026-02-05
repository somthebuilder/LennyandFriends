'use client'

import { useState, useRef, useEffect, useMemo } from 'react'
import { Send, Loader2, ArrowRight, Home, Users } from 'lucide-react'
import axios from 'axios'
import Link from 'next/link'

interface Message {
  id: string
  sender: string
  senderType: 'user' | 'lenny' | 'guest'
  text: string
  timestamp: Date
  guestId?: string
  guestName?: string
  guestCompany?: string
  guestRole?: string
  episodeInfo?: string
  isStreaming?: boolean
}

interface GuestResponse {
  guest_id: string
  guest_name: string
  response: string
  confidence: number
  source_chunks?: string[]
  company?: string
  role?: string
  episode_info?: string
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
  onBack,
  podcastName = "Lenny's Podcast",
}: {
  userContext: UserContext | null
  onGuestClick: (
    guestId: string,
    guestName: string,
    originalQuery: string,
    previousResponse: string
  ) => void
  onBack?: () => void
  podcastName?: string
}) {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [clarificationQuestions, setClarificationQuestions] = useState<string[]>([])
  const [waitingForClarification, setWaitingForClarification] = useState(false)
  const [pendingQuery, setPendingQuery] = useState('')
  const [currentQuestion, setCurrentQuestion] = useState<string>('')
  const [showMobileParticipants, setShowMobileParticipants] = useState(false)
  const [systemStatus, setSystemStatus] = useState<string>('')
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  useEffect(() => {
    scrollToBottom()
  }, [messages])

  const addMessage = (message: Omit<Message, 'id' | 'timestamp'>) => {
    setMessages((prev) => [
      ...prev,
      {
        ...message,
        id: Date.now().toString() + Math.random(),
        timestamp: new Date(),
      },
    ])
  }

  const handleSend = async (text?: string) => {
    const query = text || input.trim()
    if (!query || isLoading) return

    // If waiting for clarification, treat as clarification response
    if (waitingForClarification) {
      addMessage({
        sender: userContext?.name || 'You',
        senderType: 'user',
        text: query,
      })
      setInput('')
      setWaitingForClarification(false)
      // Continue with the pending query
      await processQuery(pendingQuery, query)
      return
    }

    // Store the current question
    setCurrentQuestion(query)

    // Add user message
    addMessage({
      sender: userContext?.name || 'You',
      senderType: 'user',
      text: query,
    })

    setInput('')
    await processQuery(query)
  }

  const processQuery = async (query: string, clarification?: string) => {
    setIsLoading(true)
    setSystemStatus('Analyzing your question...')

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
        clarification: clarification || null,
      })

      if (response.data.needs_clarification) {
        setSystemStatus('')
        setClarificationQuestions(response.data.clarification_questions || [])
        setWaitingForClarification(true)
        setPendingQuery(query)
        
        addMessage({
        sender: 'Lenny bot',
        senderType: 'lenny',
        text: `Great question! To give you the best perspectives, can you tell me:\n\n${response.data.clarification_questions?.map((q, i) => `${i + 1}. ${q}`).join('\n')}`,
        })
      } else if (response.data.guest_responses) {
        setSystemStatus('')
        
        // Add Lenny bot's intro message
        setTimeout(() => {
        addMessage({
          sender: 'Lenny bot',
          senderType: 'lenny',
            text: `Perfect. Let me bring in some experts who've navigated exactly this...`,
        })
        }, 500)

        // Add guest responses with staggered timing
        response.data.guest_responses.forEach((guestResp, index) => {
          setTimeout(() => {
            addMessage({
              sender: guestResp.guest_name,
              senderType: 'guest',
              text: guestResp.response,
              guestId: guestResp.guest_id,
              guestName: guestResp.guest_name,
              guestCompany: guestResp.company,
              guestRole: guestResp.role,
              episodeInfo: guestResp.episode_info,
            })
          }, 1500 + (index * 600))
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
        sender: 'Lenny bot',
        senderType: 'lenny',
        text: errorMessage,
      })
      setSystemStatus('')
    } finally {
      setIsLoading(false)
    }
  }

  const handleGuestMessageClick = (message: Message) => {
    if (message.guestId && message.guestName) {
      onGuestClick(
        message.guestId,
        message.guestName,
        currentQuestion,
        message.text
      )
    }
  }

  // Get active guests from messages
  const activeGuests = useMemo(() => {
    const guests = new Map<string, Message>()
    messages.forEach(msg => {
      if (msg.senderType === 'guest' && msg.guestId && msg.guestName) {
        if (!guests.has(msg.guestId)) {
          guests.set(msg.guestId, msg)
        }
      }
    })
    return Array.from(guests.values())
  }, [messages])

  const userInitials = userContext?.name
    ?.split(' ')
    .map(n => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2) || 'U'

  // Generate contextual questions based on podcast and user context
  const generateExampleQuestions = () => {
    const baseQuestions = {
      "lennyandfriends": [
        "Should I hire a designer or PM first?",
        "How do I price a B2B SaaS product?",
        "What metrics should I track at seed stage?",
        "How do I transition from IC to manager?",
      ],
      "default": [
        "What's your take on building a strong team culture?",
        "How do you approach market validation?",
        "What strategies work for early customer acquisition?",
        "How do you balance growth with sustainability?",
      ]
    }

    // Get podcast-specific questions or default
    let questions = baseQuestions["default"]
    
    if (podcastName.toLowerCase().includes("lenny")) {
      questions = baseQuestions["lennyandfriends"]
    }

    // Personalize based on user's role and interests if available
    if (userContext?.role && userContext?.interests) {
      const role = userContext.role.toLowerCase()
      const interests = userContext.interests.toLowerCase()
      
      // Add contextual questions based on role
      if (role.includes('founder') || role.includes('ceo')) {
        questions = [
          `What advice do you have for ${userContext.role}s on ${interests}?`,
          ...questions.slice(0, 3)
        ]
      } else if (role.includes('product') || role.includes('pm')) {
        questions = [
          `How should ${userContext.role}s approach ${interests}?`,
          ...questions.slice(0, 3)
        ]
      } else if (userContext.role) {
        questions = [
          `What strategies work best for ${userContext.role}s regarding ${interests}?`,
          ...questions.slice(0, 3)
        ]
      }
    }

    return questions
  }

  const exampleQuestions = generateExampleQuestions()

  const hasMessages = messages.length > 0
  const hasGuestResponses = activeGuests.length > 0

  return (
    <div className="flex flex-col h-screen bg-cream-100">
      {/* Redesigned Header Bar */}
      <header className="bg-white border-b border-charcoal-200 px-4 md:px-6 py-3 md:py-4">
        <div className="flex items-center justify-between">
          {/* Left: Logo */}
          <Link href="/" className="hover:opacity-80 transition-opacity flex-shrink-0">
            <img 
              src="/panelchat-logo.svg" 
              alt="Panel Chat"
              className="h-6 md:h-8 w-auto"
            />
          </Link>

          {/* Center: Podcast Name and Experts (Centrally Aligned) */}
          <div className="absolute left-1/2 transform -translate-x-1/2 text-center">
            <h1 className="text-base md:text-lg font-semibold text-charcoal-700">{podcastName}</h1>
            <p className="text-xs text-charcoal-500">200+ experts</p>
          </div>

          {/* Right: Actions */}
          <div className="flex items-center gap-2 flex-shrink-0">
            {/* Mobile: Participants Toggle */}
            <button
              onClick={() => setShowMobileParticipants(!showMobileParticipants)}
              className="lg:hidden flex items-center gap-2 px-3 py-2 text-sm text-charcoal-600 hover:bg-charcoal-50 rounded-lg transition-colors"
              aria-label="Toggle participants"
            >
              <Users className="w-4 h-4" />
              {hasGuestResponses && (
                <span className="bg-orange-500 text-white text-xs font-semibold rounded-full w-5 h-5 flex items-center justify-center">
                  {activeGuests.length}
                </span>
              )}
            </button>

            {/* Home Button */}
            {onBack && (
              <button
                onClick={onBack}
                className="flex items-center gap-2 px-3 md:px-4 py-2 text-sm text-charcoal-600 hover:bg-charcoal-50 rounded-lg transition-colors"
              >
                <Home className="w-4 h-4" />
                <span className="hidden md:inline">Home</span>
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Mobile Participants Drawer Overlay */}
      {showMobileParticipants && (
        <div 
          className="lg:hidden fixed inset-0 bg-black bg-opacity-50 z-40"
          onClick={() => setShowMobileParticipants(false)}
        />
      )}

      {/* Mobile Participants Drawer */}
      <div 
        className={`lg:hidden fixed top-0 right-0 h-full w-80 max-w-[85vw] bg-white shadow-xl z-50 transform transition-transform duration-300 ease-in-out ${
          showMobileParticipants ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        <div className="flex flex-col h-full">
          {/* Drawer Header */}
          <div className="p-4 border-b border-charcoal-200 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-charcoal-700 flex items-center gap-2">
              <Users className="w-5 h-5" />
              Participants
            </h2>
            <button
              onClick={() => setShowMobileParticipants(false)}
              className="p-2 hover:bg-charcoal-50 rounded-lg transition-colors"
              aria-label="Close participants"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Drawer Content */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {/* You */}
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-orange-100 border-2 border-orange-300 flex items-center justify-center flex-shrink-0">
                <span className="text-orange-600 font-semibold text-sm">{userInitials}</span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-charcoal-700 truncate">{userContext?.name || 'You'}</p>
              </div>
            </div>

            <div className="border-t border-charcoal-200 my-4" />

            {/* Lenny bot */}
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-orange-100 border-2 border-orange-300 flex items-center justify-center flex-shrink-0">
                <span className="text-orange-600 font-semibold text-sm">LB</span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-charcoal-700 truncate">Lenny bot</p>
                <p className="text-xs text-charcoal-500">Moderator</p>
              </div>
            </div>

            <div className="border-t border-charcoal-200 my-4" />

            <div className="text-center py-2">
              <p className="text-xs text-charcoal-500 mb-2">200+ Experts</p>
              <p className="text-xs text-charcoal-400">Ready to respond to your questions</p>
            </div>

            {/* Active Guests */}
            {hasGuestResponses && (
              <>
                <div className="border-t border-charcoal-200 my-4" />
                <div className="mb-2">
                  <p className="text-xs text-charcoal-500 uppercase tracking-wide mb-3">
                    Active in this chat:
                  </p>
                  {activeGuests.map((guest) => {
                    const initials = guest.guestName
                      ?.split(' ')
                      .map(n => n[0])
                      .join('')
                      .toUpperCase()
                      .slice(0, 2) || 'G'
                    return (
                      <div key={guest.id} className="flex items-center gap-3 mb-3">
                        <div className="w-10 h-10 rounded-full bg-orange-100 border-2 border-orange-300 flex items-center justify-center flex-shrink-0">
                          <span className="text-orange-600 font-semibold text-sm">{initials}</span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-charcoal-700 truncate">{guest.guestName}</p>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Left Sidebar: Participants Panel - Hidden on mobile, collapsible on tablet/desktop */}
        <div className="hidden lg:flex lg:w-1/5 bg-white border-r border-charcoal-200 flex-col">
          <div className="p-4 border-b border-charcoal-200">
            <h2 className="text-sm font-semibold text-charcoal-700 uppercase tracking-wide flex items-center gap-2">
                <Users className="w-4 h-4" />
              Participants
            </h2>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {/* You */}
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-orange-100 border-2 border-orange-300 flex items-center justify-center flex-shrink-0">
                <span className="text-orange-600 font-semibold text-sm">{userInitials}</span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-charcoal-700 truncate">{userContext?.name || 'You'}</p>
              </div>
            </div>

            <div className="border-t border-charcoal-200 my-4" />

            {/* Lenny bot */}
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-orange-100 border-2 border-orange-300 flex items-center justify-center flex-shrink-0">
                <span className="text-orange-600 font-semibold text-sm">LB</span>
          </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-charcoal-700">Lenny bot</p>
                <p className="text-xs text-charcoal-500">Moderator</p>
              </div>
            </div>

            <div className="border-t border-charcoal-200 my-4" />

            {/* Guests Count */}
            {!hasGuestResponses && (
              <div className="text-center py-4">
                <p className="text-2xl font-bold text-orange-600">+200</p>
                <p className="text-xs text-charcoal-500 mt-1">Guests</p>
                <p className="text-xs text-charcoal-400 mt-2">Ready to respond</p>
              </div>
            )}

            {/* Active Guests */}
            {hasGuestResponses && (
              <>
                <div className="mb-2">
                  <p className="text-xs text-charcoal-500 uppercase tracking-wide mb-3">
                    Active in this chat:
                  </p>
                  {activeGuests.slice(0, 3).map((guest) => {
                    const initials = guest.guestName
                      ?.split(' ')
                      .map(n => n[0])
                      .join('')
                      .toUpperCase()
                      .slice(0, 2) || 'G'
                    return (
                      <div key={guest.id} className="flex items-center gap-3 mb-3">
                        <div className="w-10 h-10 rounded-full bg-orange-100 border-2 border-orange-300 flex items-center justify-center flex-shrink-0">
                          <span className="text-orange-600 font-semibold text-sm">{initials}</span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-charcoal-700 truncate">{guest.guestName}</p>
                        </div>
                      </div>
                    )
                  })}
                  {activeGuests.length > 3 && (
                    <p className="text-xs text-charcoal-400 mt-2">+{activeGuests.length - 3} more</p>
                  )}
              </div>
              </>
            )}
          </div>
        </div>

        {/* Main Chat Area - Full width on mobile, adapts for desktop */}
        <div className="flex-1 flex flex-col bg-cream-100">
          {/* Messages Area */}
          <div className="flex-1 overflow-y-auto px-4 md:px-6 py-6 space-y-6">
            {!hasMessages && (
              /* Initial State */
              <div className="flex flex-col items-center justify-center h-full text-center space-y-8 max-w-2xl mx-auto">
                <div className="space-y-4">
                  <h2 className="text-3xl font-semibold text-charcoal-700">
                    Welcome to {podcastName} Panel
                  </h2>
                  <p className="text-charcoal-600 text-lg">
                    Ask questions and hear perspectives from 200+ experts featured on {podcastName}.
                  </p>
                </div>

                <div className="border-t border-charcoal-200 w-full pt-6">
                  <p className="text-sm text-charcoal-500 mb-4">Try asking:</p>
                  <div className="space-y-3 text-left">
                    {exampleQuestions.map((q, i) => (
                      <div 
                        key={i} 
                        onClick={() => setInput(q)}
                        className="text-sm text-charcoal-600 hover:text-orange-600 cursor-pointer transition-colors p-3 rounded-lg hover:bg-orange-50"
                      >
                        💡 {q}
                      </div>
                    ))}
                  </div>
                </div>
          </div>
        )}

            {/* Messages */}
        {messages.map((message) => (
          <MessageBubble
            key={message.id}
            message={message}
            onGuestClick={handleGuestMessageClick}
                userInitials={userInitials}
          />
        ))}

            {/* System Status */}
            {systemStatus && (
              <div className="flex items-center gap-2 text-sm text-charcoal-500">
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>{systemStatus}</span>
              </div>
            )}

            {/* Loading State */}
            {isLoading && !systemStatus && (
              <div className="flex items-center gap-2 text-charcoal-500">
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Gathering perspectives from past guests…</span>
              </div>
            )}

            {/* After All Responses */}
            {hasGuestResponses && !isLoading && (
              <div className="border-t border-charcoal-200 pt-6 mt-6">
                <p className="text-sm text-charcoal-600 mb-2">
                  💡 That's {activeGuests.length} different perspective{activeGuests.length !== 1 ? 's' : ''} on your question.
                </p>
                <p className="text-xs text-charcoal-500">
                  You can: Click any response to continue 1:1 with that guest • Ask a follow-up question to everyone • Start a new conversation
                </p>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

          {/* Input Area */}
          <div className="border-t border-charcoal-200 bg-white px-4 md:px-6 py-4">
        <div className="flex gap-3">
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && handleSend()}
                placeholder={waitingForClarification ? "Answer Lenny bot's questions..." : "Ask your question..."}
                className="editorial-input flex-1"
            disabled={isLoading}
          />
          <button
            onClick={() => handleSend()}
            disabled={isLoading || !input.trim()}
                className="soft-button disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
                <Send className="w-4 h-4" />
                <span className="hidden md:inline">Send</span>
          </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function MessageBubble({
  message,
  onGuestClick,
  userInitials,
}: {
  message: Message
  onGuestClick: (message: Message) => void
  userInitials: string
}) {
  const isUser = message.senderType === 'user'
  const isLenny = message.senderType === 'lenny'
  const isGuest = message.senderType === 'guest'

  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map(n => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2)
  }

  if (isUser) {
  return (
      <div className="flex justify-end">
        <div className="max-w-2xl">
          <div className="flex items-center gap-2 justify-end mb-1">
            <span className="text-xs text-charcoal-400">
              {new Date(message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </span>
            <span className="text-sm font-medium text-charcoal-700">{message.sender}</span>
            <div className="w-8 h-8 rounded-full bg-orange-100 border-2 border-orange-300 flex items-center justify-center">
              <span className="text-orange-600 font-semibold text-xs">{userInitials}</span>
            </div>
          </div>
          <div className="editorial-card p-4 bg-orange-50 border border-orange-200">
            <p className="whitespace-pre-wrap text-charcoal-700">{message.text}</p>
          </div>
        </div>
      </div>
    )
  }

  if (isLenny) {
    return (
      <div className="flex justify-start">
        <div className="max-w-2xl">
          <div className="flex items-center gap-2 mb-1">
            <div className="w-8 h-8 rounded-full bg-orange-100 border-2 border-orange-300 flex items-center justify-center">
              <span className="text-orange-600 font-semibold text-xs">LB</span>
            </div>
            <span className="text-sm font-medium text-charcoal-700">{message.sender}</span>
            <span className="text-xs text-charcoal-500">(Moderator)</span>
            <span className="text-xs text-charcoal-400 ml-auto">
              {new Date(message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </span>
          </div>
          <div className="editorial-card p-4 bg-white border border-charcoal-200">
            <p className="whitespace-pre-wrap text-charcoal-700">{message.text}</p>
          </div>
      </div>
    </div>
  )
}

  if (isGuest) {
    const initials = message.guestName ? getInitials(message.guestName) : 'G'
    
    return (
      <div className="flex justify-start animate-fade-in-up">
        <div className="max-w-2xl w-full">
          <div className="editorial-card p-6">
            {/* Guest Header */}
            <div className="flex items-start gap-4 mb-4">
              <div className="w-14 h-14 rounded-full bg-orange-100 border-2 border-orange-300 flex items-center justify-center flex-shrink-0">
                <span className="text-orange-600 font-semibold text-base">{initials}</span>
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-base font-semibold text-charcoal-700">{message.guestName}</span>
                  <span className="text-xs text-charcoal-400 ml-auto">
                    {new Date(message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
                {(message.guestCompany || message.guestRole) && (
                  <p className="text-sm text-charcoal-500">
                    {[message.guestCompany, message.guestRole].filter(Boolean).join(', ')}
                  </p>
                )}
                <p className="text-xs text-charcoal-400 mt-1">From Lenny's Podcast</p>
              </div>
            </div>

            {/* Response Text */}
            <div className="mb-4">
              <p className="text-charcoal-700 leading-relaxed whitespace-pre-wrap">{message.text}</p>
            </div>

            {/* Episode Citation */}
            {message.episodeInfo && (
              <div className="mb-4 text-xs text-charcoal-500">
                📎 {message.episodeInfo}
              </div>
            )}

            {/* Continue Button */}
            <button
              onClick={() => onGuestClick(message)}
              className="w-full md:w-auto px-6 py-3 border border-orange-300 text-orange-600 rounded-lg font-medium hover:bg-orange-50 transition-all duration-200 flex items-center justify-center gap-2 group"
            >
              Continue with this expert
              <ArrowRight className="w-4 h-4 transform group-hover:translate-x-1 transition-transform" />
            </button>
          </div>
        </div>
      </div>
    )
  }

  return null
}
