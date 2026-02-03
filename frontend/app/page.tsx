'use client'

import { useState, useRef, useEffect } from 'react'
import GroupChat from '@/components/GroupChat'
import SplitChat from '@/components/SplitChat'

interface UserContext {
  name: string
  role?: string
  company?: string
  interests?: string
  goals?: string
}

export default function Home() {
  const [userContext, setUserContext] = useState<UserContext | null>(null)
  const [showNameInput, setShowNameInput] = useState(true)
  const [showMobileIntro, setShowMobileIntro] = useState(true)
  const formRef = useRef<HTMLDivElement>(null)
  const [activeSplitChat, setActiveSplitChat] = useState<{
    guestId: string
    guestName: string
    originalQuery: string
    previousResponse: string
  } | null>(null)

  // Mobile: Show intro for 5 seconds, then scroll to form
  useEffect(() => {
    if (showNameInput && showMobileIntro) {
      const timer = setTimeout(() => {
        setShowMobileIntro(false)
        // Scroll to form after intro
        setTimeout(() => {
          formRef.current?.scrollIntoView({ behavior: 'smooth' })
        }, 300)
      }, 5000)
      return () => clearTimeout(timer)
    }
  }, [showNameInput, showMobileIntro])

  const handleNameSubmit = (context: UserContext) => {
    setUserContext(context)
    setShowNameInput(false)
  }

  const handleGuestClick = (
    guestId: string,
    guestName: string,
    originalQuery: string,
    previousResponse: string
  ) => {
    setActiveSplitChat({
      guestId,
      guestName,
      originalQuery,
      previousResponse,
    })
  }

  const handleBackToGroup = () => {
    setActiveSplitChat(null)
  }

  if (showNameInput) {
    return (
      <div className="min-h-screen w-full flex items-center justify-center relative overflow-hidden">
        {/* Night Sky Background - Space-like with Subtle Orange Tint */}
        <div className="absolute inset-0 w-full h-full">
          {/* Base night sky gradient - black to grey transitions */}
          <div className="absolute inset-0 bg-gradient-to-b from-black via-gray-950 to-gray-900" />
          
          {/* Additional depth gradients - multiple grey layers */}
          <div className="absolute inset-0 bg-gradient-to-br from-gray-950/90 via-gray-900/70 to-black/95" />
          <div className="absolute inset-0 bg-gradient-to-tl from-black via-gray-900/50 to-gray-800/40" />
          <div className="absolute inset-0 bg-gradient-to-tr from-gray-950/60 via-transparent to-gray-900/50" />
          
          {/* Space-like nebula effects with subtle orange tint */}
          <div 
            className="absolute inset-0"
            style={{
              background: `
                radial-gradient(circle at 20% 30%, rgba(249, 115, 22, 0.08) 0%, transparent 40%),
                radial-gradient(circle at 80% 70%, rgba(251, 146, 60, 0.06) 0%, transparent 45%),
                radial-gradient(circle at 50% 50%, rgba(55, 65, 81, 0.15) 0%, transparent 50%),
                radial-gradient(ellipse at 30% 80%, rgba(17, 24, 39, 0.3) 0%, transparent 60%),
                radial-gradient(ellipse at 70% 20%, rgba(31, 41, 55, 0.25) 0%, transparent 55%)
              `
            }}
          />
          
          {/* Subtle orange cosmic clouds */}
          <div 
            className="absolute inset-0"
            style={{
              background: `
                radial-gradient(ellipse 800px 400px at 15% 25%, rgba(249, 115, 22, 0.05) 0%, transparent 100%),
                radial-gradient(ellipse 600px 500px at 85% 75%, rgba(251, 146, 60, 0.04) 0%, transparent 100%),
                radial-gradient(ellipse 1000px 300px at 50% 10%, rgba(249, 115, 22, 0.03) 0%, transparent 100%)
              `
            }}
          />
          
          {/* Horizontal grey accent gradients */}
          <div className="absolute inset-0 bg-gradient-to-r from-transparent via-gray-900/20 to-transparent" />
          <div className="absolute inset-0 bg-gradient-to-l from-transparent via-gray-800/15 to-transparent" />
          
          {/* Stars effect - white stars */}
          <div className="absolute inset-0">
            {Array.from({ length: 100 }).map((_, i) => (
              <div
                key={i}
                className="absolute rounded-full bg-white"
                style={{
                  left: `${Math.random() * 100}%`,
                  top: `${Math.random() * 100}%`,
                  width: `${Math.random() * 2 + 1}px`,
                  height: `${Math.random() * 2 + 1}px`,
                  opacity: Math.random() * 0.8 + 0.2,
                  animation: `twinkle ${Math.random() * 3 + 2}s ease-in-out infinite`,
                  animationDelay: `${Math.random() * 2}s`,
                }}
              />
            ))}
          </div>

          {/* Constellations - twinkling stars like others */}
          <div className="absolute inset-0">
            {/* Constellation 1: Little Dipper (Ursa Minor) with North Star (Polaris) - top center */}
            {/* Polaris (North Star) - naturally brighter and more stable, positioned above dialogue box */}
            <div 
              className="absolute rounded-full bg-white"
              style={{
                left: '50%',
                top: '8%',
                width: '3px',
                height: '3px',
                opacity: 1,
                zIndex: 25,
                transform: 'translateX(-50%)',
                boxShadow: '0 0 6px rgba(255,255,255,1), 0 0 12px rgba(255,255,255,0.6)',
              }}
            />
            {/* Other Little Dipper stars */}
            <div 
              className="absolute rounded-full bg-white"
              style={{
                left: '48%',
                top: '18%',
                width: `${Math.random() * 1 + 1}px`,
                height: `${Math.random() * 1 + 1}px`,
                opacity: Math.random() * 0.6 + 0.4,
                animation: `twinkle ${Math.random() * 3 + 2}s ease-in-out infinite`,
                animationDelay: `${Math.random() * 2}s`,
              }}
            />
            <div 
              className="absolute rounded-full bg-white"
              style={{
                left: '46%',
                top: '22%',
                width: `${Math.random() * 1 + 1}px`,
                height: `${Math.random() * 1 + 1}px`,
                opacity: Math.random() * 0.6 + 0.4,
                animation: `twinkle ${Math.random() * 3 + 2}s ease-in-out infinite`,
                animationDelay: `${Math.random() * 2}s`,
              }}
            />
            <div 
              className="absolute rounded-full bg-white"
              style={{
                left: '52%',
                top: '20%',
                width: `${Math.random() * 1 + 1}px`,
                height: `${Math.random() * 1 + 1}px`,
                opacity: Math.random() * 0.6 + 0.4,
                animation: `twinkle ${Math.random() * 3 + 2}s ease-in-out infinite`,
                animationDelay: `${Math.random() * 2}s`,
              }}
            />
            <div 
              className="absolute rounded-full bg-white"
              style={{
                left: '54%',
                top: '24%',
                width: `${Math.random() * 1 + 1}px`,
                height: `${Math.random() * 1 + 1}px`,
                opacity: Math.random() * 0.6 + 0.4,
                animation: `twinkle ${Math.random() * 3 + 2}s ease-in-out infinite`,
                animationDelay: `${Math.random() * 2}s`,
              }}
            />
            <div 
              className="absolute rounded-full bg-white"
              style={{
                left: '50%',
                top: '28%',
                width: `${Math.random() * 1 + 1}px`,
                height: `${Math.random() * 1 + 1}px`,
                opacity: Math.random() * 0.6 + 0.4,
                animation: `twinkle ${Math.random() * 3 + 2}s ease-in-out infinite`,
                animationDelay: `${Math.random() * 2}s`,
              }}
            />
            <div 
              className="absolute rounded-full bg-white"
              style={{
                left: '48%',
                top: '32%',
                width: `${Math.random() * 1 + 1}px`,
                height: `${Math.random() * 1 + 1}px`,
                opacity: Math.random() * 0.6 + 0.4,
                animation: `twinkle ${Math.random() * 3 + 2}s ease-in-out infinite`,
                animationDelay: `${Math.random() * 2}s`,
              }}
            />

            {/* Constellation 2: Big Dipper (Ursa Major) - top left */}
            <div 
              className="absolute rounded-full bg-white"
              style={{
                left: '15%',
                top: '20%',
                width: `${Math.random() * 1 + 1}px`,
                height: `${Math.random() * 1 + 1}px`,
                opacity: Math.random() * 0.6 + 0.4,
                animation: `twinkle ${Math.random() * 3 + 2}s ease-in-out infinite`,
                animationDelay: `${Math.random() * 2}s`,
              }}
            />
            <div 
              className="absolute rounded-full bg-white"
              style={{
                left: '18%',
                top: '18%',
                width: `${Math.random() * 1 + 1}px`,
                height: `${Math.random() * 1 + 1}px`,
                opacity: Math.random() * 0.6 + 0.4,
                animation: `twinkle ${Math.random() * 3 + 2}s ease-in-out infinite`,
                animationDelay: `${Math.random() * 2}s`,
              }}
            />
            <div 
              className="absolute rounded-full bg-white"
              style={{
                left: '20%',
                top: '22%',
                width: `${Math.random() * 1 + 1}px`,
                height: `${Math.random() * 1 + 1}px`,
                opacity: Math.random() * 0.6 + 0.4,
                animation: `twinkle ${Math.random() * 3 + 2}s ease-in-out infinite`,
                animationDelay: `${Math.random() * 2}s`,
              }}
            />
            <div 
              className="absolute rounded-full bg-white"
              style={{
                left: '22%',
                top: '25%',
                width: `${Math.random() * 1 + 1}px`,
                height: `${Math.random() * 1 + 1}px`,
                opacity: Math.random() * 0.6 + 0.4,
                animation: `twinkle ${Math.random() * 3 + 2}s ease-in-out infinite`,
                animationDelay: `${Math.random() * 2}s`,
              }}
            />
            <div 
              className="absolute rounded-full bg-white"
              style={{
                left: '25%',
                top: '28%',
                width: `${Math.random() * 1 + 1}px`,
                height: `${Math.random() * 1 + 1}px`,
                opacity: Math.random() * 0.6 + 0.4,
                animation: `twinkle ${Math.random() * 3 + 2}s ease-in-out infinite`,
                animationDelay: `${Math.random() * 2}s`,
              }}
            />
            <div 
              className="absolute rounded-full bg-white"
              style={{
                left: '28%',
                top: '30%',
                width: `${Math.random() * 1 + 1}px`,
                height: `${Math.random() * 1 + 1}px`,
                opacity: Math.random() * 0.6 + 0.4,
                animation: `twinkle ${Math.random() * 3 + 2}s ease-in-out infinite`,
                animationDelay: `${Math.random() * 2}s`,
              }}
            />
            <div 
              className="absolute rounded-full bg-white"
              style={{
                left: '30%',
                top: '32%',
                width: `${Math.random() * 1 + 1}px`,
                height: `${Math.random() * 1 + 1}px`,
                opacity: Math.random() * 0.6 + 0.4,
                animation: `twinkle ${Math.random() * 3 + 2}s ease-in-out infinite`,
                animationDelay: `${Math.random() * 2}s`,
              }}
            />
          </div>
          
          {/* Subtle warm glow at bottom - hint of campfire */}
          <div className="absolute bottom-0 left-0 right-0 h-1/3 bg-gradient-to-t from-orange-900/15 via-amber-900/10 to-transparent" />
        </div>

        {/* Welcome Screen - Desktop: Side by side, Mobile: Sequential */}
        <div className="relative z-20 w-full max-w-7xl mx-auto p-4 md:p-8 min-h-screen flex items-center">
          <div className="w-full flex flex-col md:flex-row md:items-center md:gap-12 lg:gap-16">
            {/* Logo & Text Section - Centered on desktop, top on mobile */}
            <div className={`relative z-10 flex-shrink-0 transition-all duration-700 ${
              showMobileIntro 
                ? 'opacity-100 translate-y-0' 
                : 'opacity-0 -translate-y-4 md:opacity-100 md:translate-y-0'
            }`}>
              <div className="text-center md:text-center">
                <div className="mb-6 md:mb-8 flex justify-center">
                  <img 
                    src="/lennylogo.svg" 
                    alt="Lenny & Friends" 
                    className="h-24 md:h-32 lg:h-40 w-auto"
                  />
                </div>
                <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold mb-3 bg-gradient-to-r from-fire-600 via-fire-500 to-flame-600 bg-clip-text text-transparent leading-tight">
                  <div>Lenny</div>
                  <div className="text-xl md:text-2xl lg:text-3xl">&</div>
                  <div>Friends</div>
                </h1>
                <p className="text-log-500 text-base md:text-lg mt-2">
                  Gather around the campfire
                </p>
              </div>
            </div>

            {/* Form Section - Right side on desktop, below on mobile */}
            <div 
              ref={formRef}
              className={`relative z-10 flex-1 transition-all duration-700 ${
                showMobileIntro 
                  ? 'opacity-0 translate-y-4 md:opacity-100 md:translate-y-0' 
                  : 'opacity-100 translate-y-0'
              }`}
            >
              <div className="bg-white/95 backdrop-blur-md rounded-3xl shadow-2xl p-6 md:p-10 w-full warm-glow border border-fire-200/50 overflow-hidden">
                <div className="relative z-10">
                  <NameInput onSubmit={handleNameSubmit} />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    )
  }

  if (activeSplitChat) {
    return (
      <SplitChat
        guestId={activeSplitChat.guestId}
        guestName={activeSplitChat.guestName}
        originalQuery={activeSplitChat.originalQuery}
        previousResponse={activeSplitChat.previousResponse}
        userContext={userContext}
        onBack={handleBackToGroup}
      />
    )
  }

  return (
    <GroupChat
      userContext={userContext}
      onGuestClick={handleGuestClick}
    />
  )
}

function NameInput({ onSubmit }: { onSubmit: (context: UserContext) => void }) {
  const [name, setName] = useState('')
  const [role, setRole] = useState('')
  const [company, setCompany] = useState('')
  const [interests, setInterests] = useState('')
  const [goals, setGoals] = useState('')
  const [validationNudge, setValidationNudge] = useState<string | null>(null)
  const [isValidating, setIsValidating] = useState(false)
  const [nudgeCount, setNudgeCount] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  // Debounced validation - validate as user types (only if nudge count < 2)
  useEffect(() => {
    if (!name.trim() || !role.trim() || !interests.trim()) {
      setValidationNudge(null)
      return // Don't validate until required fields are filled
    }

    // Stop AI validation after 2 nudges - fall back to normal HTML validation
    if (nudgeCount >= 2) {
      setValidationNudge(null)
      return
    }

    const timer = setTimeout(async () => {
      setIsValidating(true)
      try {
        const response = await fetch('/api/validate-user-input', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: name.trim(),
            role: role.trim(),
            company: company.trim() || undefined,
            interests: interests.trim(),
            goals: goals.trim() || undefined,
          }),
        })

        const data = await response.json()
        if (!data.is_valid && data.nudge) {
          setValidationNudge(data.nudge)
          setNudgeCount(prev => prev + 1)
        } else {
          setValidationNudge(null)
        }
      } catch (error) {
        console.error('Validation error:', error)
        // Don't show error to user, just continue
        setValidationNudge(null)
      } finally {
        setIsValidating(false)
      }
    }, 1000) // Wait 1 second after user stops typing

    return () => clearTimeout(timer)
  }, [name, role, interests, company, goals, nudgeCount])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (name.trim() && role.trim() && interests.trim()) {
      // Only do AI validation if we haven't shown 2 nudges yet
      if (nudgeCount < 2) {
        setIsValidating(true)
        try {
          const response = await fetch('/api/validate-user-input', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              name: name.trim(),
              role: role.trim(),
              company: company.trim() || undefined,
              interests: interests.trim(),
              goals: goals.trim() || undefined,
            }),
          })

          const data = await response.json()
          if (!data.is_valid && data.nudge) {
            setValidationNudge(data.nudge)
            setNudgeCount(prev => prev + 1)
            setIsValidating(false)
            return // Don't submit if validation fails (only for first 2 attempts)
          } else {
            setValidationNudge(null)
          }
        } catch (error) {
          console.error('Validation error:', error)
          // On error, allow submission (don't block users)
        } finally {
          setIsValidating(false)
        }
      }
      
      // Submit if validation passed, errored, or we've already shown 2 nudges
      onSubmit({
        name: name.trim(),
        role: role.trim(),
        company: company.trim() || undefined,
        interests: interests.trim(),
        goals: goals.trim() || undefined,
      })
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-4">
        <div className="relative">
          <label className="block text-sm font-medium text-log-700 mb-1.5">Name *</label>
          <input
            ref={inputRef}
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Enter your name..."
            className="w-full px-5 py-3 text-base border-2 border-fire-200 rounded-xl focus:ring-4 focus:ring-fire-300 focus:border-fire-400 outline-none bg-white/80 backdrop-blur-sm text-log-800 placeholder-log-400 transition-all"
            required
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="relative">
            <label className="block text-sm font-medium text-log-700 mb-1.5">Role *</label>
            <input
              type="text"
              value={role}
              onChange={(e) => setRole(e.target.value)}
              placeholder="e.g., Product Manager, Founder..."
              className="w-full px-5 py-3 text-base border-2 border-fire-200 rounded-xl focus:ring-4 focus:ring-fire-300 focus:border-fire-400 outline-none bg-white/80 backdrop-blur-sm text-log-800 placeholder-log-400 transition-all"
              required
            />
          </div>

          <div className="relative">
            <label className="block text-sm font-medium text-log-700 mb-1.5">Company</label>
            <input
              type="text"
              value={company}
              onChange={(e) => setCompany(e.target.value)}
              placeholder="e.g., Acme Inc..."
              className="w-full px-5 py-3 text-base border-2 border-fire-200 rounded-xl focus:ring-4 focus:ring-fire-300 focus:border-fire-400 outline-none bg-white/80 backdrop-blur-sm text-log-800 placeholder-log-400 transition-all"
            />
          </div>
        </div>

        <div className="relative">
          <label className="block text-sm font-medium text-log-700 mb-1.5">Interests/Topics *</label>
          <input
            type="text"
            value={interests}
            onChange={(e) => setInterests(e.target.value)}
            placeholder="e.g., Product strategy, Growth, Leadership..."
            className="w-full px-5 py-3 text-base border-2 border-fire-200 rounded-xl focus:ring-4 focus:ring-fire-300 focus:border-fire-400 outline-none bg-white/80 backdrop-blur-sm text-log-800 placeholder-log-400 transition-all"
            required
          />
        </div>

        <div className="relative">
          <label className="block text-sm font-medium text-log-700 mb-1.5">What are you hoping to learn?</label>
          <textarea
            value={goals}
            onChange={(e) => setGoals(e.target.value)}
            placeholder="e.g., Improve my product strategy, Learn about scaling teams..."
            rows={3}
            className="w-full px-5 py-3 text-base border-2 border-fire-200 rounded-xl focus:ring-4 focus:ring-fire-300 focus:border-fire-400 outline-none bg-white/80 backdrop-blur-sm text-log-800 placeholder-log-400 transition-all resize-none"
          />
        </div>
      </div>

      {/* Validation Nudge */}
      {validationNudge && (
        <div className="p-4 bg-gradient-to-r from-fire-50 to-flame-50 border border-fire-200 rounded-xl shadow-sm animate-in fade-in slide-in-from-top-2 duration-300">
          <p className="text-sm text-log-700 flex items-start gap-3 leading-relaxed">
            <span className="text-lg flex-shrink-0">✨</span>
            <span className="flex-1">{validationNudge}</span>
          </p>
        </div>
      )}

      {/* Privacy Note - Moved to bottom, smaller */}
      <div className="pt-2">
        <p className="text-xs text-log-500 text-center">
          ℹ️ This information helps provide more relevant responses.
        </p>
      </div>

      <button
        type="submit"
        disabled={isValidating}
        className="w-full fire-gradient text-white py-4 text-lg rounded-xl font-bold hover:opacity-90 transition-all shadow-xl hover:shadow-2xl transform hover:scale-[1.02] active:scale-[0.98] relative overflow-hidden group mt-6 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        <span className="relative z-10 flex items-center justify-center gap-2">
          <span>Start Chatting</span>
          <svg 
            className="w-5 h-5 transform group-hover:translate-x-1 transition-transform" 
            fill="none" 
            stroke="currentColor" 
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
          </svg>
        </span>
        <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent transform -skew-x-12 -translate-x-full group-hover:translate-x-full transition-transform duration-1000" />
      </button>
    </form>
  )
}

