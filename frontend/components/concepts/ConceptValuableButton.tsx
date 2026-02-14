'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'

function getVoterId(): string {
  if (typeof window === 'undefined') return ''
  let id = localStorage.getItem('espresso_voter_id')
  if (!id) {
    id = crypto.randomUUID()
    localStorage.setItem('espresso_voter_id', id)
  }
  return id
}

interface ConceptValuableButtonProps {
  conceptId: string
  initialCount: number
}

export default function ConceptValuableButton({ conceptId, initialCount }: ConceptValuableButtonProps) {
  const [isVoted, setIsVoted] = useState(false)
  const [count, setCount] = useState(initialCount)
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Check if voter already voted for this concept
  useEffect(() => {
    const voterId = getVoterId()
    if (!voterId) return
    supabase
      .from('concept_valuable_votes')
      .select('id')
      .eq('concept_id', conceptId)
      .eq('voter_id', voterId)
      .maybeSingle()
      .then(({ data }) => {
        if (data) setIsVoted(true)
      })
  }, [conceptId])

  async function handleClick() {
    if (isVoted || isSubmitting) return
    const voterId = getVoterId()
    if (!voterId) return

    setIsSubmitting(true)
    try {
      const { data, error } = await supabase.rpc('vote_concept_valuable', {
        p_concept_id: conceptId,
        p_voter_id: voterId,
      })
      if (!error && data === true) {
        setIsVoted(true)
        setCount((prev) => prev + 1)
      }
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <button
      onClick={handleClick}
      disabled={isVoted || isSubmitting}
      className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${
        isVoted
          ? 'text-yellow-600 bg-yellow-50 border border-yellow-200'
          : 'text-charcoal-400 bg-white border border-charcoal-200 hover:text-yellow-600 hover:bg-yellow-50 hover:border-yellow-200'
      } ${isSubmitting ? 'opacity-50' : ''}`}
      title={isVoted ? 'Marked as valuable' : 'Mark as valuable'}
    >
      <svg
        className="w-4 h-4"
        viewBox="0 0 24 24"
        fill={isVoted ? 'url(#bulb-gradient)' : 'none'}
        stroke={isVoted ? 'none' : 'currentColor'}
        strokeWidth={isVoted ? '0' : '1.5'}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {isVoted && (
          <defs>
            <linearGradient id="bulb-gradient" x1="0" y1="0" x2="0.5" y2="1">
              <stop offset="0%" stopColor="#facc15" />
              <stop offset="50%" stopColor="#f59e0b" />
              <stop offset="100%" stopColor="#ea580c" />
            </linearGradient>
          </defs>
        )}
        <path d="M12 2a7 7 0 0 0-7 7c0 2.38 1.19 4.47 3 5.74V17a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1v-2.26c1.81-1.27 3-3.36 3-5.74a7 7 0 0 0-7-7z" />
        <path d="M9 21a1 1 0 0 0 1 1h4a1 1 0 0 0 1-1v-1H9v1z" />
      </svg>
      {count > 0 && <span className="text-xs">{count}</span>}
    </button>
  )
}
