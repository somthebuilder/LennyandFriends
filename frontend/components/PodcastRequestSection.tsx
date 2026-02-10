'use client'

import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'

interface PodcastRequest {
  id: string
  podcast_name: string
  podcast_host: string | null
  podcast_url: string | null
  description: string | null
  vote_count: number
  created_at: string
}

function getVoterId(): string {
  if (typeof window === 'undefined') return ''
  let id = localStorage.getItem('espresso_voter_id')
  if (!id) {
    id = crypto.randomUUID()
    localStorage.setItem('espresso_voter_id', id)
  }
  return id
}

function getStoredIdentity(): { name: string; email: string } | null {
  if (typeof window === 'undefined') return null
  const raw = localStorage.getItem('espresso_user_identity')
  if (!raw) return null
  try {
    return JSON.parse(raw)
  } catch {
    return null
  }
}

function storeIdentity(name: string, email: string) {
  localStorage.setItem('espresso_user_identity', JSON.stringify({ name, email }))
}

export default function PodcastRequestSection() {
  const [isOpen, setIsOpen] = useState(false)
  const [requests, setRequests] = useState<PodcastRequest[]>([])
  const [votedIds, setVotedIds] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(false)
  const [votingId, setVotingId] = useState<string | null>(null)

  // Identity (lightweight sign-in)
  const [identity, setIdentity] = useState<{ name: string; email: string } | null>(null)
  const [showSignIn, setShowSignIn] = useState(false)
  const [signInName, setSignInName] = useState('')
  const [signInEmail, setSignInEmail] = useState('')

  // New request form
  const [showForm, setShowForm] = useState(false)
  const [newName, setNewName] = useState('')
  const [newHost, setNewHost] = useState('')
  const [newUrl, setNewUrl] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [submitSuccess, setSubmitSuccess] = useState(false)

  // Load identity from localStorage on mount
  useEffect(() => {
    setIdentity(getStoredIdentity())
  }, [])

  const fetchRequests = useCallback(async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('podcast_requests')
      .select('id, podcast_name, podcast_host, podcast_url, description, vote_count, created_at')
      .order('vote_count', { ascending: false })

    if (!error && data) {
      setRequests(data)
    }

    // Load which ones this voter already voted for
    const voterId = getVoterId()
    if (voterId) {
      const { data: votes } = await supabase
        .from('podcast_request_votes')
        .select('request_id')
        .eq('voter_id', voterId)
      if (votes) {
        setVotedIds(new Set(votes.map((v) => v.request_id)))
      }
    }
    setLoading(false)
  }, [])

  // Fetch when section opens
  useEffect(() => {
    if (isOpen) {
      fetchRequests()
    }
  }, [isOpen, fetchRequests])

  async function handleVote(requestId: string) {
    const voterId = getVoterId()
    if (!voterId || votedIds.has(requestId)) return

    setVotingId(requestId)
    const { data, error } = await supabase.rpc('vote_for_podcast_request', {
      p_request_id: requestId,
      p_voter_id: voterId,
    })

    if (!error && data === true) {
      setVotedIds((prev) => new Set(prev).add(requestId))
      setRequests((prev) =>
        prev
          .map((r) => (r.id === requestId ? { ...r, vote_count: r.vote_count + 1 } : r))
          .sort((a, b) => b.vote_count - a.vote_count)
      )
    }
    setVotingId(null)
  }

  function handleSignIn(e: React.FormEvent) {
    e.preventDefault()
    if (!signInName.trim() || !signInEmail.trim()) return
    const id = { name: signInName.trim(), email: signInEmail.trim() }
    storeIdentity(id.name, id.email)
    setIdentity(id)
    setShowSignIn(false)
    setShowForm(true)
  }

  function handleSignOut() {
    localStorage.removeItem('espresso_user_identity')
    setIdentity(null)
    setShowForm(false)
  }

  async function handleSubmitRequest(e: React.FormEvent) {
    e.preventDefault()
    if (!newName.trim() || !identity) return

    setSubmitting(true)
    const { error } = await supabase.from('podcast_requests').insert({
      podcast_name: newName.trim(),
      podcast_host: newHost.trim() || null,
      podcast_url: newUrl.trim() || null,
      requested_by_name: identity.name,
      requested_by_email: identity.email,
    })

    if (!error) {
      setNewName('')
      setNewHost('')
      setNewUrl('')
      setShowForm(false)
      setSubmitSuccess(true)
      setTimeout(() => setSubmitSuccess(false), 3000)
      fetchRequests()
    }
    setSubmitting(false)
  }

  return (
    <div className="max-w-lg mx-auto w-full">
      {/* Toggle Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center justify-center gap-2 mx-auto text-sm text-charcoal-500 hover:text-charcoal-800 transition-colors group"
      >
        <span>More knowledge bases coming soon</span>
        <span className="text-charcoal-400">·</span>
        <span className="font-medium text-charcoal-700 group-hover:text-charcoal-900 transition-colors">
          Request one
        </span>
        <svg
          className={`w-3.5 h-3.5 transition-transform duration-300 ${isOpen ? 'rotate-180' : ''}`}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>

      {/* Collapsible Content */}
      <div
        className={`overflow-hidden transition-all duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] ${
          isOpen ? 'max-h-[800px] opacity-100 mt-6' : 'max-h-0 opacity-0 mt-0'
        }`}
      >
        <div className="bg-white border border-charcoal-200 rounded-xl p-5 space-y-4">
          {/* Header */}
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-charcoal-800 uppercase tracking-wider">
              Requested Knowledge Bases
            </h3>
            {identity && (
              <div className="flex items-center gap-2">
                <span className="text-xs text-charcoal-500">{identity.name}</span>
                <button
                  onClick={handleSignOut}
                  className="text-xs text-charcoal-400 hover:text-charcoal-600 underline underline-offset-2"
                >
                  Sign out
                </button>
              </div>
            )}
          </div>

          <p className="text-xs text-charcoal-500 -mt-2">
            Podcasts, personalities, thought leaders — any deep knowledge base you want explored.
          </p>

          {/* Request List */}
          {loading ? (
            <div className="py-6 text-center text-sm text-charcoal-400">Loading…</div>
          ) : requests.length === 0 ? (
            <div className="py-6 text-center text-sm text-charcoal-400">
              No requests yet. Be the first!
            </div>
          ) : (
            <ul className="divide-y divide-charcoal-100">
              {requests.map((req) => {
                const hasVoted = votedIds.has(req.id)
                const isVoting = votingId === req.id
                return (
                  <li key={req.id} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
                    {/* Vote Button */}
                    <button
                      onClick={() => handleVote(req.id)}
                      disabled={hasVoted || isVoting}
                      className={`flex flex-col items-center justify-center min-w-[44px] py-1.5 rounded-lg border transition-all text-xs font-medium ${
                        hasVoted
                          ? 'bg-charcoal-50 border-charcoal-300 text-charcoal-600 cursor-default'
                          : 'bg-charcoal-50 border-charcoal-200 text-charcoal-600 hover:border-charcoal-400 hover:text-charcoal-800 hover:bg-charcoal-100'
                      }`}
                      title={hasVoted ? 'Already voted' : 'Upvote'}
                    >
                      <svg
                        className="w-3 h-3 mb-0.5"
                        viewBox="0 0 24 24"
                        fill={hasVoted ? 'currentColor' : 'none'}
                        stroke="currentColor"
                        strokeWidth="2.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <path d="M12 5l-7 7h14l-7-7z" />
                      </svg>
                      <span>{req.vote_count}</span>
                    </button>

                    {/* Details */}
                    <div className="flex-grow min-w-0">
                      <p className="text-sm font-medium text-charcoal-900 truncate">
                        {req.podcast_name}
                      </p>
                      {req.podcast_host && (
                        <p className="text-xs text-charcoal-500 truncate">
                          {req.podcast_host}
                        </p>
                      )}
                    </div>
                  </li>
                )
              })}
            </ul>
          )}

          {/* Success message */}
          {submitSuccess && (
            <div className="text-center text-sm text-green-700 bg-green-50 rounded-lg py-2">
              Request submitted! ✓
            </div>
          )}

          {/* Divider + Actions */}
          <div className="border-t border-charcoal-100 pt-4">
            {!identity && !showSignIn && (
              <button
                onClick={() => setShowSignIn(true)}
                className="w-full text-sm font-medium text-charcoal-700 hover:text-charcoal-900 transition-colors py-2 border border-charcoal-200 rounded-lg hover:border-charcoal-400"
              >
                Sign in to request a knowledge base
              </button>
            )}

            {/* Sign-in form */}
            {showSignIn && !identity && (
              <form onSubmit={handleSignIn} className="space-y-3">
                <p className="text-xs text-charcoal-500">
                  Enter your name and email to submit a request.
                </p>
                <input
                  type="text"
                  placeholder="Your name"
                  value={signInName}
                  onChange={(e) => setSignInName(e.target.value)}
                  required
                  className="w-full px-3 py-2 text-sm border border-charcoal-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-charcoal-400 focus:border-charcoal-400 bg-cream-50 placeholder:text-charcoal-400"
                />
                <input
                  type="email"
                  placeholder="Your email"
                  value={signInEmail}
                  onChange={(e) => setSignInEmail(e.target.value)}
                  required
                  className="w-full px-3 py-2 text-sm border border-charcoal-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-charcoal-400 focus:border-charcoal-400 bg-cream-50 placeholder:text-charcoal-400"
                />
                <div className="flex gap-2">
                  <button
                    type="submit"
                    className="flex-1 text-sm font-medium text-white bg-charcoal-800 hover:bg-charcoal-900 rounded-lg py-2 transition-colors"
                  >
                    Continue
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowSignIn(false)}
                    className="px-4 text-sm text-charcoal-500 hover:text-charcoal-700 transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            )}

            {/* Add request form (signed in) */}
            {identity && !showForm && !submitSuccess && (
              <button
                onClick={() => setShowForm(true)}
                className="w-full text-sm font-medium text-charcoal-700 hover:text-charcoal-900 transition-colors py-2 border border-dashed border-charcoal-300 rounded-lg hover:border-charcoal-400"
              >
                + Request a knowledge base
              </button>
            )}

            {identity && showForm && (
              <form onSubmit={handleSubmitRequest} className="space-y-3">
                <input
                  type="text"
                  placeholder="Podcast, personality, or topic name *"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  required
                  className="w-full px-3 py-2 text-sm border border-charcoal-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-charcoal-400 focus:border-charcoal-400 bg-cream-50 placeholder:text-charcoal-400"
                />
                <input
                  type="text"
                  placeholder="Host / Creator name (optional)"
                  value={newHost}
                  onChange={(e) => setNewHost(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-charcoal-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-charcoal-400 focus:border-charcoal-400 bg-cream-50 placeholder:text-charcoal-400"
                />
                <input
                  type="url"
                  placeholder="Link (optional)"
                  value={newUrl}
                  onChange={(e) => setNewUrl(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-charcoal-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-charcoal-400 focus:border-charcoal-400 bg-cream-50 placeholder:text-charcoal-400"
                />
                <div className="flex gap-2">
                  <button
                    type="submit"
                    disabled={submitting || !newName.trim()}
                    className="flex-1 text-sm font-medium text-white bg-charcoal-800 hover:bg-charcoal-900 disabled:opacity-50 rounded-lg py-2 transition-colors"
                  >
                    {submitting ? 'Submitting…' : 'Submit Request'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowForm(false)}
                    className="px-4 text-sm text-charcoal-500 hover:text-charcoal-700 transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
