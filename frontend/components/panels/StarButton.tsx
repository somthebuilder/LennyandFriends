'use client'

import { useState } from 'react'
import { supabase } from '@/lib/supabase'
import type { User } from '@supabase/supabase-js'
import SignInPrompt from './SignInPrompt'

interface StarButtonProps {
  panelId: string
  panelSlug: string
  valuableCount: number
  isMarked: boolean
  user: User | null
  onToggle: (newValue: boolean) => void
}

export default function StarButton({
  panelId,
  panelSlug,
  valuableCount,
  isMarked,
  user,
  onToggle,
}: StarButtonProps) {
  const [isUpdating, setIsUpdating] = useState(false)
  const [showSignInPrompt, setShowSignInPrompt] = useState(false)
  const [localCount, setLocalCount] = useState(valuableCount)
  const [localIsMarked, setLocalIsMarked] = useState(isMarked)

  const handleClick = async () => {
    if (!user) {
      setShowSignInPrompt(true)
      return
    }

    // Get auth token
    const { data: { session } } = await supabase.auth.getSession()
    if (!session?.access_token) {
      setShowSignInPrompt(true)
      return
    }

    // Optimistic UI update
    const newValue = !localIsMarked
    setLocalIsMarked(newValue)
    setLocalCount(prev => newValue ? prev + 1 : prev - 1)
    onToggle(newValue)
    setIsUpdating(true)

    try {
      const response = await fetch(`/api/panels/${panelSlug}/mark-valuable`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ marked: newValue }),
      })

      if (!response.ok) {
        throw new Error('Failed to update')
      }

      const data = await response.json()
      setLocalCount(data.valuableCount)
    } catch (error) {
      // Revert on error
      setLocalIsMarked(!newValue)
      setLocalCount(prev => newValue ? prev - 1 : prev + 1)
      onToggle(!newValue)
      console.error('Error marking panel as valuable:', error)
      // TODO: Show error toast
    } finally {
      setIsUpdating(false)
    }
  }

  const displayText = localIsMarked
    ? `You and ${(localCount - 1).toLocaleString()} others found this valuable`
    : `${localCount.toLocaleString()} people found this valuable`

  return (
    <>
      <button
        onClick={handleClick}
        disabled={isUpdating}
        className="flex items-center gap-3 cursor-pointer hover:opacity-80 transition-opacity duration-200 focus:outline-none group disabled:opacity-50"
        title={localIsMarked ? "Click to unmark as valuable" : "Click to mark as valuable"}
      >
        {localIsMarked ? (
          <svg 
            className="w-8 h-8 text-orange-500 group-hover:scale-110 transition-transform duration-200" 
            fill="currentColor" 
            viewBox="0 0 20 20"
          >
            <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
          </svg>
        ) : (
          <svg 
            className="w-8 h-8 text-orange-300 group-hover:scale-110 transition-transform duration-200" 
            fill="none" 
            stroke="currentColor" 
            strokeWidth="1.5" 
            viewBox="0 0 20 20"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
          </svg>
        )}
        <span className="text-lg font-semibold text-charcoal-700">
          {displayText}
        </span>
      </button>

      <SignInPrompt
        isOpen={showSignInPrompt}
        onClose={() => setShowSignInPrompt(false)}
        message="Sign in to mark as valuable"
      />
    </>
  )
}

