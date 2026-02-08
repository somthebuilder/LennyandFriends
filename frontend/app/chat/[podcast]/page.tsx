'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import Footer from '@/components/Footer'
import type { User } from '@supabase/supabase-js'
import GroupChat from '@/components/GroupChat'
import SplitChat from '@/components/SplitChat'

interface UserContext {
  name: string
  role?: string
  company?: string
  interests?: string
  goals?: string
}

export default function PodcastChatPage() {
  const params = useParams()
  const router = useRouter()
  const searchParams = useSearchParams()
  const podcast = params.podcast as string
  const [user, setUser] = useState<User | null>(null)
  
  // Map podcast slug to display name
  const podcastNameMap: Record<string, string> = {
    'lennyandfriends': "Lenny's Podcast",
    '20vc': '20VC',
    'myfirstmillion': 'My First Million',
    'allin': 'All-In Podcast',
    'indiaopportunity': 'The India Opportunity',
  }
  
  const podcastName = podcastNameMap[podcast] || podcast.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase())
  
  const [userContext, setUserContext] = useState<UserContext | null>(null)
  const [activeSplitChat, setActiveSplitChat] = useState<{
    guestId: string
    guestName: string
    originalQuery: string
    previousResponse: string
  } | null>(null)

  // Check auth status
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

  // Load user context from URL query params on mount
  useEffect(() => {
    const name = searchParams.get('name')
    const role = searchParams.get('role')
    const company = searchParams.get('company')
    const interests = searchParams.get('interests')
    const goals = searchParams.get('goals')

    if (name) {
      setUserContext({ 
        name, 
        role: role || '', 
        company: company || '', 
        interests: interests || '', 
        goals: goals || '' 
      })
    } else if (user) {
      // If user is logged in but no context, use user email as name
      setUserContext({
        name: user.email?.split('@')[0] || 'User',
        role: '',
        company: '',
        interests: '',
        goals: ''
      })
    } else {
      // If no user context and not logged in, redirect to home
      router.push('/')
    }
  }, [searchParams, router, user])

  const handleGuestClick = (
    guestId: string,
    guestName: string,
    originalQuery: string,
    previousResponse: string
  ) => {
    setActiveSplitChat({ guestId, guestName, originalQuery, previousResponse })
  }

  const handleBackToGroup = () => {
    setActiveSplitChat(null)
  }

  const handleBack = () => {
    router.push('/')
  }

  const handleSignOut = async () => {
    await supabase.auth.signOut()
    router.push('/')
  }

  // Show loading while userContext is being loaded
  if (!userContext) {
    return (
      <div className="min-h-screen w-full bg-cream-100 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-orange-600 mx-auto mb-4"></div>
          <p className="text-charcoal-600">Loading...</p>
        </div>
      </div>
    )
  }

  // Render header - Same as Landing Page with breadcrumbs
  const renderHeader = () => (
    <header className="sticky top-0 z-50 bg-white/80 backdrop-blur-lg border-b border-charcoal-200/50 shadow-sm transition-all duration-300">
      <div className="w-full">
        <div className="max-w-7xl mx-auto px-6 md:px-12 py-4">
          <div className="flex justify-between items-center">
            {/* Logo/Brand with Breadcrumbs */}
            <div className="flex items-center gap-2 text-sm">
              <button
                onClick={handleBack}
                className="flex items-center gap-3 group"
              >
                <img 
                  src="/panelchat-logo.svg" 
                  alt="Panel Chat"
                  className="h-8 md:h-10 w-auto transition-transform group-hover:scale-[1.02] duration-500"
                />
              </button>
              <svg className="w-4 h-4 text-charcoal-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
              <span className="font-semibold text-charcoal-800">{podcastName}</span>
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
                  onClick={() => router.push('/')}
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
  )

  if (activeSplitChat) {
    return (
      <div className="min-h-screen w-full bg-gradient-to-br from-cream-50 via-white to-orange-50/20 flex flex-col">
        {renderHeader()}
      <SplitChat
        guestId={activeSplitChat.guestId}
        guestName={activeSplitChat.guestName}
        originalQuery={activeSplitChat.originalQuery}
        previousResponse={activeSplitChat.previousResponse}
        userContext={userContext}
        onBack={handleBackToGroup}
      />
        <Footer />
      </div>
    )
  }

  return (
    <div className="min-h-screen w-full bg-gradient-to-br from-cream-50 via-white to-orange-50/20 flex flex-col">
      {renderHeader()}
    <GroupChat
      userContext={userContext}
      onGuestClick={handleGuestClick}
      onBack={handleBack}
      podcastName={podcastName}
    />
      <Footer />
    </div>
  )
}

