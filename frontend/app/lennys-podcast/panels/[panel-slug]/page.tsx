'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import Footer from '@/components/Footer'
import AuthModal from '@/components/AuthModal'
import type { User } from '@supabase/supabase-js'
import type { Panel, Discussion, QuickFilter, PanelTab, QuestionResponse, PanelConsensus } from '@/lib/types/panel'

// Components
import StarButton from '@/components/panels/StarButton'
import PanelExperts from '@/components/panels/PanelExperts'
import PanelTabs from '@/components/panels/PanelTabs'
import QuickFilters from '@/components/panels/QuickFilters'
import DiscussionCard from '@/components/panels/DiscussionCard'
import QuestionInput from '@/components/panels/QuestionInput'
import LoadingState from '@/components/panels/LoadingState'
import ExpertResponse from '@/components/panels/ExpertResponse'
import NoResults from '@/components/panels/NoResults'
import SignInPrompt from '@/components/panels/SignInPrompt'

export default function PanelPage() {
  const params = useParams()
  const router = useRouter()
  const searchParams = useSearchParams()
  const panelSlug = (params?.['panel-slug'] as string) || ''
  
  // State
  const [user, setUser] = useState<User | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [panel, setPanel] = useState<Panel | null>(null)
  const [isMarkedValuable, setIsMarkedValuable] = useState(false)
  const [activeTab, setActiveTab] = useState<PanelTab>('discussion')
  const [activeFilter, setActiveFilter] = useState<QuickFilter>('all')
  const [showAuthModal, setShowAuthModal] = useState(false)
  const [authMode, setAuthMode] = useState<'signin' | 'signup'>('signin')
  
  // Tab 2: Ask Panel state
  const [question, setQuestion] = useState('')
  const [questionMentions, setQuestionMentions] = useState<Array<{ expertId: string | null; expertName: string; startIndex: number; endIndex: number }>>([])
  const [isLoadingResponse, setIsLoadingResponse] = useState(false)
  const [responses, setResponses] = useState<QuestionResponse[]>([])
  const [consensus, setConsensus] = useState<PanelConsensus | null>(null)
  const [showNoResults, setShowNoResults] = useState(false)
  const [showSignInOverlay, setShowSignInOverlay] = useState(false)

  // Check URL for tab parameter
  useEffect(() => {
    const tabParam = searchParams.get('tab')
    if (tabParam === 'ask') {
      setActiveTab('ask')
    }
  }, [searchParams])

  // Auth state
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null)
    })

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null)
    })

    return () => subscription.unsubscribe()
  }, [])

  // Fetch panel data
  useEffect(() => {
    if (!panelSlug) return

    const fetchPanel = async () => {
      setIsLoading(true)
      try {
        // Get auth token if user is logged in
        const { data: { session } } = await supabase.auth.getSession()
        const headers: HeadersInit = {
          'Content-Type': 'application/json',
        }
        if (session?.access_token) {
          headers['Authorization'] = `Bearer ${session.access_token}`
        }

        const response = await fetch(`/api/panels/${panelSlug}`, {
          headers,
        })
        if (!response.ok) {
          throw new Error('Panel not found')
        }
        const data = await response.json()
        setPanel(data.panel)
        setIsMarkedValuable(data.isMarkedValuable || false)
      } catch (error) {
        console.error('Error fetching panel:', error)
        // TODO: Show error state
      } finally {
        setIsLoading(false)
      }
    }

    fetchPanel()
  }, [panelSlug])

  // Update URL when tab changes
  useEffect(() => {
    const newUrl = activeTab === 'ask' 
      ? `/lennys-podcast/panels/${panelSlug}?tab=ask`
      : `/lennys-podcast/panels/${panelSlug}`
    router.replace(newUrl, { scroll: false })
  }, [activeTab, panelSlug, router])

  // Filter discussions
  const filteredDiscussions = panel?.discussions.filter(discussion => {
    if (activeFilter === 'all') return true
    if (activeFilter === 'disagreements') {
      return discussion.agreementLevel === 'moderate_disagreement' || 
             discussion.agreementLevel === 'strong_disagreement'
    }
    if (activeFilter === 'consensus') {
      return discussion.agreementLevel === 'consensus'
    }
    if (activeFilter === 'actionable') {
      return discussion.keyTakeaways.some(t => t.type === 'actionable')
    }
    return true
  }) || []

  const handleAskExpert = (expertName: string) => {
    setActiveTab('ask')
    setQuestion(`@${expertName.split(' ')[0]} `)
  }

  const handleQuestionSubmit = async () => {
    if (!user) {
      setShowSignInOverlay(true)
      return
    }

    if (!question.trim()) return

    setIsLoadingResponse(true)
    setShowNoResults(false)
    setResponses([])
    setConsensus(null)

    try {
      // Get auth token
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.access_token) {
        setShowSignInOverlay(true)
        return
      }

      const mentionedExpertIds = questionMentions
        .filter(m => m.expertId !== null)
        .map(m => m.expertId as string)

      const response = await fetch(`/api/panels/${panelSlug}/ask`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          question: question.trim(),
          mentionedExpertIds: mentionedExpertIds.length > 0 ? mentionedExpertIds : null,
        }),
      })

      if (!response.ok) {
        throw new Error('Failed to get response')
      }

      const data = await response.json()
      
      if (data.responses && data.responses.length > 0) {
        setResponses(data.responses)
        setConsensus(data.consensus || null)
      } else {
        setShowNoResults(true)
      }
    } catch (error) {
      console.error('Error asking panel:', error)
      // TODO: Show error toast
    } finally {
      setIsLoadingResponse(false)
    }
  }

  const handlePopularQuestionClick = (popularQuestion: string) => {
    setQuestion(popularQuestion)
    // Auto-submit after a brief delay
    setTimeout(() => {
      handleQuestionSubmit()
    }, 100)
  }

  const handleAuthSuccess = () => {
    setShowAuthModal(false)
    setShowSignInOverlay(false)
    // Retry the action that required auth
    if (question.trim()) {
      handleQuestionSubmit()
    }
  }

  if (isLoading) {
    return (
      <div className="min-h-screen w-full bg-gradient-to-br from-cream-50 via-white to-orange-50/20 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-orange-600 mx-auto mb-4"></div>
          <p className="text-charcoal-600">Loading panel...</p>
        </div>
      </div>
    )
  }

  if (!panel) {
    return (
      <div className="min-h-screen w-full bg-gradient-to-br from-cream-50 via-white to-orange-50/20 flex items-center justify-center">
        <div className="text-center">
          <p className="text-charcoal-600 mb-4">Panel not found</p>
          <button
            onClick={() => router.push('/lennys-podcast/panels')}
            className="px-6 py-3 text-sm font-semibold text-white bg-gradient-to-r from-orange-600 to-orange-500 rounded-xl"
          >
            Back to Panels
          </button>
        </div>
      </div>
    )
  }

  const popularQuestions = [
    "How do I know when I have product-market fit?",
    "Should I hire a growth PM or growth marketer first?",
    "What's the #1 growth metric I should track at seed stage?",
    "How do I balance short-term wins vs long-term bets?",
    "When should I start hiring a growth team?",
  ]

  return (
    <div className="min-h-screen w-full bg-gradient-to-br from-cream-50 via-white to-orange-50/20 flex flex-col">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-white/80 backdrop-blur-lg border-b border-charcoal-200/50 shadow-sm transition-all duration-300">
        <div className="w-full">
          <div className="max-w-7xl mx-auto px-6 md:px-12 py-4">
            <div className="flex justify-between items-center">
              {/* Breadcrumb */}
              <div className="flex items-center gap-2 text-sm">
                <button
                  onClick={() => router.push('/')}
                  className="flex items-center gap-3 group"
                >
                  <img 
                    src="/panelchat-logo.svg" 
                    alt="Panel Chat"
                    className="h-8 md:h-10 w-auto transition-transform group-hover:scale-105 duration-300"
                  />
                </button>
                <svg className="w-4 h-4 text-charcoal-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
                <button
                  onClick={() => router.push('/lennys-podcast/panels')}
                  className="text-charcoal-600 hover:text-orange-600 transition-colors font-medium"
                >
                  Lenny's Podcast
                </button>
                <svg className="w-4 h-4 text-charcoal-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
                <button
                  onClick={() => router.push('/lennys-podcast/panels')}
                  className="text-charcoal-600 hover:text-orange-600 transition-colors font-medium"
                >
                  Panels
                </button>
                <svg className="w-4 h-4 text-charcoal-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
                <span className="font-semibold text-charcoal-800">{panel.title}</span>
              </div>
              
              {/* Right Side Navigation */}
              <div className="flex items-center gap-6">
                {user ? (
                  <div className="flex items-center gap-4">
                    <span className="text-sm text-charcoal-600 hidden sm:inline font-medium">
                      {user.email}
                    </span>
                    <button
                      onClick={async () => {
                        await supabase.auth.signOut()
                        router.push('/')
                      }}
                      className="text-sm font-medium text-charcoal-700 hover:text-orange-600 transition-colors duration-200"
                    >
                      Sign out
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => {
                      setAuthMode('signin')
                      setShowAuthModal(true)
                    }}
                    className="text-sm font-medium text-charcoal-700 hover:text-orange-600 transition-colors duration-200"
                  >
                    Sign in
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <div className="flex-1 w-full">
        <div className="max-w-7xl mx-auto px-6 md:px-12 py-12 md:py-16">
          {/* Panel Header */}
          <div className="mb-12">
            <div className="editorial-card p-8 bg-white border border-charcoal-100">
              <div className="flex flex-col lg:flex-row gap-8">
                {/* Left: Panel Info */}
                <div className="flex-1">
                  <div className="mb-6">
                    <h1 className="text-4xl md:text-5xl font-display font-black text-charcoal-900 mb-4">
                      {panel.title}
                    </h1>
                    <div className="flex items-center gap-3 mb-4">
                      <span className="px-3 py-1 bg-orange-100 text-orange-700 rounded-full text-sm font-semibold">
                        {panel.category}
                      </span>
                    </div>
                    <p className="text-lg text-charcoal-600 leading-relaxed">
                      {panel.description}
                    </p>
                  </div>

                  {/* Star Button */}
                  <div className="mb-6">
                    <StarButton
                      panelId={panel.id}
                      panelSlug={panel.slug}
                      valuableCount={panel.metadata.valuableCount}
                      isMarked={isMarkedValuable}
                      user={user}
                      onToggle={(newValue) => setIsMarkedValuable(newValue)}
                    />
                  </div>
                </div>

                {/* Right: Panel Experts */}
                <div className="lg:w-80">
                  <PanelExperts experts={panel.experts} />
                </div>
              </div>
            </div>
          </div>

          {/* Tabs */}
          <PanelTabs activeTab={activeTab} onTabChange={setActiveTab} />

          {/* Tab Content */}
          <div className="transition-all duration-300">
            {activeTab === 'discussion' ? (
              // TAB 1: THE DISCUSSION
              <div>
                {/* Summary Line */}
                <p className="text-sm text-charcoal-600 mb-6">
                  {filteredDiscussions.length} key discussions · {panel.experts.length} experts
                </p>

                {/* Quick Filters */}
                <QuickFilters
                  activeFilter={activeFilter}
                  onFilterChange={setActiveFilter}
                  discussions={panel.discussions}
                />

                {/* Discussion Topics List */}
                <div className="space-y-6 mb-12">
                  {filteredDiscussions.map((discussion) => (
                    <DiscussionCard
                      key={discussion.id}
                      discussion={discussion}
                      onAskExpert={handleAskExpert}
                    />
                  ))}
                </div>

                {/* Bottom CTA */}
                <div className="editorial-card p-8 bg-gradient-to-br from-orange-50 to-white border border-orange-200 text-center">
                  <div className="text-4xl mb-4">💡</div>
                  <h3 className="text-xl font-bold text-charcoal-900 mb-2">
                    Can't find what you're looking for?
                  </h3>
                  <p className="text-charcoal-600 mb-6">
                    This panel has discussed {panel.discussions.length} key topics. If you have a specific question, ask the panel directly.
                  </p>
                  <button
                    onClick={() => setActiveTab('ask')}
                    className="px-6 py-3 bg-gradient-to-r from-orange-600 to-orange-500 text-white rounded-lg font-semibold hover:shadow-lg transition-all duration-200"
                  >
                    Ask the Panel your question →
                  </button>
                </div>
              </div>
            ) : (
              // TAB 2: ASK THE PANEL
              <div className="relative">
                {/* Auth Overlay */}
                {showSignInOverlay && !user && (
                  <div className="absolute inset-0 bg-white/80 backdrop-blur-sm z-10 flex items-center justify-center rounded-lg">
                    <div className="text-center p-8">
                      <p className="text-lg font-semibold text-charcoal-900 mb-4">
                        Sign in to ask questions
                      </p>
                      <button
                        onClick={() => {
                          setAuthMode('signin')
                          setShowAuthModal(true)
                        }}
                        className="px-6 py-3 bg-gradient-to-r from-orange-600 to-orange-500 text-white rounded-lg font-semibold hover:shadow-lg transition-all duration-200"
                      >
                        Sign in
                      </button>
                    </div>
                  </div>
                )}

                {!isLoadingResponse && responses.length === 0 && !showNoResults ? (
                  // Initial State
                  <div className="space-y-8">
                    <div>
                      <h2 className="text-3xl font-bold text-charcoal-900 mb-2">Ask the Panel</h2>
                      <div className="h-px bg-charcoal-200 mb-6"></div>
                    </div>

                    <p className="text-lg text-charcoal-600">
                      Ask your specific question and get insights from this panel's collective wisdom based on their actual podcast conversations.
                    </p>

                    {/* Popular Questions */}
                    <div>
                      <h3 className="text-lg font-semibold text-charcoal-900 mb-4 flex items-center gap-2">
                        <span>💡</span>
                        Popular questions others have asked:
                      </h3>
                      <ul className="space-y-2">
                        {popularQuestions.map((q, idx) => (
                          <li key={idx}>
                            <button
                              onClick={() => handlePopularQuestionClick(q)}
                              className="text-left text-charcoal-700 hover:text-orange-600 transition-colors text-base"
                            >
                              • {q}
                            </button>
                          </li>
                        ))}
                      </ul>
                    </div>

                    {/* Question Input */}
                    <div>
                      <QuestionInput
                        value={question}
                        onChange={(value, mentions) => {
                          setQuestion(value)
                          setQuestionMentions(mentions)
                        }}
                        onSubmit={handleQuestionSubmit}
                        experts={panel.experts}
                        disabled={!user}
                      />
                    </div>

                    {/* How It Works */}
                    <div className="editorial-card p-6 bg-charcoal-50 border border-charcoal-200">
                      <h3 className="text-lg font-semibold text-charcoal-900 mb-3 flex items-center gap-2">
                        <span>ℹ️</span>
                        How it works:
                      </h3>
                      <p className="text-charcoal-700">
                        Your question will be analyzed against all conversations from this panel's experts. You'll get perspectives from each expert based on what they actually discussed in their episodes. Use @ to direct your question to specific experts or @Panel for all.
                      </p>
                    </div>
                  </div>
                ) : isLoadingResponse ? (
                  // Loading State
                  <LoadingState question={question} />
                ) : showNoResults ? (
                  // No Results State
                  <NoResults
                    question={question}
                    panelTopics={panel.discussions.map(d => d.title)}
                    onAskDifferent={() => {
                      setQuestion('')
                      setResponses([])
                      setShowNoResults(false)
                      setConsensus(null)
                    }}
                  />
                ) : (
                  // Results State
                  <div className="space-y-8">
                    {/* Question Display */}
                    <div className="editorial-card p-6 bg-white border border-charcoal-100">
                      <label className="text-sm font-semibold text-charcoal-500 uppercase tracking-wider mb-2 block">
                        Your Question:
                      </label>
                      <p className="text-lg text-charcoal-900">{question}</p>
                    </div>

                    {/* Results Header */}
                    <h3 className="text-2xl font-bold text-charcoal-900">
                      Based on this panel's insights:
                    </h3>

                    {/* Expert Responses */}
                    <div className="space-y-6">
                      {responses.map((response) => (
                        <ExpertResponse key={response.id} response={response} />
                      ))}
                    </div>

                    {/* Panel Consensus */}
                    {consensus && consensus.agreeingExpertIds.length >= 2 && (
                      <div className="editorial-card p-6 bg-orange-50 border border-orange-200">
                        <h4 className="text-lg font-bold text-charcoal-900 mb-3 flex items-center gap-2">
                          <span>💡</span>
                          Panel Consensus:
                        </h4>
                        <p className="text-charcoal-700 leading-relaxed">
                          {consensus.summary}
                        </p>
                      </div>
                    )}

                    {/* Follow-up Section */}
                    <div className="border-t border-charcoal-200 pt-8">
                      <QuestionInput
                        value=""
                        onChange={(value, mentions) => {
                          setQuestion(value)
                          setQuestionMentions(mentions)
                        }}
                        onSubmit={handleQuestionSubmit}
                        placeholder="Ask a follow-up question..."
                        experts={panel.experts}
                        disabled={!user}
                      />
                      <div className="flex gap-3 mt-4">
                        <button
                          onClick={() => {
                            setQuestion('')
                            setResponses([])
                            setShowNoResults(false)
                            setConsensus(null)
                          }}
                          className="px-4 py-2 text-sm font-medium text-charcoal-700 border border-charcoal-300 rounded-lg hover:bg-charcoal-50 transition-colors"
                        >
                          Ask new question
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Auth Modal */}
      <AuthModal
        isOpen={showAuthModal}
        onClose={() => setShowAuthModal(false)}
        onSuccess={handleAuthSuccess}
        mode={authMode}
      />

      <Footer />
    </div>
  )
}

