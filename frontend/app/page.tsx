'use client'

import { useState, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'

interface UserContext {
  name: string
  role?: string
  company?: string
  interests?: string
  goals?: string
}

export default function Home() {
  const router = useRouter()
  const [userContext, setUserContext] = useState<UserContext | null>(null)
  const [showNameInput, setShowNameInput] = useState(false)
  const [showRequestModal, setShowRequestModal] = useState(false)
  const [podcastLikes, setPodcastLikes] = useState<Record<string, number>>({
    '20VC': 7,
    'My First Million': 5,
    'All-In Podcast': 8,
    'The India Opportunity': 3,
    'Huberman Lab': 1,
  })
  const [likedPodcasts, setLikedPodcasts] = useState<Record<string, boolean>>({})
  const formRef = useRef<HTMLDivElement>(null)

  const handleLike = async (podcastName: string) => {
    // Optimistic update
    const isCurrentlyLiked = likedPodcasts[podcastName]
    const newLikeCount = isCurrentlyLiked 
      ? podcastLikes[podcastName] - 1 
      : podcastLikes[podcastName] + 1

    setPodcastLikes(prev => ({ ...prev, [podcastName]: newLikeCount }))
    setLikedPodcasts(prev => ({ ...prev, [podcastName]: !isCurrentlyLiked }))

    try {
      const response = await fetch('/api/podcast-like', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          podcast_name: podcastName,
          action: isCurrentlyLiked ? 'unlike' : 'like'
        })
      })

      if (!response.ok) {
        // Revert on error
        setPodcastLikes(prev => ({ ...prev, [podcastName]: podcastLikes[podcastName] }))
        setLikedPodcasts(prev => ({ ...prev, [podcastName]: isCurrentlyLiked }))
        console.error('Failed to update like')
      }
    } catch (error) {
      // Revert on error
      setPodcastLikes(prev => ({ ...prev, [podcastName]: podcastLikes[podcastName] }))
      setLikedPodcasts(prev => ({ ...prev, [podcastName]: isCurrentlyLiked }))
      console.error('Error updating like:', error)
    }
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
        <div className="min-h-screen w-full bg-cream-100">
          {/* Two Column Layout */}
          <div className="max-w-7xl mx-auto px-6 md:px-12 py-12 md:py-20">
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
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                    <PodcastCard
                      name="20VC"
                      description="Venture & Fundraising"
                      likes={podcastLikes['20VC']}
                      isLiked={likedPodcasts['20VC']}
                      onLike={() => handleLike('20VC')}
                    />
                    <PodcastCard
                      name="My First Million"
                      description="Business Ideas & Revenue"
                      likes={podcastLikes['My First Million']}
                      isLiked={likedPodcasts['My First Million']}
                      onLike={() => handleLike('My First Million')}
                    />
                    <PodcastCard
                      name="All-In Podcast"
                      description="Tech, Markets & Strategy"
                      likes={podcastLikes['All-In Podcast']}
                      isLiked={likedPodcasts['All-In Podcast']}
                      onLike={() => handleLike('All-In Podcast')}
                    />
                    <PodcastCard
                      name="The India Opportunity"
                      description="Indian Tech & Startups"
                      likes={podcastLikes['The India Opportunity']}
                      isLiked={likedPodcasts['The India Opportunity']}
                      onLike={() => handleLike('The India Opportunity')}
                    />
                    <PodcastCard
                      name="Huberman Lab"
                      description="Science & Health"
                      likes={podcastLikes['Huberman Lab']}
                      isLiked={likedPodcasts['Huberman Lab']}
                      onLike={() => handleLike('Huberman Lab')}
                    />
                  </div>

                  {/* Request Another Podcast Button */}
                  <button
                    onClick={() => setShowRequestModal(true)}
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
        </div>

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
  likes,
  isLiked,
  onLike,
}: {
  name: string
  description: string
  likes: number
  isLiked?: boolean
  onLike: () => void
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
          <span>{isLiked ? '❤️' : '👍'}</span>
          <span>{likes}</span>
        </div>
        <button
          onClick={onLike}
          className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
            isLiked
              ? 'bg-orange-50 text-orange-600 border border-orange-300'
              : 'text-charcoal-600 border border-charcoal-300 hover:bg-charcoal-50'
          }`}
        >
          {isLiked ? '❤️ Liked' : 'Like'}
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
