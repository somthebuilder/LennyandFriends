'use client'

import { useState, useRef, useEffect } from 'react'
import InsightCard from '@/components/insights/InsightCard'
import InsightBreakdown from '@/components/insights/InsightBreakdown'
import ConceptCard from '@/components/concepts/ConceptCard'
import { Insight } from '@/lib/api/insights'
import { Concept } from '@/lib/api/concepts'
import { sendMessage, ChatMessage } from '@/lib/api/chat'
import { useSpeechToText } from '@/hooks/useSpeechToText'

type TabId = 'insights' | 'concepts' | 'chat'

interface PodcastTabsProps {
  podcastSlug: string
  insights: Insight[]
  concepts: Concept[]
  previewMode?: boolean
}

export default function PodcastTabs({ podcastSlug, insights, concepts, previewMode = false }: PodcastTabsProps) {
  const [activeTab, setActiveTab] = useState<TabId>('insights')
  const [selectedInsight, setSelectedInsight] = useState<Insight | null>(null)

  // Chat state
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [chatInput, setChatInput] = useState('')
  const [isChatLoading, setIsChatLoading] = useState(false)
  const [chatContext, setChatContext] = useState<string | null>(null)
  const chatScrollRef = useRef<HTMLDivElement>(null)

  // Speech-to-text
  const {
    isSupported: sttSupported,
    isListening,
    transcript,
    timeLeft,
    error: sttError,
    startListening,
    stopAndKeep,
    cancelListening,
  } = useSpeechToText({ maxDuration: 30 })

  // Sync transcript → chatInput while listening
  useEffect(() => {
    if (isListening) setChatInput(transcript)
  }, [isListening, transcript])

  // Scroll chat to bottom on new messages
  useEffect(() => {
    if (chatScrollRef.current) {
      chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight
    }
  }, [messages, isChatLoading])

  // Handle "Discuss in Chat" CTA from insight breakdown
  function handleDiscussInChat(insightTitle: string) {
    setChatContext(insightTitle)
    setActiveTab('chat')
    setChatInput(`Tell me more about: "${insightTitle}"`)
  }

  // Chat submit
  async function handleChatSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!chatInput.trim() || isChatLoading) return

    // Stop any active speech session
    if (isListening) stopAndKeep()

    const userMsg: ChatMessage = {
      id: Date.now().toString(),
      role: 'user',
      content: chatInput,
    }
    setMessages((prev) => [...prev, userMsg])
    setChatInput('')
    setIsChatLoading(true)

    try {
      const response = await sendMessage(chatInput, podcastSlug)
      setMessages((prev) => [...prev, response])
    } catch (error) {
      console.error('Failed to send message:', error)
    } finally {
      setIsChatLoading(false)
    }
  }

  function handleMicClick() {
    if (isListening) {
      stopAndKeep()
    } else {
      startListening()
    }
  }

  function handleCancelSpeech() {
    cancelListening()
    setChatInput('')
  }

  const tabs: { id: TabId; label: string; icon: React.ReactNode }[] = [
    {
      id: 'insights',
      label: 'Insights',
      icon: (
        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
          <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
        </svg>
      ),
    },
    {
      id: 'concepts',
      label: 'Concepts',
      icon: (
        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10" />
          <path d="M12 16v-4" />
          <path d="M12 8h.01" />
        </svg>
      ),
    },
    {
      id: 'chat',
      label: 'Chat',
      icon: (
        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
        </svg>
      ),
    },
  ]

  return (
    <div className="flex flex-col flex-1">
      {/* ── Sticky Tab Bar ── */}
      <div className="sticky top-14 z-30 bg-cream-50/95 backdrop-blur-md border-b border-charcoal-200/50">
        <div className="max-w-5xl mx-auto px-4 md:px-6">
          <nav className="flex gap-1" role="tablist">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                role="tab"
                aria-selected={activeTab === tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`relative flex items-center gap-1.5 px-4 py-3 text-sm font-medium transition-colors ${
                  activeTab === tab.id
                    ? 'text-charcoal-900'
                    : 'text-charcoal-400 hover:text-charcoal-600'
                }`}
              >
                {tab.icon}
                {tab.label}
                {/* Active indicator */}
                {activeTab === tab.id && (
                  <span className="absolute bottom-0 left-2 right-2 h-0.5 bg-charcoal-900 rounded-full" />
                )}
              </button>
            ))}
          </nav>
        </div>
      </div>

      {/* ── Tab Content ── */}
      <div className="flex-1">
        {/* ════════════════════════════════════════
            INSIGHTS TAB
           ════════════════════════════════════════ */}
        {activeTab === 'insights' && (
          <div className="max-w-5xl mx-auto px-4 md:px-6 py-6 md:py-8">
            {previewMode && (
              <div className="mb-4 text-xs text-charcoal-500 bg-cream-100 border border-charcoal-200 rounded-lg px-3 py-2">
                Showing temporary dry-run insights preview. These are not saved records.
              </div>
            )}
            {insights.length === 0 ? (
              <div className="py-20 text-center">
                <p className="text-charcoal-400 font-serif italic text-lg">
                  Insights are being generated…
                </p>
                <p className="text-sm text-charcoal-400 mt-2">
                  Check back soon as we extract patterns from hundreds of conversations.
                </p>
              </div>
            ) : (
              <>
                {/* Desktop: 2-column, Mobile: single column with modal */}
                <div className="hidden lg:grid lg:grid-cols-5 lg:gap-6">
                  {/* Left: Insight Feed */}
                  <div className="lg:col-span-2 space-y-3">
                    {insights.map((insight) => (
                      <InsightCard
                        key={insight.id}
                        insight={insight}
                        isSelected={selectedInsight?.id === insight.id}
                        onSelect={setSelectedInsight}
                      />
                    ))}
                  </div>

                  {/* Right: Expanded Breakdown */}
                  <div className="lg:col-span-3 lg:sticky lg:top-[7.5rem] lg:self-start">
                    {selectedInsight ? (
                      <InsightBreakdown
                        insight={selectedInsight}
                        onClose={() => setSelectedInsight(null)}
                        onDiscussInChat={handleDiscussInChat}
                      />
                    ) : (
                      <div className="bg-cream-100/50 border border-dashed border-charcoal-200 rounded-xl p-12 text-center">
                        <div className="space-y-3">
                          <div className="w-12 h-12 bg-cream-200 rounded-full flex items-center justify-center mx-auto">
                            <svg className="w-6 h-6 text-charcoal-300" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
                              <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
                            </svg>
                          </div>
                          <p className="text-sm text-charcoal-400 font-serif italic">
                            Select an insight to see the full breakdown
                          </p>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Mobile: Single column feed + full-screen breakdown */}
                <div className="lg:hidden space-y-3">
                  {!selectedInsight ? (
                    insights.map((insight) => (
                      <InsightCard
                        key={insight.id}
                        insight={insight}
                        onSelect={setSelectedInsight}
                      />
                    ))
                  ) : (
                    <div className="animate-slide-up">
                      <button
                        onClick={() => setSelectedInsight(null)}
                        className="flex items-center gap-1.5 text-sm text-charcoal-500 hover:text-charcoal-700 transition-colors mb-4"
                      >
                        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M19 12H5M12 19l-7-7 7-7" />
                        </svg>
                        Back to Insights
                      </button>
                      <InsightBreakdown
                        insight={selectedInsight}
                        onClose={() => setSelectedInsight(null)}
                        onDiscussInChat={handleDiscussInChat}
                      />
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        )}

        {/* ════════════════════════════════════════
            CONCEPTS TAB
           ════════════════════════════════════════ */}
        {activeTab === 'concepts' && (
          <div className="max-w-3xl mx-auto px-4 md:px-6 py-6 md:py-8">
            {previewMode && (
              <div className="mb-4 text-xs text-charcoal-500 bg-cream-100 border border-charcoal-200 rounded-lg px-3 py-2">
                Showing temporary dry-run concepts preview. Open concept links are disabled in preview mode.
              </div>
            )}
            {concepts.length === 0 ? (
              <div className="py-20 text-center">
                <p className="text-charcoal-400 font-serif italic text-lg">
                  Concepts are being generated…
                </p>
                <p className="text-sm text-charcoal-400 mt-2">
                  Check back soon as we extract insights from the transcripts.
                </p>
              </div>
            ) : (
              <div className="space-y-0">
                {concepts.map((concept) => (
                  <ConceptCard
                    key={concept.id}
                    concept={concept}
                    podcastSlug={podcastSlug}
                    previewMode={previewMode}
                  />
                ))}
              </div>
            )}
          </div>
        )}

        {/* ════════════════════════════════════════
            CHAT TAB
           ════════════════════════════════════════ */}
        {activeTab === 'chat' && (
          <div className="max-w-3xl mx-auto px-4 md:px-6 py-6 md:py-8 flex flex-col" style={{ minHeight: 'calc(100vh - 10rem)' }}>
            {/* Context pin */}
            {chatContext && (
              <div className="mb-4 flex items-center gap-2 px-3 py-2 bg-cream-100 rounded-lg border border-charcoal-100">
                <svg className="w-4 h-4 text-charcoal-400 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                </svg>
                <span className="text-xs text-charcoal-500">
                  Discussing:{' '}
                  <span className="font-medium text-charcoal-700">{chatContext}</span>
                </span>
                <button
                  onClick={() => setChatContext(null)}
                  className="ml-auto p-0.5 text-charcoal-300 hover:text-charcoal-500 transition-colors"
                >
                  <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M18 6L6 18M6 6l12 12" />
                  </svg>
                </button>
              </div>
            )}

            {/* Messages */}
            <div ref={chatScrollRef} className="flex-1 overflow-y-auto space-y-5 pb-4">
              {messages.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-center space-y-4 px-6 py-16 opacity-60">
                  <div className="w-12 h-12 bg-cream-200 rounded-full flex items-center justify-center text-xl">
                    ✨
                  </div>
                  <div className="space-y-2">
                    <p className="text-charcoal-600 text-sm font-serif italic leading-relaxed">
                      &quot;What are the best books for product managers?&quot;
                    </p>
                    <p className="text-charcoal-600 text-sm font-serif italic leading-relaxed">
                      &quot;Where do guests disagree on prioritization?&quot;
                    </p>
                    <p className="text-charcoal-600 text-sm font-serif italic leading-relaxed">
                      &quot;How do top operators think about retention?&quot;
                    </p>
                  </div>
                  <p className="text-[11px] text-charcoal-400 mt-3">
                    Ask about insights, concepts, or anything from the podcast
                  </p>
                </div>
              ) : (
                messages.map((msg) => (
                  <div
                    key={msg.id}
                    className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                  >
                    <div
                      className={`max-w-[85%] ${
                        msg.role === 'user'
                          ? 'bg-charcoal-900 text-white rounded-2xl rounded-tr-sm px-4 py-2.5 text-sm'
                          : 'w-full'
                      }`}
                    >
                      {msg.role === 'user' ? (
                        <p className="font-sans">{msg.content}</p>
                      ) : (
                        <div className="space-y-3">
                          <div className="text-sm text-charcoal-700 leading-relaxed">
                            <p>{msg.content}</p>
                          </div>
                          {/* Source chips */}
                          {msg.references && msg.references.length > 0 && (
                            <div className="bg-cream-100 rounded-lg p-2.5 space-y-1.5">
                              <div className="text-[10px] font-semibold text-charcoal-400 uppercase tracking-wider">
                                Sources
                              </div>
                              <div className="flex flex-wrap gap-1.5">
                                {msg.references.map((ref, idx) => (
                                  <span
                                    key={idx}
                                    className="inline-flex items-center gap-1 text-[11px] bg-cream-50 px-2 py-1 rounded-md text-charcoal-600"
                                  >
                                    <span className="font-medium text-charcoal-700">
                                      {ref.guest_name}
                                    </span>
                                    <span className="text-charcoal-300">·</span>
                                    <span className="truncate max-w-[100px]">
                                      {ref.episode_title}
                                    </span>
                                  </span>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                ))
              )}
              {isChatLoading && (
                <div className="flex justify-start">
                  <div className="bg-cream-100 rounded-xl px-4 py-2.5 text-sm text-charcoal-500 animate-pulse">
                    Consulting the collective…
                  </div>
                </div>
              )}
            </div>

            {/* Input */}
            <div className="pt-3 border-t border-charcoal-200/60 bg-cream-50 sticky bottom-0">
              {sttError && (
                <p className="text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2 mb-2">{sttError}</p>
              )}
              {isListening && (
                <div className="flex items-center justify-between mb-2 px-1">
                  <button
                    onClick={handleCancelSpeech}
                    className="text-xs text-charcoal-500 hover:text-charcoal-700 transition-colors flex items-center gap-1"
                  >
                    <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <line x1="18" y1="6" x2="6" y2="18" />
                      <line x1="6" y1="6" x2="18" y2="18" />
                    </svg>
                    Cancel
                  </button>
                  <div className="flex items-center gap-2">
                    <span className="relative flex h-2.5 w-2.5">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
                      <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-red-500" />
                    </span>
                    <span className="text-xs font-mono text-red-600">{timeLeft}s</span>
                  </div>
                </div>
              )}
              <form onSubmit={handleChatSubmit} className="relative">
                <input
                  type="text"
                  value={chatInput}
                  onChange={(e) => {
                    if (isListening) stopAndKeep()
                    setChatInput(e.target.value)
                  }}
                  placeholder={isListening ? 'Listening…' : 'Ask a question…'}
                  className={`w-full px-4 py-3 ${sttSupported ? 'pr-20' : 'pr-12'} rounded-xl bg-cream-100 text-sm text-charcoal-900 placeholder:text-charcoal-400 focus:outline-none focus:ring-2 focus:ring-accent-600/20 focus:bg-white transition-all ${
                    isListening ? 'italic text-charcoal-600 ring-2 ring-red-300/40' : ''
                  }`}
                  disabled={isChatLoading}
                />
                {/* Mic button */}
                {sttSupported && !isChatLoading && (
                  <button
                    type="button"
                    onClick={handleMicClick}
                    className={`absolute right-11 top-1/2 -translate-y-1/2 p-1.5 transition-colors ${
                      isListening
                        ? 'text-red-500 hover:text-red-600'
                        : 'text-charcoal-400 hover:text-accent-600'
                    }`}
                    title={isListening ? 'Stop recording' : 'Voice input'}
                  >
                    {isListening ? (
                      /* Stop icon */
                      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                        <rect x="6" y="6" width="12" height="12" rx="2" />
                      </svg>
                    ) : (
                      /* Mic icon */
                      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
                        <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                        <line x1="12" y1="19" x2="12" y2="23" />
                        <line x1="8" y1="23" x2="16" y2="23" />
                      </svg>
                    )}
                  </button>
                )}
                {/* Send button */}
                <button
                  type="submit"
                  disabled={!chatInput.trim() || isChatLoading}
                  className="absolute right-3 top-1/2 -translate-y-1/2 p-1.5 text-charcoal-400 hover:text-accent-600 disabled:opacity-40 transition-colors"
                >
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="22" y1="2" x2="11" y2="13" />
                    <polygon points="22 2 15 22 11 13 2 9 22 2" />
                  </svg>
                </button>
              </form>
              <p className="text-center text-[10px] text-charcoal-400 mt-2 pb-1">
                Answers generated from podcast transcripts. Always verify.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

