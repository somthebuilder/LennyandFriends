'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
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
    } else {
      // If no user context, redirect to home
      router.push('/')
    }
  }, [searchParams, router])

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
      onBack={handleBack}
      podcastName={podcastName}
    />
  )
}

