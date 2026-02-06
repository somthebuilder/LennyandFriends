'use client'

import { useState, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import AuthModal from '@/components/AuthModal'
import type { User } from '@supabase/supabase-js'

interface UserContext {
  name: string
  role?: string
  company?: string
  interests?: string
  goals?: string
}

interface Podcast {
  id: string
  name: string
  description: string
  category?: string
  vote_count: number
  podcast_link?: string
}

export default function Home() {
  const router = useRouter()
  const [userContext, setUserContext] = useState<UserContext | null>(null)
  const [showNameInput, setShowNameInput] = useState(false)
  const [showRequestModal, setShowRequestModal] = useState(false)
  const [showAuthModal, setShowAuthModal] = useState(false)
  const [authMode, setAuthMode] = useState<'signin' | 'signup'>('signin')
  const [pendingAction, setPendingAction] = useState<'vote' | 'request' | null>(null)
  const [pendingVotePodcast, setPendingVotePodcast] = useState<string | null>(null)
  const [user, setUser] = useState<User | null>(null)
  const [podcasts, setPodcasts] = useState<Podcast[]>([])
  const [votedPodcastIds, setVotedPodcastIds] = useState<string[]>([])
  const [isLoadingPodcasts, setIsLoadingPodcasts] = useState(true)
  const formRef = useRef<HTMLDivElement>(null)

  // Check auth status on mount
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null)
      if (session?.access_token) {
        fetchUserVotes(session.access_token)
      }
    })

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null)
      if (session?.access_token) {
        fetchUserVotes(session.access_token)
      } else {
        setVotedPodcastIds([])
      }
    })

    return () => subscription.unsubscribe()
  }, [])

  // Fetch podcasts from backend on mount
  useEffect(() => {
    fetchPodcasts()
  }, [])

  const fetchUserVotes = async (token?: string) => {
    if (!token) return
    
    try {
      const response = await fetch('/api/user-votes', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      })
      if (response.ok) {
        const data = await response.json()
        setVotedPodcastIds(data.voted_podcast_ids || [])
      }
    } catch (error) {
      console.error('Error fetching user votes:', error)
    }
  }

  const fetchPodcasts = async () => {
    try {
      const response = await fetch('/api/podcasts')
      if (response.ok) {
        const data = await response.json()
        setPodcasts(data)
      }
    } catch (error) {
      console.error('Error fetching podcasts:', error)
    } finally {
      setIsLoadingPodcasts(false)
    }
  }

  const handleVote = async (podcastName: string) => {
    // Check if user is authenticated
    if (!user) {
      setPendingAction('vote')
      setPendingVotePodcast(podcastName)
      setAuthMode('signin')
      setShowAuthModal(true)
      return
    }

    // Find the podcast in our state
    const podcast = podcasts.find(p => p.name === podcastName)
    if (!podcast) return

    // Check if user has already voted
    if (votedPodcastIds.includes(podcast.id)) {
      alert('You have already voted for this podcast')
      return
    }

    // Optimistic update - increment vote count immediately
    setPodcasts(prev => prev.map(p => 
      p.name === podcastName ? { ...p, vote_count: p.vote_count + 1 } : p
    ))
    setVotedPodcastIds(prev => [...prev, podcast.id])

    try {
      const { data: { session } } = await supabase.auth.getSession()
      
      const response = await fetch('/api/podcast-vote', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session?.access_token}`
        },
        body: JSON.stringify({
          podcast_name: podcastName
        })
      })

      if (!response.ok) {
        const errorData = await response.json()
        // Revert on error
        setPodcasts(prev => prev.map(p => 
          p.name === podcastName ? { ...p, vote_count: podcast.vote_count } : p
        ))
        setVotedPodcastIds(prev => prev.filter(id => id !== podcast.id))
        
        if (response.status === 400) {
          alert(errorData.detail || 'You have already voted for this podcast')
        } else {
          console.error('Failed to vote')
        }
      } else {
        // Sync with backend response
        const result = await response.json()
        if (result.new_vote_count !== undefined) {
          setPodcasts(prev => prev.map(p => 
            p.name === podcastName ? { ...p, vote_count: result.new_vote_count } : p
          ))
        }
      }
    } catch (error) {
      // Revert on error
      setPodcasts(prev => prev.map(p => 
        p.name === podcastName ? { ...p, vote_count: podcast.vote_count } : p
      ))
      setVotedPodcastIds(prev => prev.filter(id => id !== podcast.id))
      console.error('Error voting:', error)
    }
  }

  const handleRequestPodcastClick = () => {
    // Check if user is authenticated
    if (!user) {
      setPendingAction('request')
      setAuthMode('signin')
      setShowAuthModal(true)
      return
    }
    setShowRequestModal(true)
  }

  const handleAuthSuccess = () => {
    // Execute pending action after successful auth
    if (pendingAction === 'vote' && pendingVotePodcast) {
      // Reload page to re-trigger vote with authenticated user
      window.location.reload()
    } else if (pendingAction === 'request') {
      setShowRequestModal(true)
    }
    setPendingAction(null)
    setPendingVotePodcast(null)
  }

  const handleSignOut = async () => {
    await supabase.auth.signOut()
    setUser(null)
  }

  const handleLennyPodcastClick = () => {
    setShowNameInput(true)
  }

  const handleNameSubmit = (context: UserContext) => {
    setUserContext(context)
    // Navigate to Lenny's podcast chat with user context
    const params = new URLSearchParams({
      name: context.name,
      role: context.role || '',
      company: context.company || '',
      interests: context.interests || '',
      goals: context.goals || ''
    })
    router.push(`/chat/lennyandfriends?${params.toString()}`)
  }

  if (!showNameInput) {
    return (
      <>
        <div className="min-h-screen w-full bg-cream-100 flex flex-col">
          {/* Sticky Header */}
          <header className="sticky top-0 z-50 bg-white border-b border-charcoal-200 shadow-sm">
            <div className="max-w-7xl mx-auto px-6 md:px-12 py-4">
              <div className="flex justify-between items-center">
                {/* Logo/Brand */}
                <div className="flex items-center gap-3">
                  <img 
                    src="/panelchat-logo.svg" 
                    alt="Panel Chat"
                    className="h-8 md:h-10 w-auto"
                  />
                </div>
                
                {/* Auth Button */}
                {user ? (
                  <div className="flex items-center gap-3">
                    <span className="text-sm text-charcoal-600 hidden sm:inline">
                      {user.email}
                    </span>
                    <button
                      onClick={handleSignOut}
                      className="px-4 py-2 text-sm font-medium text-charcoal-600 border border-charcoal-300 rounded-lg hover:bg-charcoal-50 transition-colors"
                    >
                      Sign Out
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => {
                      setAuthMode('signin')
                      setShowAuthModal(true)
                    }}
                    className="px-4 py-2 text-sm font-medium text-orange-600 border border-orange-300 rounded-lg hover:bg-orange-50 transition-colors"
                  >
                    Sign In
                  </button>
                )}
              </div>
            </div>
          </header>

          {/* Main Content */}
          <div className="flex-1 max-w-7xl mx-auto px-6 md:px-12 py-8 md:py-12 w-full">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-16 items-start">
              
              {/* Left Column: Lenny Card + Other Podcasts */}
              <div className="order-2 lg:order-1 space-y-8">
                <div className="editorial-card p-8 md:p-10">
                  <div className="flex flex-col items-center text-center space-y-6">
                    {/* Lenny Logo Image */}
                    <div className="w-48 h-48 md:w-56 md:h-56 flex items-center justify-center">
                      <img 
                        src="/lennylogo.svg" 
                        alt="Lenny's Podcast"
                        className="w-full h-full object-contain"
                      />
                    </div>
                    
                    {/* Podcast Name */}
                    <div>
                      <h2 className="text-3xl md:text-4xl font-display font-semibold text-charcoal-700 mb-2">
                        Lenny's Podcast
                      </h2>
                      <p className="text-charcoal-500 text-lg">
                        Hosted by Lenny Rachitsky
                      </p>
                    </div>
                    
                    {/* Real Podcast Tagline */}
                    <p className="text-charcoal-600 text-base leading-relaxed max-w-md">
                      Deeply researched no-nonsense product, growth, and career advice
                    </p>
                    
                    {/* Button */}
                    <button
                      onClick={handleLennyPodcastClick}
                      className="soft-button w-full md:w-auto px-8 py-3 text-base"
                    >
                      Ask the panel
                    </button>
                  </div>
                </div>

                {/* Other Podcasts Requests Section */}
                <div className="editorial-card p-6 md:p-8">
                  <h2 className="text-2xl font-semibold text-charcoal-700 mb-6">
                    Other Podcasts requests
                  </h2>

                  {/* Podcast Grid */}
                  {isLoadingPodcasts ? (
                    <div className="flex items-center justify-center py-8">
                      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-orange-600"></div>
                    </div>
                  ) : podcasts.length === 0 ? (
                    <p className="text-center text-charcoal-500 py-8">No podcasts available</p>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                      {podcasts.map((podcast) => (
                        <PodcastCard
                          key={podcast.id}
                          name={podcast.name}
                          description={podcast.description}
                          votes={podcast.vote_count}
                          hasVoted={votedPodcastIds.includes(podcast.id)}
                          onVote={() => handleVote(podcast.name)}
                        />
                      ))}
                    </div>
                  )}

                  {/* Request Another Podcast Button */}
                  <button
                    onClick={handleRequestPodcastClick}
                    className="w-full px-6 py-4 border-2 border-dashed border-charcoal-300 rounded-lg text-charcoal-600 font-medium hover:bg-charcoal-50 transition-all duration-200 flex items-center justify-center gap-2"
                  >
                    <span className="text-2xl">+</span>
                    Request Another Podcast
                  </button>
                </div>
              </div>

              {/* Right Column: Panel Chat Hero */}
              <div className="order-1 lg:order-2">
                <div className="space-y-8 lg:space-y-10">
                  {/* Hero Product Name with Icon - IN ONE ROW */}
                  <div className="relative">
                    {/* Decorative element */}
                    <div className="absolute -left-4 top-0 w-1 h-24 bg-gradient-to-b from-orange-600 to-orange-400 rounded-full opacity-60"></div>
                    
                    {/* Logo + Name in single row */}
                    <div className="flex items-center gap-4 md:gap-6">
                      {/* Minimal Logo Icon - Overlapping Speech Bubbles representing Panel of Experts */}
                      <div className="flex-shrink-0 relative w-16 h-16 md:w-20 md:h-20">
                        <svg width="80" height="80" viewBox="0 0 80 80" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-full">
                          <defs>
                            <linearGradient id="orangeGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                              <stop offset="0%" style={{stopColor: '#F97316', stopOpacity: 1}} />
                              <stop offset="100%" style={{stopColor: '#EA580C', stopOpacity: 1}} />
                            </linearGradient>
                          </defs>
                          
                          {/* Back bubble - Light */}
                          <path d="M52 24C52 17.3726 46.6274 12 40 12C33.3726 12 28 17.3726 28 24C28 30.6274 33.3726 36 40 36L36 42L40 36C46.6274 36 52 30.6274 52 24Z" 
                                fill="url(#orangeGrad)" 
                                opacity="0.3"/>
                          
                          {/* Middle bubble - Medium */}
                          <path d="M58 40C58 33.3726 52.6274 28 46 28C39.3726 28 34 33.3726 34 40C34 46.6274 39.3726 52 46 52L42 58L46 52C52.6274 52 58 46.6274 58 40Z" 
                                fill="url(#orangeGrad)" 
                                opacity="0.6"/>
                          
                          {/* Front bubble - Full opacity */}
                          <path d="M48 52C48 45.3726 42.6274 40 36 40C29.3726 40 24 45.3726 24 52C24 58.6274 29.3726 64 36 64L32 70L36 64C42.6274 64 48 58.6274 48 52Z" 
                                fill="url(#orangeGrad)"/>
                          
                          {/* Subtle dots to represent voices/people */}
                          <circle cx="34" cy="52" r="1.5" fill="white" opacity="0.9"/>
                          <circle cx="36" cy="52" r="1.5" fill="white" opacity="0.9"/>
                          <circle cx="38" cy="52" r="1.5" fill="white" opacity="0.9"/>
                        </svg>
                      </div>
                      
                      {/* Product Name - HERO SIZE */}
                      <h1 className="text-5xl md:text-6xl lg:text-7xl font-display font-bold text-charcoal-800 tracking-tight leading-none">
                        Panel<span className="bg-gradient-to-r from-orange-600 to-orange-500 bg-clip-text text-transparent">Chat</span>
                      </h1>
                    </div>
                  </div>
                  
                  {/* Tagline - Refined and Smaller */}
                  <div className="space-y-3">
                    <div className="inline-flex items-center gap-2 px-4 py-2 bg-orange-50 rounded-full">
                      <div className="w-2 h-2 bg-orange-500 rounded-full animate-pulse"></div>
                      <span className="text-sm font-medium text-orange-700 uppercase tracking-wide">Expert Insights</span>
                    </div>
                    
                    <p className="text-2xl md:text-3xl font-display font-medium text-charcoal-600 leading-relaxed">
                      Real problems.<br />
                      Real experts.<br />
                      Real perspectives.
                    </p>
                  </div>
                  
                  {/* Description */}
                  <p className="text-lg md:text-xl text-charcoal-600 leading-relaxed max-w-xl">
                    Ask questions and get insights from <span className="font-semibold text-charcoal-700">experts</span> who've been there, done that.
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Footer with Copyright */}
          <footer className="bg-white border-t border-charcoal-200 mt-auto">
            <div className="max-w-7xl mx-auto px-6 md:px-12 py-6">
              <div className="flex flex-col md:flex-row justify-between items-center gap-4">
                <div className="text-sm text-charcoal-600">
                  © {new Date().getFullYear()} Panel Chat. All rights reserved.
                </div>
                <div className="flex items-center gap-6 text-sm text-charcoal-500">
                  <a href="#" className="hover:text-orange-600 transition-colors">
                    Privacy Policy
                  </a>
                  <a href="#" className="hover:text-orange-600 transition-colors">
                    Terms of Service
                  </a>
                  <a href="#" className="hover:text-orange-600 transition-colors">
                    Contact
                  </a>
                </div>
              </div>
            </div>
          </footer>
        </div>

        {/* Auth Modal */}
        <AuthModal
          isOpen={showAuthModal}
          onClose={() => setShowAuthModal(false)}
          onSuccess={handleAuthSuccess}
          mode={authMode}
        />

        {/* Request Podcast Modal */}
        {showRequestModal && (
          <RequestPodcastModal onClose={() => setShowRequestModal(false)} />
        )}
      </>
    )
  }

  if (showNameInput) {
    return (
      <div className="relative">
        {/* Question Input Screen - Centered Card */}
        <div className="min-h-screen w-full bg-cream-100 flex items-center justify-center p-6 md:p-8">
          <div className="w-full max-w-2xl">
            <div className="editorial-card p-8 md:p-12">
              <NameInput onSubmit={handleNameSubmit} />
            </div>
          </div>
        </div>
      </div>
    )
  }

  // Default: return null (landing page is shown in the first if statement)
  return null
}

function NameInput({ onSubmit }: { onSubmit: (context: UserContext) => void }) {
  const [name, setName] = useState('')
  const [role, setRole] = useState('')
  const [interests, setInterests] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!name.trim() || !role.trim() || !interests.trim()) {
      return
    }
    
    onSubmit({
      name: name.trim(),
      role: role.trim(),
      interests: interests.trim(),
    })
  }

  // Rotating placeholder examples for the question
  const placeholderExamples = [
    "How do you prioritize features when resources are limited?",
    "What's the best way to build a product team from scratch?",
    "How do you measure product-market fit?",
    "What strategies work best for user retention?",
    "How do you balance speed and quality in product development?",
    "What books would you recommend for product management?"
  ]
  
  const [currentPlaceholderIndex, setCurrentPlaceholderIndex] = useState(0)
  
  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentPlaceholderIndex((prev) => (prev + 1) % placeholderExamples.length)
    }, 3000)
    
    return () => clearInterval(interval)
  }, [])

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="space-y-1">
        <h2 className="text-2xl md:text-3xl font-display font-semibold text-charcoal-700 text-center mb-8">
          Tell us about yourself
        </h2>
      </div>

      {/* Name Field */}
      <div>
        <label htmlFor="name" className="block text-sm font-medium text-charcoal-700 mb-2">
          Name *
        </label>
        <input
          ref={inputRef}
          type="text"
          id="name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Your name"
          className="editorial-input w-full"
          required
        />
      </div>

      {/* Role Field */}
      <div>
        <label htmlFor="role" className="block text-sm font-medium text-charcoal-700 mb-2">
          Role *
        </label>
        <input
          type="text"
          id="role"
          value={role}
          onChange={(e) => setRole(e.target.value)}
          placeholder="e.g., Product Manager, Founder, Designer"
          className="editorial-input w-full"
          required
        />
      </div>

      {/* Interests/Question Field */}
      <div>
        <label htmlFor="interests" className="block text-sm font-medium text-charcoal-700 mb-2">
          What would you like to ask? *
        </label>
        <textarea
          id="interests"
          value={interests}
          onChange={(e) => setInterests(e.target.value)}
          placeholder={placeholderExamples[currentPlaceholderIndex]}
          rows={4}
          className="editorial-textarea w-full"
          required
        />
      </div>

      {/* Microcopy */}
      <p className="text-sm text-charcoal-500 text-center">
        You may get a quick follow up if context helps.
      </p>

      <button
        type="submit"
        disabled={!name.trim() || !role.trim() || !interests.trim()}
        className="soft-button w-full disabled:opacity-50 disabled:cursor-not-allowed"
      >
        Ask the panel
      </button>
    </form>
  )
}

// Podcast Card Component
function PodcastCard({
  name,
  description,
  votes,
  hasVoted,
  onVote,
}: {
  name: string
  description: string
  votes: number
  hasVoted: boolean
  onVote: () => void
}) {
  return (
    <div className="editorial-card p-4 hover:shadow-md transition-shadow">
      <div className="flex items-start gap-3 mb-3">
        <div className="w-16 h-16 rounded-lg bg-gradient-to-br from-orange-100 to-orange-200 flex items-center justify-center flex-shrink-0">
          <span className="text-2xl">🎙️</span>
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-charcoal-700 mb-1">{name}</h3>
          <p className="text-sm text-charcoal-600 leading-relaxed">{description}</p>
        </div>
      </div>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1 text-sm text-charcoal-500">
          <span>👍</span>
          <span>{votes}</span>
        </div>
        <button
          onClick={onVote}
          disabled={hasVoted}
          className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
            hasVoted
              ? 'bg-charcoal-100 text-charcoal-400 cursor-not-allowed'
              : 'text-orange-600 border border-orange-300 hover:bg-orange-50'
          }`}
        >
          {hasVoted ? '✓ Voted' : 'Vote'}
        </button>
      </div>
    </div>
  )
}

// Request Podcast Modal Component
function RequestPodcastModal({ onClose }: { onClose: () => void }) {
  const [podcastName, setPodcastName] = useState('')
  const [podcastLink, setPodcastLink] = useState('')
  const [questions, setQuestions] = useState('')
  const [note, setNote] = useState('')
  const [email, setEmail] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!podcastName.trim() || !podcastLink.trim() || !questions.trim() || !email.trim()) {
      setMessage({ type: 'error', text: 'Please fill in all required fields' })
      return
    }

    // Validate email
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(email)) {
      setMessage({ type: 'error', text: 'Please enter a valid email address' })
      return
    }

    setIsSubmitting(true)
    setMessage(null)

    try {
      const response = await fetch('/api/podcast-request', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          podcast_name: podcastName.trim(),
          podcast_link: podcastLink.trim(),
          questions: questions.trim(),
          note: note.trim() || null,
          email: email.trim(),
        }),
      })

      const data = await response.json()

      if (response.ok) {
        setMessage({ type: 'success', text: 'Request submitted! We\'ll notify you when it launches.' })
        setTimeout(() => {
          onClose()
          // Reset form
          setPodcastName('')
          setPodcastLink('')
          setQuestions('')
          setNote('')
          setEmail('')
        }, 2000)
      } else {
        setMessage({ type: 'error', text: data.detail || 'Error submitting request' })
      }
    } catch (error) {
      console.error('Error submitting podcast request:', error)
      setMessage({ type: 'error', text: 'Network error. Try again.' })
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="editorial-card p-8 max-w-2xl w-full max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-semibold text-charcoal-700">Request a Podcast</h2>
          <button
            onClick={onClose}
            className="text-charcoal-400 hover:text-charcoal-600 text-2xl leading-none"
          >
            ×
          </button>
        </div>
        
        <div className="border-t border-charcoal-200 pt-6 mb-6">
          <p className="text-charcoal-600">
            Don't see your favorite? Help us prioritize what to build next.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Podcast name */}
          <div>
            <label className="block text-sm font-medium text-charcoal-700 mb-2">
              Podcast name <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={podcastName}
              onChange={(e) => setPodcastName(e.target.value)}
              placeholder="e.g., The Tim Ferriss Show"
              className="editorial-input w-full"
              required
            />
          </div>

          {/* Link to podcast */}
          <div>
            <label className="block text-sm font-medium text-charcoal-700 mb-2">
              Link to podcast <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={podcastLink}
              onChange={(e) => setPodcastLink(e.target.value)}
              placeholder="Spotify, Apple, YouTube, or RSS link"
              className="editorial-input w-full"
              required
            />
            <p className="text-xs text-charcoal-500 mt-1">Spotify, Apple, YouTube, or RSS link</p>
          </div>

          {/* What would you ask */}
          <div>
            <label className="block text-sm font-medium text-charcoal-700 mb-2">
              What would you ask this podcast's guests? <span className="text-red-500">*</span>
            </label>
            <textarea
              value={questions}
              onChange={(e) => setQuestions(e.target.value)}
              placeholder='E.g., "Fundraising strategies, market analysis, product strategy"'
              rows={4}
              className="editorial-textarea w-full"
              required
            />
          </div>

          {/* Add a note */}
          <div>
            <label className="block text-sm font-medium text-charcoal-700 mb-2">
              Add a note <span className="text-charcoal-400 font-normal">(optional)</span>
            </label>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Tell us why this podcast would be valuable to you. What makes it different? Who are the key guests? Thoughtful requests get priority."
              rows={5}
              className="editorial-textarea w-full"
            />
          </div>

          {/* Email */}
          <div>
            <label className="block text-sm font-medium text-charcoal-700 mb-2">
              Your email <span className="text-red-500">*</span>
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="your@email.com"
              className="editorial-input w-full"
              required
            />
            <p className="text-xs text-charcoal-500 mt-1">We'll notify you when it launches</p>
          </div>

          {message && (
            <div className={`p-4 rounded-lg ${
              message.type === 'success' 
                ? 'bg-green-50 text-green-700 border border-green-200' 
                : 'bg-red-50 text-red-700 border border-red-200'
            }`}>
              <p className="text-sm">
                {message.text}
              </p>
            </div>
          )}

          <div className="flex gap-3">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-6 py-3 border border-charcoal-300 text-charcoal-700 rounded-lg font-medium hover:bg-charcoal-50 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="flex-1 soft-button disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSubmitting ? 'Submitting...' : 'Submit Request'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// Add AuthModal to the JSX return
// Update the return statement to include AuthModal
