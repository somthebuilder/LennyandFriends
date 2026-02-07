'use client'

import { useState, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import AuthModal from '@/components/AuthModal'
import Footer from '@/components/Footer'
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
  const [showCustomPanelModal, setShowCustomPanelModal] = useState(false)
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

  const handleCreateCustomPanelClick = () => {
    // Check if user is authenticated
    if (!user) {
      setPendingAction('request')
      setAuthMode('signin')
      setShowAuthModal(true)
      return
    }
    setShowCustomPanelModal(true)
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
    // Redirect to curated panels page
    router.push('/lennys-podcast/panels')
  }

  const handleNameSubmit = (context: UserContext) => {
    setUserContext(context)
    // Navigate to curated panels page
    router.push('/lennys-podcast/panels')
  }

  if (!showNameInput) {
    return (
      <>
        <div className="min-h-screen w-full bg-gradient-to-br from-cream-50 via-white to-orange-50/20 flex flex-col">
          {/* Sticky Header with backdrop blur */}
          <header className="sticky top-0 z-50 bg-white/80 backdrop-blur-lg border-b border-charcoal-200/50 shadow-sm transition-all duration-300">
            <div className="w-full">
            <div className="max-w-7xl mx-auto px-6 md:px-12 py-4">
              <div className="flex justify-between items-center">
                {/* Logo/Brand */}
                  <div className="flex items-center gap-3 group">
                  <img 
                    src="/panelchat-logo.svg" 
                    alt="Panel Chat"
                      className="h-8 md:h-10 w-auto transition-transform group-hover:scale-105 duration-300"
                  />
                </div>
                
              {/* Right Side Navigation */}
              <div className="flex items-center gap-6">
                {/* Auth Section */}
                {user ? (
                  <div className="flex items-center gap-4">
                    <span className="text-sm text-charcoal-600 hidden sm:inline font-medium">
                      {user.email}
                    </span>
                    <button
                      onClick={handleSignOut}
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
            <div className="max-w-7xl mx-auto px-6 md:px-12 py-12 md:py-16 space-y-16">
              {/* Top Section: Lenny Card + PanelChat Hero in 2 columns */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-20 items-start">
              
                {/* Left Column: Lenny Card */}
                <div className="order-2 lg:order-1 animate-fade-in-up">
                  <div className="editorial-card p-8 md:p-12 hover:shadow-xl hover:scale-[1.02] transition-all duration-500 bg-gradient-to-br from-white to-orange-50/30 border border-orange-100/50">
                  <div className="flex flex-col items-center text-center space-y-6">
                      {/* Lenny Logo Image with glow effect */}
                      <div className="relative w-48 h-48 md:w-56 md:h-56 flex items-center justify-center group">
                        <div className="absolute inset-0 bg-gradient-to-br from-orange-400/20 to-orange-600/20 rounded-full blur-2xl group-hover:blur-3xl transition-all duration-500 opacity-0 group-hover:opacity-100"></div>
                      <img 
                        src="/lennylogo.svg" 
                        alt="Lenny's Podcast"
                          className="relative w-full h-full object-contain transition-transform duration-300 group-hover:scale-105"
                      />
                    </div>
                    
                    {/* Podcast Name */}
                      <div className="space-y-2">
                        <h2 className="text-3xl md:text-4xl font-display font-bold text-charcoal-800 mb-2">
                        Lenny's Podcast
                      </h2>
                        <p className="text-charcoal-600 text-lg font-medium">
                        Hosted by Lenny Rachitsky
                      </p>
                    </div>
                    
                    {/* Real Podcast Tagline */}
                    <p className="text-charcoal-600 text-base leading-relaxed max-w-md">
                      Deeply researched no-nonsense product, growth, and career advice
                    </p>
                    
                      {/* Button with enhanced style */}
                    <button
                      onClick={handleLennyPodcastClick}
                        className="group relative w-full md:w-auto px-10 py-4 text-base font-semibold text-white bg-gradient-to-r from-orange-600 to-orange-500 rounded-xl shadow-lg shadow-orange-500/30 hover:shadow-xl hover:shadow-orange-500/50 hover:-translate-y-1 transition-all duration-300 overflow-hidden"
                    >
                        <span className="relative z-10 flex items-center justify-center gap-2">
                          {user ? 'Start chatting' : 'Get started'}
                          <svg className="w-5 h-5 group-hover:translate-x-1 transition-transform duration-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                          </svg>
                        </span>
                        <div className="absolute inset-0 bg-gradient-to-r from-orange-500 to-orange-400 opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
                    </button>
                  </div>
                </div>
              </div>

              {/* Right Column: Panel Chat Hero */}
              <div className="order-1 lg:order-2">
                  <div className="flex flex-col space-y-10 lg:space-y-12">
                  {/* Hero Product Name with Icon - IN ONE ROW */}
                    <div className="relative animate-fade-in-up">
                    {/* Logo + Name in single row */}
                      <div className="flex items-center gap-2 md:gap-3">
                      {/* Minimal Logo Icon - Overlapping Speech Bubbles representing Panel of Experts */}
                        <div className="flex-shrink-0 relative w-16 h-16 md:w-24 md:h-24 group p-0">
                          <div className="absolute inset-0 bg-gradient-to-br from-orange-400 to-orange-600 rounded-2xl blur-xl opacity-0 group-hover:opacity-30 transition-opacity duration-500"></div>
                          <svg width="96" height="96" viewBox="0 0 80 80" fill="none" xmlns="http://www.w3.org/2000/svg" className="relative w-full h-full group-hover:scale-105 transition-transform duration-300 p-0">
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
                      
                      {/* Product Name - HERO SIZE with cursor after */}
                      <div className="flex items-center gap-2">
                        <h1 className="text-4xl md:text-5xl lg:text-6xl xl:text-7xl font-display font-black text-charcoal-900 tracking-tight leading-none">
                          Panel<span className="bg-gradient-to-r from-orange-600 via-orange-500 to-orange-600 bg-clip-text text-transparent animate-gradient-x">Chat</span>
                      </h1>
                        {/* Blinking cursor after text */}
                        <div className="w-1 h-12 md:h-16 lg:h-20 xl:h-24 bg-orange-600 animate-blink rounded-full"></div>
                      </div>
                    </div>
                  </div>
                  
                  {/* Tagline - Refined and Smaller */}
                    <div className="space-y-4 animate-fade-in-up" style={{animationDelay: '200ms'}}>
                      <div className="inline-flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-orange-50 to-orange-100/50 rounded-full border border-orange-200/50 shadow-sm">
                        <div className="relative flex h-3 w-3">
                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-orange-400 opacity-75"></span>
                          <span className="relative inline-flex rounded-full h-3 w-3 bg-orange-500"></span>
                        </div>
                        <span className="text-sm font-bold text-orange-700 uppercase tracking-wider">Expert Insights</span>
                    </div>
                    
                      <p className="text-3xl md:text-4xl lg:text-5xl font-display font-bold text-charcoal-700 leading-tight">
                      Real problems.<br />
                      Real experts.<br />
                        <span className="text-orange-600">Real perspectives.</span>
                    </p>
                  </div>
                  
                  {/* Description */}
                    <p className="text-lg md:text-xl text-charcoal-600 leading-relaxed max-w-xl animate-fade-in-up" style={{animationDelay: '400ms'}}>
                      Ask questions and get insights from <span className="font-bold text-transparent bg-clip-text bg-gradient-to-r from-orange-600 to-orange-500">experts</span> who've been there, done that.
                  </p>
                </div>
                </div>
              </div>

              {/* Full Width Section: Other Podcasts Requests */}
              <div className="w-full space-y-6">
                {/* Section Header */}
                <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                  <div className="flex items-center gap-4">
                    <div>
                      <h2 className="text-3xl font-bold text-charcoal-800">
                        Other Podcasts Requests
                      </h2>
                    </div>
                    {user && (
                      <button
                        onClick={handleCreateCustomPanelClick}
                        className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-gradient-to-r from-orange-600 to-orange-500 rounded-lg hover:shadow-lg hover:shadow-orange-500/30 hover:-translate-y-0.5 transition-all duration-200"
                      >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                        </svg>
                        Create Custom Panel
                      </button>
                    )}
                  </div>
                  <div className="inline-flex items-center gap-2 px-4 py-2 bg-orange-50 rounded-full border border-orange-200/50">
                    <svg className="w-5 h-5 text-orange-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <span className="text-sm font-semibold text-orange-700">
                      Top 3 will be prioritized
                    </span>
                  </div>
                </div>

                {/* Podcast Grid */}
                {isLoadingPodcasts ? (
                  <div className="flex flex-col items-center justify-center py-12 space-y-4">
                    <div className="relative w-16 h-16">
                      <div className="absolute inset-0 rounded-full border-4 border-orange-200"></div>
                      <div className="absolute inset-0 rounded-full border-4 border-orange-600 border-t-transparent animate-spin"></div>
                    </div>
                    <p className="text-sm text-charcoal-500 font-medium">Loading podcasts...</p>
                  </div>
                ) : podcasts.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 space-y-4">
                    <div className="w-16 h-16 rounded-full bg-orange-100 flex items-center justify-center">
                      <svg className="w-8 h-8 text-orange-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                      </svg>
                    </div>
                    <p className="text-center text-charcoal-600 font-medium">No podcasts yet</p>
                    <p className="text-center text-charcoal-500 text-sm">Be the first to request one!</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {podcasts.map((podcast, index) => (
                      <div
                        key={podcast.id}
                        style={{ animationDelay: `${index * 100}ms` }}
                        className="animate-fade-in-up"
                      >
                        <PodcastCard
                          name={podcast.name}
                          description={podcast.description}
                          votes={podcast.vote_count}
                          hasVoted={votedPodcastIds.includes(podcast.id)}
                          onVote={() => handleVote(podcast.name)}
                        />
                      </div>
                    ))}
                    
                    {/* Request Another Podcast Card */}
                    <button
                      onClick={handleRequestPodcastClick}
                      className="group h-full min-h-[240px] px-6 py-8 border-2 border-dashed border-charcoal-300 rounded-xl text-charcoal-600 font-semibold hover:bg-gradient-to-br hover:from-orange-50 hover:to-white hover:border-orange-400 transition-all duration-300 flex flex-col items-center justify-center gap-4"
                    >
                      <div className="w-16 h-16 rounded-full bg-charcoal-100 group-hover:bg-orange-100 flex items-center justify-center transition-colors duration-300">
                        <span className="text-4xl text-charcoal-400 group-hover:text-orange-600 group-hover:scale-110 transition-all duration-300">+</span>
                      </div>
                      <div className="text-center">
                        <p className="font-bold text-lg group-hover:text-orange-600 transition-colors duration-300 mb-1">Request Another Podcast</p>
                        <p className="text-sm text-charcoal-500 font-normal">SUBMIT YOUR REQUEST</p>
                      </div>
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Footer */}
          <Footer />
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

        {/* Create Custom Panel Modal */}
        {showCustomPanelModal && (
          <CreateCustomPanelModal onClose={() => setShowCustomPanelModal(false)} />
        )}
      </>
    )
  }

  if (showNameInput) {
    return (
      <div className="relative min-h-screen w-full bg-gradient-to-br from-cream-50 via-white to-orange-50/20 flex items-center justify-center p-6 md:p-8">
        {/* Animated background gradient orbs */}
        <div className="absolute top-20 left-10 w-72 h-72 bg-orange-400/20 rounded-full blur-3xl animate-pulse"></div>
        <div className="absolute bottom-20 right-10 w-96 h-96 bg-orange-300/10 rounded-full blur-3xl animate-pulse" style={{animationDelay: '1s'}}></div>
        
        <div className="relative w-full max-w-2xl">
          <div className="editorial-card p-10 md:p-14 shadow-2xl border border-charcoal-100 animate-scale-in">
              <NameInput onSubmit={handleNameSubmit} />
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
  const [interests, setInterests] = useState<string[]>([])
  const [showInterests, setShowInterests] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowInterests(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!name.trim() || !role.trim() || interests.length === 0) {
      return
    }
    
    onSubmit({
      name: name.trim(),
      role: role.trim(),
      interests: interests.join(', '),
    })
  }

  // Interest options for dropdown
  const interestOptions = [
    'Product Management',
    'Product Strategy',
    'Growth & Marketing',
    'Leadership & Management',
    'Entrepreneurship',
    'Career Development',
    'User Research',
    'Design & UX',
    'Engineering',
    'Sales & Business Development',
    'Fundraising & VC',
    'Other',
  ]
  
  const toggleInterest = (interest: string) => {
    setInterests(prev => 
      prev.includes(interest)
        ? prev.filter(i => i !== interest)
        : [...prev, interest]
    )
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-8">
      <div className="text-center space-y-3 mb-10">
        <div className="inline-flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-orange-50 to-orange-100/50 rounded-full border border-orange-200/50 mb-4">
          <span className="text-2xl">👋</span>
          <span className="text-sm font-bold text-orange-700 uppercase tracking-wider">Let's get started</span>
        </div>
        <h2 className="text-3xl md:text-4xl font-display font-bold text-charcoal-800">
          Tell us about yourself
        </h2>
        <p className="text-charcoal-600">Help us personalize your experience</p>
      </div>

      {/* Name Field */}
      <div className="space-y-2">
        <label htmlFor="name" className="block text-sm font-bold text-charcoal-800 mb-2">
          Name <span className="text-orange-600">*</span>
        </label>
        <input
          ref={inputRef}
          type="text"
          id="name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Your name"
          className="editorial-input w-full text-base focus:ring-2 focus:ring-orange-500"
          required
        />
      </div>

      {/* Role Field */}
      <div className="space-y-2">
        <label htmlFor="role" className="block text-sm font-bold text-charcoal-800 mb-2">
          Role <span className="text-orange-600">*</span>
        </label>
        <input
          type="text"
          id="role"
          value={role}
          onChange={(e) => setRole(e.target.value)}
          placeholder="e.g., Product Manager, Founder, Designer"
          className="editorial-input w-full text-base focus:ring-2 focus:ring-orange-500"
          required
        />
      </div>

      {/* Interests Field - Multiselect */}
      <div className="space-y-2" ref={dropdownRef}>
        <label htmlFor="interests" className="block text-sm font-bold text-charcoal-800 mb-2">
          What are you interested in? <span className="text-orange-600">*</span>
        </label>
        <div className="relative">
          <button
            type="button"
            onClick={() => setShowInterests(!showInterests)}
            className="editorial-input w-full text-base focus:ring-2 focus:ring-orange-500 text-left flex items-center justify-between cursor-pointer"
          >
            <span className={interests.length === 0 ? 'text-charcoal-400' : 'text-charcoal-800'}>
              {interests.length === 0 
                ? 'Select your interests...' 
                : `${interests.length} selected`}
            </span>
            <svg 
              className={`w-5 h-5 text-charcoal-400 transition-transform duration-200 ${showInterests ? 'rotate-180' : ''}`}
              fill="none" 
              stroke="currentColor" 
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>
          
          {showInterests && (
            <div className="absolute z-10 w-full mt-2 bg-white border-2 border-orange-200 rounded-xl shadow-xl max-h-80 overflow-y-auto">
              <div className="p-2">
                {interestOptions.map((option) => (
                  <label
                    key={option}
                    className="flex items-center gap-3 px-4 py-3 hover:bg-orange-50 rounded-lg cursor-pointer transition-colors duration-200 group"
                  >
                    <div className="relative flex items-center justify-center">
                      <input
                        type="checkbox"
                        checked={interests.includes(option)}
                        onChange={() => toggleInterest(option)}
                        className="w-5 h-5 rounded border-2 border-charcoal-300 text-orange-600 focus:ring-2 focus:ring-orange-500 focus:ring-offset-0 cursor-pointer"
                      />
                    </div>
                    <span className="text-sm font-medium text-charcoal-700 group-hover:text-orange-600 transition-colors duration-200">
                      {option}
                    </span>
                  </label>
                ))}
              </div>
            </div>
          )}
        </div>
        
        {/* Show selected items as chips */}
        {interests.length > 0 && (
          <div className="flex flex-wrap gap-2 mt-3">
            {interests.map((interest) => (
              <span
                key={interest}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-orange-100 text-orange-700 text-sm font-medium rounded-lg"
              >
                {interest}
                <button
                  type="button"
                  onClick={() => toggleInterest(interest)}
                  className="hover:text-orange-900 transition-colors"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </span>
            ))}
          </div>
        )}
        
        <p className="text-xs text-charcoal-500 mt-1">
          Select one or more topics you'd like to explore
        </p>
      </div>

      {/* Microcopy */}
      <div className="flex items-center gap-2 p-4 bg-orange-50 rounded-xl border border-orange-200/50">
        <svg className="w-5 h-5 text-orange-600 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <p className="text-sm text-charcoal-600 font-medium">
        You may get a quick follow up if context helps.
      </p>
      </div>

      <button
        type="submit"
        disabled={!name.trim() || !role.trim() || interests.length === 0}
        className="group relative w-full px-8 py-4 text-base font-bold text-white bg-gradient-to-r from-orange-600 to-orange-500 rounded-xl shadow-lg shadow-orange-500/30 hover:shadow-xl hover:shadow-orange-500/50 hover:-translate-y-1 transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none disabled:shadow-none overflow-hidden"
      >
        <span className="relative z-10 flex items-center justify-center gap-2">
          Start chatting
          <svg className="w-5 h-5 group-hover:translate-x-1 transition-transform duration-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
          </svg>
        </span>
        <div className="absolute inset-0 bg-gradient-to-r from-orange-500 to-orange-400 opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
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
    <div className="group h-full editorial-card p-6 hover:shadow-xl hover:-translate-y-1 transition-all duration-300 bg-white border border-charcoal-100 hover:border-orange-200 flex flex-col">
      {/* Header with icon and votes */}
      <div className="flex items-start justify-between mb-4">
        <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-orange-100 to-orange-200 flex items-center justify-center flex-shrink-0">
          <span className="text-2xl">🎙️</span>
        </div>
        <div className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-charcoal-50">
          <svg 
            className={`w-5 h-5 transition-all duration-300 ${
              hasVoted ? 'text-orange-500 fill-orange-500' : 'text-charcoal-400 fill-none'
            }`}
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            viewBox="0 0 24 24"
          >
            <path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3zM7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3" />
          </svg>
          <span className="text-sm font-bold text-charcoal-700">{votes}</span>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 mb-4">
        <h3 className="font-bold text-lg text-charcoal-800 mb-2 group-hover:text-orange-600 transition-colors duration-300 line-clamp-2">
          {name}
        </h3>
        <p className="text-sm text-charcoal-600 leading-relaxed line-clamp-2">
          {description}
        </p>
        </div>

      {/* Vote Button */}
        <button
          onClick={onVote}
          disabled={hasVoted}
        className={`w-full px-4 py-2.5 text-sm font-semibold rounded-lg transition-all duration-300 ${
            hasVoted
            ? 'bg-charcoal-100 text-charcoal-500 cursor-not-allowed'
            : 'text-charcoal-700 border border-charcoal-300 hover:bg-charcoal-50 hover:border-charcoal-400'
          }`}
        >
        {hasVoted ? 'Voted' : 'Vote'}
        </button>
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
    <div className="fixed inset-0 bg-gradient-to-br from-black/60 to-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-fade-in" onClick={onClose}>
      <div className="editorial-card p-8 md:p-10 max-w-2xl w-full max-h-[90vh] overflow-y-auto shadow-2xl border border-charcoal-200/50 animate-scale-in" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-orange-400 to-orange-600 flex items-center justify-center shadow-md">
              <span className="text-xl">🎙️</span>
            </div>
            <h2 className="text-3xl font-bold text-charcoal-800">Request a Podcast</h2>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-lg text-charcoal-400 hover:text-charcoal-600 hover:bg-charcoal-100 transition-all duration-200"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        
        <div className="border-t border-charcoal-200 pt-6 mb-8">
          <p className="text-charcoal-600 text-base leading-relaxed">
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
            <div className={`p-4 rounded-xl border-2 ${
              message.type === 'success' 
                ? 'bg-gradient-to-br from-green-50 to-green-100/50 text-green-800 border-green-300 shadow-sm' 
                : 'bg-gradient-to-br from-red-50 to-red-100/50 text-red-800 border-red-300 shadow-sm'
            }`}>
              <p className="text-sm font-medium flex items-center gap-2">
                {message.type === 'success' ? (
                  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                  </svg>
                ) : (
                  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                  </svg>
                )}
                {message.text}
              </p>
            </div>
          )}

          <div className="flex gap-4">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-6 py-3 border-2 border-charcoal-300 text-charcoal-700 rounded-xl font-semibold hover:bg-charcoal-50 hover:border-charcoal-400 transition-all duration-200"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="flex-1 px-6 py-3 text-white font-semibold rounded-xl bg-gradient-to-r from-orange-600 to-orange-500 hover:shadow-lg hover:shadow-orange-500/30 hover:-translate-y-0.5 transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none disabled:shadow-none"
            >
              {isSubmitting ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="animate-spin h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Submitting...
                </span>
              ) : (
                'Submit Request'
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// Create Custom Panel Modal Component
function CreateCustomPanelModal({ onClose }: { onClose: () => void }) {
  const [panelName, setPanelName] = useState('')
  const [panelDescription, setPanelDescription] = useState('')
  const [selectedGuests, setSelectedGuests] = useState<string[]>([])
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null)

  // Sample guest list - you'll want to fetch this from your API
  const availableGuests = [
    'Brian Chesky', 'Reid Hoffman', 'Julie Zhuo', 'Lenny Rachitsky',
    'Andrew Chen', 'Casey Winters', 'Elena Verna', 'Kevin Kwok',
    'Shreyas Doshi', 'Des Traynor', 'April Dunford', 'Anu Hariharan'
  ]

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!panelName.trim() || !panelDescription.trim() || selectedGuests.length === 0) {
      setMessage({ type: 'error', text: 'Please fill in all required fields and select at least one panelist' })
      return
    }

    setIsSubmitting(true)
    setMessage(null)

    try {
      const response = await fetch('/api/custom-panel', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          panel_name: panelName.trim(),
          description: panelDescription.trim(),
          guests: selectedGuests,
          is_private: true, // Private by default
        }),
      })

      const data = await response.json()

      if (response.ok) {
        setMessage({ type: 'success', text: 'Custom panel created! Redirecting...' })
        setTimeout(() => {
          onClose()
          // Navigate to the custom panel
          window.location.href = `/chat/${data.panel_id}`
        }, 1500)
      } else {
        setMessage({ type: 'error', text: data.detail || 'Error creating panel' })
      }
    } catch (error) {
      console.error('Error creating custom panel:', error)
      setMessage({ type: 'error', text: 'Network error. Try again.' })
    } finally {
      setIsSubmitting(false)
    }
  }

  const toggleGuest = (guest: string) => {
    setSelectedGuests(prev =>
      prev.includes(guest)
        ? prev.filter(g => g !== guest)
        : [...prev, guest]
    )
  }

  return (
    <div className="fixed inset-0 bg-gradient-to-br from-black/60 to-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-fade-in" onClick={onClose}>
      <div className="editorial-card p-8 md:p-10 max-w-2xl w-full max-h-[90vh] overflow-y-auto shadow-2xl border border-charcoal-200/50 animate-scale-in" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-orange-400 to-orange-600 flex items-center justify-center shadow-md">
              <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
              </svg>
            </div>
            <h2 className="text-3xl font-bold text-charcoal-800">Create Custom Panel</h2>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-lg text-charcoal-400 hover:text-charcoal-600 hover:bg-charcoal-100 transition-all duration-200"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        
        <div className="border-t border-charcoal-200 pt-6 mb-8">
          <p className="text-charcoal-600 text-base leading-relaxed">
            Create your own panel by selecting experts you'd like to hear from. Your panel will be private unless you request to publish it.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Panel Name */}
          <div>
            <label className="block text-sm font-bold text-charcoal-800 mb-2">
              Panel Name <span className="text-orange-600">*</span>
            </label>
            <input
              type="text"
              value={panelName}
              onChange={(e) => setPanelName(e.target.value)}
              placeholder="e.g., Product Strategy Experts"
              className="editorial-input w-full"
              required
            />
          </div>

          {/* Panel Description */}
          <div>
            <label className="block text-sm font-bold text-charcoal-800 mb-2">
              Description <span className="text-orange-600">*</span>
            </label>
            <textarea
              value={panelDescription}
              onChange={(e) => setPanelDescription(e.target.value)}
              placeholder="What topics will this panel cover?"
              rows={3}
              className="editorial-textarea w-full"
              required
            />
          </div>

          {/* Select Panelists */}
          <div>
            <label className="block text-sm font-bold text-charcoal-800 mb-3">
              Select Panelists <span className="text-orange-600">*</span>
            </label>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3 max-h-64 overflow-y-auto p-2 border-2 border-charcoal-200 rounded-xl">
              {availableGuests.map((guest) => (
                <label
                  key={guest}
                  className={`flex items-center gap-2 px-3 py-2.5 rounded-lg cursor-pointer transition-all duration-200 ${
                    selectedGuests.includes(guest)
                      ? 'bg-orange-100 border-2 border-orange-400'
                      : 'bg-charcoal-50 border-2 border-transparent hover:border-charcoal-300'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={selectedGuests.includes(guest)}
                    onChange={() => toggleGuest(guest)}
                    className="w-4 h-4 rounded border-2 border-charcoal-300 text-orange-600 focus:ring-2 focus:ring-orange-500 cursor-pointer"
                  />
                  <span className={`text-sm font-medium ${
                    selectedGuests.includes(guest) ? 'text-orange-700' : 'text-charcoal-700'
                  }`}>
                    {guest}
                  </span>
                </label>
              ))}
            </div>
            <p className="text-xs text-charcoal-500 mt-2">
              {selectedGuests.length} panelist{selectedGuests.length !== 1 ? 's' : ''} selected
            </p>
          </div>

          {message && (
            <div className={`p-4 rounded-xl border-2 ${
              message.type === 'success' 
                ? 'bg-gradient-to-br from-green-50 to-green-100/50 text-green-800 border-green-300 shadow-sm' 
                : 'bg-gradient-to-br from-red-50 to-red-100/50 text-red-800 border-red-300 shadow-sm'
            }`}>
              <p className="text-sm font-medium flex items-center gap-2">
                {message.type === 'success' ? (
                  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                  </svg>
                ) : (
                  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                  </svg>
                )}
                {message.text}
              </p>
            </div>
          )}

          <div className="flex gap-4">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-6 py-3 border-2 border-charcoal-300 text-charcoal-700 rounded-xl font-semibold hover:bg-charcoal-50 hover:border-charcoal-400 transition-all duration-200"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting || selectedGuests.length === 0}
              className="flex-1 px-6 py-3 text-white font-semibold rounded-xl bg-gradient-to-r from-orange-600 to-orange-500 hover:shadow-lg hover:shadow-orange-500/30 hover:-translate-y-0.5 transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none disabled:shadow-none"
            >
              {isSubmitting ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="animate-spin h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Creating...
                </span>
              ) : (
                'Create Panel'
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// Add AuthModal to the JSX return
// Update the return statement to include AuthModal

