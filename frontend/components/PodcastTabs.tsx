'use client'

import { useState, useRef, useEffect } from 'react'
import InsightCard from '@/components/insights/InsightCard'
import InsightBreakdown from '@/components/insights/InsightBreakdown'
import ConceptCard from '@/components/concepts/ConceptCard'
import { Insight } from '@/lib/api/insights'
import { Concept } from '@/lib/api/concepts'
import { sendMessage, ConversationTurn } from '@/lib/api/chat'
import { ChatMessage, ClarificationQuestion } from '@/lib/types/rag'
import { useSpeechToText } from '@/hooks/useSpeechToText'
import BeanAnimation from '@/components/BeanAnimation'
import ReactMarkdown from 'react-markdown'
import { supabase } from '@/lib/supabase'

/* ── Helper: get or create a stable voter ID (matches podcast voting pattern) ── */
function getVoterId(): string {
  if (typeof window === 'undefined') return ''
  let id = localStorage.getItem('espresso_voter_id')
  if (!id) {
    id = crypto.randomUUID()
    localStorage.setItem('espresso_voter_id', id)
  }
  return id
}

type TabId = 'insights' | 'concepts' | 'chat'

interface PodcastTabsProps {
  podcastSlug: string
  insights: Insight[]
  concepts: Concept[]
  previewMode?: boolean
  initialTab?: TabId
}

/* ── Helper: build deep-linked YouTube URL ── */
function deepLink(url?: string, timeSeconds?: number): string | null {
  if (!url) return null
  if (timeSeconds && timeSeconds > 0 && !url.includes('&t=')) {
    return `${url}&t=${timeSeconds}`
  }
  return url
}

function formatSeconds(seconds?: number): string | null {
  if (!seconds || seconds <= 0) return null
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = seconds % 60
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  return `${m}:${String(s).padStart(2, '0')}`
}

export default function PodcastTabs({
  podcastSlug,
  insights,
  concepts,
  previewMode = false,
  initialTab,
}: PodcastTabsProps) {
  const [activeTab, setActiveTab] = useState<TabId>(initialTab ?? 'insights')
  const [selectedInsight, setSelectedInsight] = useState<Insight | null>(null)
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null)
  const [insightFilter, setInsightFilter] = useState<'all' | 'most_valuable'>('all')
  // Track updated valuable counts from user interactions
  const [valuableCounts, setValuableCounts] = useState<Record<string, number>>({})
  // Track which insights this voter has already marked as valuable
  const [votedInsightIds, setVotedInsightIds] = useState<Set<string>>(new Set())

  // Chat state
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [chatInput, setChatInput] = useState('')
  const [isChatLoading, setIsChatLoading] = useState(false)
  const [chatContext, setChatContext] = useState<string | null>(null)
  const [creditsRemaining, setCreditsRemaining] = useState<number | null>(null)
  const [creditsTotal, setCreditsTotal] = useState<number | null>(null)
  const [chatError, setChatError] = useState<string | null>(null)
  const chatScrollRef = useRef<HTMLDivElement>(null)
  const breakdownRef = useRef<HTMLDivElement>(null)

  // Speech-to-text
  const {
    isSupported: sttSupported,
    isListening,
    transcript,
    elapsed,
    error: sttError,
    startListening,
    stopAndKeep,
    cancelListening,
  } = useSpeechToText({ silenceTimeout: 3, maxDuration: 120 })

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

  // Fetch which insights this voter has already marked as valuable
  useEffect(() => {
    if (!insights.length) return
    const voterId = getVoterId()
    if (!voterId) return
    supabase
      .from('insight_valuable_votes')
      .select('insight_id')
      .eq('voter_id', voterId)
      .then(({ data }) => {
        if (data) {
          setVotedInsightIds(new Set(data.map((v) => v.insight_id)))
        }
      })
  }, [insights])

  function syncTabToUrl(tabId: TabId) {
    if (typeof window === 'undefined') return
    const url = new URL(window.location.href)
    if (url.searchParams.get('tab') === tabId) return
    url.searchParams.set('tab', tabId)
    window.history.replaceState({}, '', url.toString())
  }

  function handleTabChange(tabId: TabId) {
    setActiveTab(tabId)
  }

  // Handle "Discuss in Chat" CTA from insight breakdown
  function handleDiscussInChat(insightTitle: string) {
    setChatContext(insightTitle)
    handleTabChange('chat')
    setChatInput(`Tell me more about: "${insightTitle}"`)
  }

  // Handle valuable vote from InsightBreakdown (uses same pattern as podcast request voting)
  async function handleInsightVote(insightId: string): Promise<boolean> {
    const voterId = getVoterId()
    if (!voterId || votedInsightIds.has(insightId)) return false

    const { data, error } = await supabase.rpc('vote_insight_valuable', {
      p_insight_id: insightId,
      p_voter_id: voterId,
    })

    if (!error && data === true) {
      setVotedInsightIds((prev) => new Set(prev).add(insightId))
      setValuableCounts((prev) => {
        const current = prev[insightId] ?? insights.find((i) => i.id === insightId)?.valuable_count ?? 0
        return { ...prev, [insightId]: current + 1 }
      })
      return true
    }
    return false
  }

  // Build insights with updated valuable counts
  const insightsWithCounts = insights.map((i) => ({
    ...i,
    valuable_count: valuableCounts[i.id] ?? i.valuable_count,
  }))

  // Filter insights based on selected filter
  const filteredInsights = insightFilter === 'most_valuable'
    ? [...insightsWithCounts].filter((i) => i.valuable_count > 0).sort((a, b) => b.valuable_count - a.valuable_count)
    : insightsWithCounts

  const insightStorageKey = `espresso_last_insight_${podcastSlug}`
  const tabStorageKey = `espresso_last_tab_${podcastSlug}`

  function handleSelectInsight(insight: Insight) {
    setSelectedInsight(insight)
    if (typeof window !== 'undefined') {
      sessionStorage.setItem(insightStorageKey, insight.id)
    }
    // Auto-scroll breakdown to top when switching insights
    if (breakdownRef.current) {
      breakdownRef.current.scrollTop = 0
    }
  }

  useEffect(() => {
    if (!initialTab) return
    setActiveTab(initialTab)
  }, [initialTab])

  useEffect(() => {
    if (typeof window === 'undefined') return
    if (initialTab) {
      localStorage.setItem(tabStorageKey, initialTab)
      return
    }
    const stored = localStorage.getItem(tabStorageKey)
    if (stored === 'insights' || stored === 'concepts' || stored === 'chat') {
      setActiveTab(stored)
    }
  }, [initialTab, tabStorageKey])

  useEffect(() => {
    if (typeof window === 'undefined') return
    localStorage.setItem(tabStorageKey, activeTab)
    syncTabToUrl(activeTab)
  }, [activeTab, tabStorageKey])

  useEffect(() => {
    if (!insights.length) {
      setSelectedInsight(null)
      return
    }
    const hasSelected = selectedInsight && insights.some((i) => i.id === selectedInsight.id)
    if (hasSelected) return
    
    // Only auto-select first insight on desktop (lg breakpoint = 1024px)
    // On mobile, start with no selection so user sees the list
    const isDesktop = typeof window !== 'undefined' && window.innerWidth >= 1024
    
    let storedId: string | null = null
    if (typeof window !== 'undefined') {
      storedId = sessionStorage.getItem(insightStorageKey)
    }
    const storedInsight = storedId ? insights.find((i) => i.id === storedId) : null
    
    // On mobile: only restore if there was a stored selection, otherwise show list
    // On desktop: default to first insight for the 2-column layout
    if (storedInsight) {
      setSelectedInsight(storedInsight)
    } else if (isDesktop) {
      setSelectedInsight(insights[0])
    } else {
      setSelectedInsight(null)
    }
  }, [insights, podcastSlug, selectedInsight])

  // Right-hand breakdown uses its own scroll; no auto-advance on scroll.

  // Build conversation history for API
  function buildConversationHistory(): ConversationTurn[] {
    return messages
      .filter((m) => m.content.trim().length > 0)
      .map((m) => ({ role: m.role, content: m.content }))
  }

  // Chat submit
  async function handleChatSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!chatInput.trim() || isChatLoading) return

    // Stop any active speech session
    if (isListening) stopAndKeep()

    setChatError(null)

    const userMsg: ChatMessage = {
      id: Date.now().toString(),
      role: 'user',
      content: chatInput,
    }
    setMessages((prev) => [...prev, userMsg])

    const history = buildConversationHistory()
    setChatInput('')
    setIsChatLoading(true)

    try {
      const response = await sendMessage(chatInput, podcastSlug, history)
      setMessages((prev) => [...prev, response])
      // Update credits from response
      if (response.credits_remaining !== undefined) {
        setCreditsRemaining(response.credits_remaining)
      }
      if (response.credits_total !== undefined) {
        setCreditsTotal(response.credits_total)
      }
    } catch (error) {
      console.error('Failed to send message:', error)
      const err = error as Error & {
        credits_remaining?: number
        credits_total?: number
      }
      setChatError(err.message || 'Something went wrong. Try again.')
      if (err.credits_remaining !== undefined) {
        setCreditsRemaining(err.credits_remaining)
      }
      if (err.credits_total !== undefined) {
        setCreditsTotal(err.credits_total)
      }
    } finally {
      setIsChatLoading(false)
    }
  }

  // Quick reply chip click (for clarification)
  function handleQuickReply(text: string) {
    setChatInput(text)
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
        <svg
          className="w-4 h-4"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
          <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
        </svg>
      ),
    },
    {
      id: 'concepts',
      label: 'Concepts',
      icon: (
        <svg
          className="w-4 h-4"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
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
        <svg
          className="w-4 h-4"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
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
                onClick={() => handleTabChange(tab.id)}
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
                Showing temporary dry-run insights preview. These are not saved
                records.
              </div>
            )}
            {insights.length === 0 ? (
              <div className="py-20 text-center">
                <p className="text-charcoal-400 font-serif italic text-lg">
                  Insights are being generated…
                </p>
                <p className="text-sm text-charcoal-400 mt-2">
                  Check back soon as we extract patterns from hundreds of
                  conversations.
                </p>
              </div>
            ) : (
              <>
                {/* Filter pills: All / Most Valuable */}
                <div className="flex items-center gap-2 mb-5">
                  <button
                    onClick={() => setInsightFilter('all')}
                    className={`px-4 py-2 rounded-full text-sm font-medium transition-all duration-200 ${
                      insightFilter === 'all'
                        ? 'bg-charcoal-900 text-white shadow-sm'
                        : 'bg-cream-100 text-charcoal-600 hover:bg-cream-200'
                    }`}
                  >
                    All
                    <span className={`ml-1.5 ${insightFilter === 'all' ? 'text-charcoal-300' : 'text-charcoal-400'}`}>
                      {insightsWithCounts.length}
                    </span>
                  </button>
                  <button
                    onClick={() => setInsightFilter('most_valuable')}
                    className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-medium transition-all duration-200 ${
                      insightFilter === 'most_valuable'
                        ? 'bg-charcoal-900 text-white shadow-sm'
                        : 'bg-cream-100 text-charcoal-600 hover:bg-cream-200'
                    }`}
                  >
                    <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor" stroke="none">
                      <path d="M12 2a7 7 0 0 0-7 7c0 2.38 1.19 4.47 3 5.74V17a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1v-2.26c1.81-1.27 3-3.36 3-5.74a7 7 0 0 0-7-7zM9 21a1 1 0 0 0 1 1h4a1 1 0 0 0 1-1v-1H9v1z" />
                    </svg>
                    Most Valuable
                    <span className={`${insightFilter === 'most_valuable' ? 'text-charcoal-300' : 'text-charcoal-400'}`}>
                      {insightsWithCounts.filter((i) => i.valuable_count > 0).length}
                    </span>
                  </button>
                </div>

                {/* Desktop: 2-column, Mobile: single column with modal */}
                <div className="hidden lg:grid lg:grid-cols-5 lg:gap-6">
                  {/* Left: Insight Feed */}
                  <div className="lg:col-span-2 space-y-3">
                    {filteredInsights.map((insight) => (
                      <InsightCard
                        key={insight.id}
                        insight={insight}
                        isSelected={selectedInsight?.id === insight.id}
                        onSelect={handleSelectInsight}
                      />
                    ))}
                  </div>

                  {/* Right: Expanded Breakdown */}
                  <div className="lg:col-span-3 lg:sticky lg:top-[7.5rem] lg:self-start">
                    <div
                      ref={breakdownRef}
                      className="lg:max-h-[calc(100vh-12rem)] lg:overflow-y-auto lg:pr-2 scrollbar-subtle"
                    >
                    {selectedInsight ? (
                      <InsightBreakdown
                        insight={{
                          ...selectedInsight,
                          valuable_count: valuableCounts[selectedInsight.id] ?? selectedInsight.valuable_count,
                        }}
                        isVoted={votedInsightIds.has(selectedInsight.id)}
                        onVote={handleInsightVote}
                        onClose={() => setSelectedInsight(null)}
                        onDiscussInChat={handleDiscussInChat}
                      />
                    ) : (
                      <div className="bg-cream-100/50 border border-dashed border-charcoal-200 rounded-xl p-12 text-center">
                        <div className="space-y-3">
                          <div className="w-12 h-12 bg-cream-200 rounded-full flex items-center justify-center mx-auto">
                            <svg
                              className="w-6 h-6 text-charcoal-300"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="1.5"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            >
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
                </div>

                {/* Mobile: Single column feed + full-screen breakdown */}
                <div className="lg:hidden space-y-3">
                  {!selectedInsight ? (
                    filteredInsights.map((insight) => (
                      <InsightCard
                        key={insight.id}
                        insight={insight}
                        onSelect={handleSelectInsight}
                      />
                    ))
                  ) : (
                    <div className="animate-slide-up">
                      {/* Sticky back button for mobile */}
                      <div className="sticky top-[6.5rem] z-20 -mx-4 px-4 py-3 bg-cream-50/95 backdrop-blur-sm border-b border-charcoal-100">
                        <button
                          onClick={() => {
                            setSelectedInsight(null)
                            // Clear stored selection so list shows on refresh
                            if (typeof window !== 'undefined') {
                              sessionStorage.removeItem(insightStorageKey)
                            }
                          }}
                          className="flex items-center gap-2 text-sm font-medium text-charcoal-600 hover:text-charcoal-900 active:text-charcoal-900 transition-colors"
                        >
                          <svg
                            className="w-5 h-5"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          >
                            <path d="M19 12H5M12 19l-7-7 7-7" />
                          </svg>
                          Back to Insights
                        </button>
                      </div>
                      <div className="pt-4">
                        <InsightBreakdown
                          insight={{
                            ...selectedInsight,
                            valuable_count: valuableCounts[selectedInsight.id] ?? selectedInsight.valuable_count,
                          }}
                          isVoted={votedInsightIds.has(selectedInsight.id)}
                          onVote={handleInsightVote}
                          onClose={() => {
                            setSelectedInsight(null)
                            if (typeof window !== 'undefined') {
                              sessionStorage.removeItem(insightStorageKey)
                            }
                          }}
                          onDiscussInChat={handleDiscussInChat}
                        />
                      </div>
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
        {activeTab === 'concepts' && (() => {
          // Extract unique categories that have concepts
          const categoryMap = new Map<string, number>()
          concepts.forEach((c) => {
            if (c.category) {
              categoryMap.set(c.category, (categoryMap.get(c.category) || 0) + 1)
            }
          })
          const availableCategories = Array.from(categoryMap.entries())
            .sort((a, b) => b[1] - a[1]) // Sort by count descending
            .map(([cat]) => cat)

          // Filter concepts by selected category
          const filteredConcepts = selectedCategory
            ? concepts.filter((c) => c.category === selectedCategory)
            : concepts

          return (
            <div className="max-w-5xl mx-auto px-4 md:px-6 py-6 md:py-8">
              {previewMode && (
                <div className="mb-4 text-xs text-charcoal-500 bg-cream-100 border border-charcoal-200 rounded-lg px-3 py-2">
                  Showing temporary dry-run concepts preview. Open concept links
                  are disabled in preview mode.
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
                <>
                  {/* Mobile/Tablet: Category Pills */}
                  <div className="lg:hidden mb-5">
                    <div className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-hide -mx-4 px-4">
                      <button
                        onClick={() => setSelectedCategory(null)}
                        className={`flex-shrink-0 px-4 py-2 rounded-full text-sm font-medium transition-all duration-200 ${
                          selectedCategory === null
                            ? 'bg-charcoal-900 text-white shadow-sm'
                            : 'bg-cream-100 text-charcoal-600 hover:bg-cream-200'
                        }`}
                      >
                        All
                        <span className={`ml-1.5 ${selectedCategory === null ? 'text-charcoal-300' : 'text-charcoal-400'}`}>
                          {concepts.length}
                        </span>
                      </button>
                      {availableCategories.map((category) => {
                        const count = categoryMap.get(category) || 0
                        const isSelected = selectedCategory === category
                        return (
                          <button
                            key={category}
                            onClick={() => setSelectedCategory(category)}
                            className={`flex-shrink-0 px-4 py-2 rounded-full text-sm font-medium transition-all duration-200 ${
                              isSelected
                                ? 'bg-charcoal-900 text-white shadow-sm'
                                : 'bg-cream-100 text-charcoal-600 hover:bg-cream-200'
                            }`}
                          >
                            {category}
                            <span className={`ml-1.5 ${isSelected ? 'text-charcoal-300' : 'text-charcoal-400'}`}>
                              {count}
                            </span>
                          </button>
                        )
                      })}
                    </div>
                  </div>

                  {/* Desktop: Grid Layout with Sidebar */}
                  <div className="flex gap-8">
                    {/* Category Sidebar - Desktop Only */}
                    <div className="hidden lg:block w-44 flex-shrink-0">
                      <div className="sticky top-24 space-y-1.5">
                        <h3 className="text-xs font-semibold text-charcoal-500 uppercase tracking-wider mb-3">Categories</h3>
                        <button
                          onClick={() => setSelectedCategory(null)}
                          className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors ${
                            selectedCategory === null
                              ? 'bg-charcoal-900 text-white font-medium'
                              : 'text-charcoal-600 hover:bg-cream-100'
                          }`}
                        >
                          <span className="flex items-center justify-between">
                            All
                            <span className={`text-xs ${selectedCategory === null ? 'text-charcoal-400' : 'text-charcoal-400'}`}>
                              {concepts.length}
                            </span>
                          </span>
                        </button>
                        {availableCategories.map((category) => {
                          const count = categoryMap.get(category) || 0
                          const isSelected = selectedCategory === category
                          return (
                            <button
                              key={category}
                              onClick={() => setSelectedCategory(category)}
                              className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors ${
                                isSelected
                                  ? 'bg-charcoal-900 text-white font-medium'
                                  : 'text-charcoal-600 hover:bg-cream-100'
                              }`}
                            >
                              <span className="flex items-center justify-between">
                                {category}
                                <span className={`text-xs ${isSelected ? 'text-charcoal-400' : 'text-charcoal-400'}`}>
                                  {count}
                                </span>
                              </span>
                            </button>
                          )
                        })}
                      </div>
                    </div>

                    {/* Concepts List */}
                    <div className="flex-1 min-w-0">
                      {filteredConcepts.length === 0 ? (
                        <div className="py-20 text-center">
                          <p className="text-charcoal-400 font-serif italic text-lg">
                            No concepts found in this category.
                          </p>
                        </div>
                      ) : (
                        <div className="space-y-0">
                          {filteredConcepts.map((concept) => (
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
                  </div>
                </>
              )}
            </div>
          )
        })()}

        {/* ════════════════════════════════════════
            BEAN CHAT TAB
           ════════════════════════════════════════ */}
        {activeTab === 'chat' && (
          <div
            className="max-w-3xl mx-auto px-4 md:px-6 py-6 md:py-8 flex flex-col"
            style={{ minHeight: 'calc(100vh - 10rem)' }}
          >
            {/* Context pin (from insight discussion) */}
            {chatContext && (
              <div className="mb-4 flex items-center gap-2 px-3 py-2 bg-cream-100 rounded-lg border border-charcoal-100">
                <svg
                  className="w-4 h-4 text-charcoal-400 flex-shrink-0"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                </svg>
                <span className="text-xs text-charcoal-500">
                  Discussing:{' '}
                  <span className="font-medium text-charcoal-700">
                    {chatContext}
                  </span>
                </span>
                <button
                  onClick={() => setChatContext(null)}
                  className="ml-auto p-0.5 text-charcoal-300 hover:text-charcoal-500 transition-colors"
                >
                  <svg
                    className="w-3.5 h-3.5"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M18 6L6 18M6 6l12 12" />
                  </svg>
                </button>
              </div>
            )}

            {/* Messages */}
            <div
              ref={chatScrollRef}
              className="flex-1 overflow-y-auto space-y-5 pb-4"
            >
              {messages.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-center space-y-4 px-6 py-12">
                  {/* Bean avatar */}
                  <BeanAnimation size={56} />
                  <p className="text-[14px] text-charcoal-600 max-w-sm leading-relaxed">
                    I&apos;m a <span className="font-serif font-semibold">living Bean</span> trained on 500+ hours of conversations with top operators. The more specific your question, the better I can help.
                  </p>
                  <div className="w-full max-w-sm space-y-2 pt-2">
                    <p className="text-[10px] font-medium uppercase tracking-wider text-charcoal-400">Try something specific</p>
                    <div className="flex flex-wrap justify-center gap-2">
                      <button
                        type="button"
                        onClick={() => setChatInput('What does Shreyas Doshi say about high-leverage work for PMs?')}
                        className="text-xs px-3 py-1.5 rounded-full bg-cream-100 text-charcoal-600 hover:bg-cream-200 transition-colors text-left"
                      >
                        Shreyas Doshi on high-leverage PM work
                      </button>
                      <button
                        type="button"
                        onClick={() => setChatInput('How did Airbnb recover growth after COVID?')}
                        className="text-xs px-3 py-1.5 rounded-full bg-cream-100 text-charcoal-600 hover:bg-cream-200 transition-colors text-left"
                      >
                        Airbnb&apos;s post-COVID growth
                      </button>
                      <button
                        type="button"
                        onClick={() => setChatInput('What books do guests recommend most for product managers?')}
                        className="text-xs px-3 py-1.5 rounded-full bg-cream-100 text-charcoal-600 hover:bg-cream-200 transition-colors text-left"
                      >
                        Top books for PMs
                      </button>
                      <button
                        type="button"
                        onClick={() => setChatInput('Where do guests disagree on when to use data vs. intuition?')}
                        className="text-xs px-3 py-1.5 rounded-full bg-cream-100 text-charcoal-600 hover:bg-cream-200 transition-colors text-left"
                      >
                        Data vs. intuition debates
                      </button>
                      <button
                        type="button"
                        onClick={() => setChatInput('What frameworks do guests use for prioritization?')}
                        className="text-xs px-3 py-1.5 rounded-full bg-cream-100 text-charcoal-600 hover:bg-cream-200 transition-colors text-left"
                      >
                        Prioritization frameworks
                      </button>
                    </div>
                  </div>
                  {creditsRemaining !== null && creditsTotal !== null && (
                    <div className="flex items-center gap-1.5 pt-1">
                      <div className="flex gap-0.5">
                        {Array.from({ length: creditsTotal }).map((_, i) => (
                          <img
                            key={i}
                            src={i < creditsRemaining ? '/beansfilled.svg' : '/beanempty.svg'}
                            alt=""
                            className="w-3.5 h-3.5 transition-opacity"
                            style={{ opacity: i < creditsRemaining ? 1 : 0.35 }}
                          />
                        ))}
                      </div>
                      <span className="text-[11px] text-charcoal-400">
                        {creditsRemaining}/{creditsTotal} questions remaining today
                      </span>
                    </div>
                  )}
                </div>
              ) : (
                messages.map((msg) => (
                  <div
                    key={msg.id}
                    className={`flex ${
                      msg.role === 'user' ? 'justify-end' : 'justify-start'
                    }`}
                  >
                    <div
                      className={`${
                        msg.role === 'user'
                          ? 'max-w-[85%] bg-charcoal-900 text-white rounded-2xl rounded-tr-sm px-4 py-2.5 text-sm'
                          : 'w-full max-w-none'
                      }`}
                    >
                      {msg.role === 'user' ? (
                        <p className="font-sans">{msg.content}</p>
                      ) : (
                        <div className="space-y-3">
                          {/* Bean avatar + name */}
                          <div className="flex items-center gap-2 mb-1">
                            <BeanAnimation size={24} />
                            <span className="text-xs font-semibold text-charcoal-600">
                              Bean
                            </span>
                            {/* Badge removed — quick-reply chips already signal Bean needs more context */}
                          </div>

                          {/* Answer text — strip inline timestamps, render markdown */}
                          <div className="text-sm text-charcoal-700 leading-relaxed prose prose-sm prose-charcoal max-w-none
                            prose-p:my-1.5 prose-ul:my-1.5 prose-ol:my-1.5 prose-li:my-0.5
                            prose-strong:text-charcoal-900 prose-strong:font-semibold
                            prose-headings:text-charcoal-800 prose-headings:font-semibold prose-headings:mt-3 prose-headings:mb-1
                            prose-a:text-accent-600 prose-a:no-underline hover:prose-a:underline">
                            <ReactMarkdown>
                              {msg.content
                                .replace(/\s*\(?\d{1,2}:\d{2}:\d{2}\)?\s*/g, ' ')
                                .replace(/\s*\[\d{1,2}:\d{2}:\d{2}\]\s*/g, ' ')
                                .replace(/  +/g, ' ')
                                .trim()}
                            </ReactMarkdown>
                          </div>

                          {/* Quick reply chips for clarification */}
                          {msg.needs_clarification &&
                            msg.clarification_questions &&
                            msg.clarification_questions.length > 0 && (
                              <div className="flex flex-wrap gap-2 mt-2">
                                {msg.clarification_questions
                                  .filter((q) => q.quickReply)
                                  .map((q, idx) => (
                                    <button
                                      key={idx}
                                      onClick={() =>
                                        handleQuickReply(q.quickReply!)
                                      }
                                      className="text-xs px-3 py-1.5 bg-cream-100 hover:bg-cream-200 text-charcoal-700 rounded-full border border-charcoal-200/50 transition-colors"
                                    >
                                      {q.quickReply}
                                    </button>
                                  ))}
                              </div>
                            )}

                          {/* Source references — compact clickable cards */}
                          {msg.references && msg.references.length > 0 && (() => {
                            // Deduplicate by guest_name + episode_title
                            const seen = new Set<string>()
                            const unique = msg.references!.filter((ref) => {
                              const key = `${ref.guest_name}::${ref.episode_title}`
                              if (seen.has(key)) return false
                              seen.add(key)
                              return true
                            })
                            return (
                              <div className="space-y-2 mt-3">
                                <p className="text-[10px] font-semibold text-charcoal-400 uppercase tracking-wider">
                                  Sources
                                </p>
                                <div className="flex flex-wrap gap-2">
                                  {unique.map((ref, idx) => {
                                    const url = deepLink(ref.episode_url, ref.time_seconds)
                                    const ts = formatSeconds(ref.time_seconds) ?? ref.timestamp ?? null
                                    const Tag = url ? 'a' : 'div'
                                    const linkProps = url
                                      ? { href: url, target: '_blank' as const, rel: 'noopener noreferrer' }
                                      : {}
                                    return (
                                      <Tag
                                        key={idx}
                                        {...linkProps}
                                        className={`inline-flex items-center gap-2 px-3 py-2 rounded-lg border text-[11px] leading-tight transition-colors ${
                                          url
                                            ? 'border-charcoal-200/60 bg-white hover:bg-cream-50 hover:border-accent-300 cursor-pointer'
                                            : 'border-charcoal-100 bg-cream-50'
                                        }`}
                                      >
                                        {/* Play icon for linked sources */}
                                        {url && (
                                          <svg className="w-3.5 h-3.5 text-accent-600 flex-shrink-0" viewBox="0 0 24 24" fill="currentColor">
                                            <path d="M8 5v14l11-7z" />
                                          </svg>
                                        )}
                                        <span className="min-w-0">
                                          <span className="font-semibold text-charcoal-800">{ref.guest_name}</span>
                                          {ts && (
                                            <span className="text-charcoal-400 font-mono ml-1">{ts}</span>
                                          )}
                                          <span className="block text-charcoal-500 truncate max-w-[220px] sm:max-w-[280px]">
                                            {ref.episode_title}
                                          </span>
                                        </span>
                                        {url && (
                                          <svg className="w-3 h-3 text-charcoal-300 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                            <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                                            <polyline points="15 3 21 3 21 9" />
                                            <line x1="10" y1="14" x2="21" y2="3" />
                                          </svg>
                                        )}
                                      </Tag>
                                    )
                                  })}
                                </div>
                              </div>
                            )
                          })()}
                        </div>
                      )}
                    </div>
                  </div>
                ))
              )}

              {/* Loading indicator */}
              {isChatLoading && (
                <div className="flex justify-start">
                  <div className="flex items-center gap-2">
                    <BeanAnimation size={24} />
                    <div className="bg-cream-100 rounded-xl px-4 py-2.5 text-sm text-charcoal-500">
                      <span className="inline-flex gap-1">
                        <span className="animate-bounce" style={{ animationDelay: '0ms' }}>·</span>
                        <span className="animate-bounce" style={{ animationDelay: '150ms' }}>·</span>
                        <span className="animate-bounce" style={{ animationDelay: '300ms' }}>·</span>
                      </span>
                    </div>
                  </div>
                </div>
              )}

              {/* Error message */}
              {chatError && (
                <div className="flex justify-center">
                  <div className="text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2 max-w-sm text-center">
                    {chatError}
                  </div>
                </div>
              )}
            </div>

            {/* Input area */}
            <div className="pt-3 border-t border-charcoal-200/60 bg-cream-50 sticky bottom-0 z-50">
              {/* Credits display */}
              {creditsRemaining !== null && creditsTotal !== null && (
                <div className="flex items-center justify-between mb-2 px-1">
                  <div className="flex items-center gap-2">
                    <div className="flex gap-0.5">
                      {Array.from({ length: creditsTotal }).map((_, i) => (
                        <img
                          key={i}
                          src={i < creditsRemaining ? '/beansfilled.svg' : '/beanempty.svg'}
                          alt=""
                          className="w-4 h-4 transition-opacity"
                          style={{ opacity: i < creditsRemaining ? 1 : 0.35 }}
                        />
                      ))}
                    </div>
                    <span className="text-[10px] text-charcoal-400">
                      {creditsRemaining} question{creditsRemaining !== 1 ? 's' : ''} left today
                    </span>
                  </div>
                </div>
              )}

              {sttError && (
                <p className="text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2 mb-2">
                  {sttError}
                </p>
              )}
              {isListening && (
                <div className="flex items-center justify-between mb-2 px-1">
                  <button
                    onClick={handleCancelSpeech}
                    className="text-xs text-charcoal-500 hover:text-charcoal-700 transition-colors flex items-center gap-1"
                  >
                    <svg
                      className="w-3 h-3"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
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
                    <span className="text-xs font-mono text-red-600">
                      {elapsed}s
                    </span>
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
                    setChatError(null)
                  }}
                  placeholder={
                    isListening
                      ? 'Listening…'
                      : creditsRemaining === 0
                        ? 'No questions left today. Come back tomorrow!'
                        : 'Ask Bean anything about the podcast…'
                  }
                  className={`w-full px-4 py-3 ${
                    sttSupported ? 'pr-20' : 'pr-12'
                  } rounded-xl bg-cream-100 text-sm text-charcoal-900 placeholder:text-charcoal-400 focus:outline-none focus:ring-2 focus:ring-accent-600/20 focus:bg-white transition-all ${
                    isListening ? 'italic text-charcoal-600 ring-2 ring-red-300/40' : ''
                  }`}
                  disabled={isChatLoading || creditsRemaining === 0}
                />
                {/* Mic button */}
                {sttSupported && !isChatLoading && creditsRemaining !== 0 && (
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
                      <svg
                        className="w-4 h-4"
                        viewBox="0 0 24 24"
                        fill="currentColor"
                      >
                        <rect x="6" y="6" width="12" height="12" rx="2" />
                      </svg>
                    ) : (
                      /* Mic icon */
                      <svg
                        className="w-4 h-4"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
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
                  disabled={
                    !chatInput.trim() || isChatLoading || creditsRemaining === 0
                  }
                  className="absolute right-3 top-1/2 -translate-y-1/2 p-1.5 text-charcoal-400 hover:text-accent-600 disabled:opacity-40 transition-colors"
                >
                  <svg
                    className="w-4 h-4"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <line x1="22" y1="2" x2="11" y2="13" />
                    <polygon points="22 2 15 22 11 13 2 9 22 2" />
                  </svg>
                </button>
              </form>
              <p className="text-center text-[10px] text-charcoal-400 mt-2 pb-1">
                Powered by podcast transcripts · Always verify with original sources
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
