'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import Header from '@/components/Header'
import Footer from '@/components/Footer'
import { supabase } from '@/lib/supabase'
import type { User } from '@supabase/supabase-js'

interface Podcast {
  id: string
  name: string
  host: string | null
  description: string
  slug: string
  accent_color: string
  tagline: string | null
  cover_image: string | null
  status: string
  featured: boolean
  vote_count: number
}

interface PodcastRequest {
  id: string
  podcast_name: string
  podcast_host: string | null
  podcast_url: string | null
  vote_count: number
}

// Per-podcast accent colors for featured (active) cards
const ACCENT_MAP: Record<string, {
  border: string
  text: string
  tagBg: string
  tagText: string
  arrow: string
}> = {
  orange: {
    border: 'hover:border-accent-500',
    text: 'group-hover:text-accent-600',
    tagBg: 'bg-accent-50',
    tagText: 'text-accent-700',
    arrow: 'group-hover:text-accent-500',
  },
  blue: {
    border: 'hover:border-podcast-blue-500',
    text: 'group-hover:text-podcast-blue-600',
    tagBg: 'bg-podcast-blue-50',
    tagText: 'text-podcast-blue-700',
    arrow: 'group-hover:text-podcast-blue-500',
  },
  emerald: {
    border: 'hover:border-podcast-emerald-500',
    text: 'group-hover:text-podcast-emerald-600',
    tagBg: 'bg-podcast-emerald-50',
    tagText: 'text-podcast-emerald-700',
    arrow: 'group-hover:text-podcast-emerald-500',
  },
}

const DEFAULT_ACCENT = ACCENT_MAP.orange

function getVoterId(): string {
  if (typeof window === 'undefined') return ''
  let id = localStorage.getItem('espresso_podcast_voter_id')
  if (!id) {
    id = crypto.randomUUID()
    localStorage.setItem('espresso_podcast_voter_id', id)
  }
  return id
}

function getRequestVoterId(): string {
  if (typeof window === 'undefined') return ''
  let id = localStorage.getItem('espresso_voter_id')
  if (!id) {
    id = crypto.randomUUID()
    localStorage.setItem('espresso_voter_id', id)
  }
  return id
}

export default function LandingPage() {
  const [featuredPodcasts, setFeaturedPodcasts] = useState<Podcast[]>([])
  const [comingSoonPodcasts, setComingSoonPodcasts] = useState<Podcast[]>([])
  const [loading, setLoading] = useState(true)
  const [votedIds, setVotedIds] = useState<Set<string>>(new Set())
  const [votingId, setVotingId] = useState<string | null>(null)

  // ── Auth state ──
  const [user, setUser] = useState<User | null>(null)

  // ── Community request state ──
  const [requests, setRequests] = useState<PodcastRequest[]>([])
  const [requestVotedIds, setRequestVotedIds] = useState<Set<string>>(new Set())
  const [requestVotingId, setRequestVotingId] = useState<string | null>(null)
  const [showSuggest, setShowSuggest] = useState(false)
  const [newName, setNewName] = useState('')
  const [newHost, setNewHost] = useState('')
  const [newUrl, setNewUrl] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [submitSuccess, setSubmitSuccess] = useState(false)

  // ── Inline auth in suggest section ──
  const [inlineAuthMode, setInlineAuthMode] = useState<'signup' | 'signin'>('signup')
  const [inlineEmail, setInlineEmail] = useState('')
  const [inlinePassword, setInlinePassword] = useState('')
  const [inlineName, setInlineName] = useState('')
  const [inlineAuthLoading, setInlineAuthLoading] = useState(false)
  const [inlineAuthError, setInlineAuthError] = useState<string | null>(null)
  const [inlineAuthSuccess, setInlineAuthSuccess] = useState<string | null>(null)

  // ── Auth listener ──
  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      setUser(user)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null)
    })

    return () => subscription.unsubscribe()
  }, [])

  const fetchPodcasts = useCallback(async () => {
    const { data, error } = await supabase
      .from('podcasts')
      .select('id, name, host, description, slug, accent_color, tagline, cover_image, status, featured, vote_count')
      .in('status', ['active', 'coming_soon'])
      .order('display_order', { ascending: true })

    if (!error && data) {
      setFeaturedPodcasts(data.filter((p) => p.status === 'active'))
      setComingSoonPodcasts(data.filter((p) => p.status === 'coming_soon'))
    }
    setLoading(false)
  }, [])

  const fetchRequests = useCallback(async () => {
    const { data } = await supabase
      .from('podcast_requests')
      .select('id, podcast_name, podcast_host, podcast_url, vote_count')
      .order('vote_count', { ascending: false })
    if (data) setRequests(data)

    const voterId = getRequestVoterId()
    if (voterId) {
      const { data: votes } = await supabase
        .from('podcast_request_votes')
        .select('request_id')
        .eq('voter_id', voterId)
      if (votes) setRequestVotedIds(new Set(votes.map((v) => v.request_id)))
    }
  }, [])

  useEffect(() => {
    fetchPodcasts()
  }, [fetchPodcasts])

  // Check which coming_soon podcasts this user has voted for
  useEffect(() => {
    if (comingSoonPodcasts.length === 0) return
    const voterId = getVoterId()
    if (!voterId) return
    const stored = localStorage.getItem('espresso_podcast_votes')
    if (stored) {
      try { setVotedIds(new Set(JSON.parse(stored))) } catch { /* ignore */ }
    }
  }, [comingSoonPodcasts])

  // Fetch community requests when suggest section opens
  useEffect(() => {
    if (showSuggest) fetchRequests()
  }, [showSuggest, fetchRequests])

  async function handleVote(podcastId: string) {
    const voterId = getVoterId()
    if (!voterId || votedIds.has(podcastId)) return

    setVotingId(podcastId)
    const podcast = comingSoonPodcasts.find((p) => p.id === podcastId)
    if (!podcast) return

    const { error } = await supabase
      .from('podcasts')
      .update({ vote_count: podcast.vote_count + 1 })
      .eq('id', podcastId)

    if (!error) {
      setComingSoonPodcasts((prev) =>
        prev.map((p) =>
          p.id === podcastId ? { ...p, vote_count: p.vote_count + 1 } : p
        )
      )
      const newVoted = new Set(votedIds).add(podcastId)
      setVotedIds(newVoted)
      localStorage.setItem('espresso_podcast_votes', JSON.stringify([...newVoted]))
    }
    setVotingId(null)
  }

  async function handleRequestVote(requestId: string) {
    const voterId = getRequestVoterId()
    if (!voterId || requestVotedIds.has(requestId)) return

    setRequestVotingId(requestId)
    const { data, error } = await supabase.rpc('vote_for_podcast_request', {
      p_request_id: requestId,
      p_voter_id: voterId,
    })

    if (!error && data === true) {
      setRequestVotedIds((prev) => new Set(prev).add(requestId))
      setRequests((prev) =>
        prev
          .map((r) => (r.id === requestId ? { ...r, vote_count: r.vote_count + 1 } : r))
          .sort((a, b) => b.vote_count - a.vote_count)
      )
    }
    setRequestVotingId(null)
  }

  async function handleSubmitRequest(e: React.FormEvent) {
    e.preventDefault()
    if (!newName.trim() || !user) return
    setSubmitting(true)
    const { error } = await supabase.from('podcast_requests').insert({
      podcast_name: newName.trim(),
      podcast_host: newHost.trim() || null,
      podcast_url: newUrl.trim() || null,
      requested_by_name: user.user_metadata?.full_name || user.email?.split('@')[0] || 'Anonymous',
      requested_by_email: user.email,
    })
    if (!error) {
      setNewName(''); setNewHost(''); setNewUrl('')
      setSubmitSuccess(true)
      setTimeout(() => setSubmitSuccess(false), 3000)
      fetchRequests()
    }
    setSubmitting(false)
  }

  async function handleInlineSignUp(e: React.FormEvent) {
    e.preventDefault()
    setInlineAuthLoading(true)
    setInlineAuthError(null)
    setInlineAuthSuccess(null)

    const { error } = await supabase.auth.signUp({
      email: inlineEmail,
      password: inlinePassword,
      options: { data: { full_name: inlineName } },
    })

    if (error) {
      setInlineAuthError(error.message)
    } else {
      if (typeof window !== 'undefined') localStorage.setItem('espresso_has_account', '1')
      setInlineAuthSuccess('Check your email to confirm, then you can suggest.')
    }
    setInlineAuthLoading(false)
  }

  async function handleInlineSignIn(e: React.FormEvent) {
    e.preventDefault()
    setInlineAuthLoading(true)
    setInlineAuthError(null)

    const { error } = await supabase.auth.signInWithPassword({
      email: inlineEmail,
      password: inlinePassword,
    })

    if (error) {
      setInlineAuthError(error.message)
    } else {
      if (typeof window !== 'undefined') localStorage.setItem('espresso_has_account', '1')
    }
    setInlineAuthLoading(false)
  }

  return (
    <div className="min-h-screen flex flex-col bg-cream-50">
      <Header />

      <main className="flex-1 flex flex-col items-center justify-center px-6 py-16">
        <div className="max-w-3xl w-full space-y-16 text-center">

          {/* ── Hero: The Espresso Masthead ── */}
          <div className="space-y-0">
            {/* Top decorative rule + dateline */}
            <div className="opacity-0 animate-hero-enter flex items-center gap-4 justify-center mb-8">
              <div className="h-px w-12 md:w-20 bg-gradient-to-r from-transparent to-espresso-300" />
              <span className="text-[9px] md:text-[10px] font-sans font-medium uppercase tracking-[0.35em] text-espresso-400 select-none">
                Vol. I · 2026
              </span>
              <div className="h-px w-12 md:w-20 bg-gradient-to-l from-transparent to-espresso-300" />
            </div>

            {/* Logo with animated steam */}
            <div className="opacity-0 animate-hero-enter-delay flex flex-col items-center mb-5">
              <div className="relative">
                {/* Steam wisps */}
                <div className="absolute -top-5 left-1/2 -translate-x-1/2 flex gap-3 pointer-events-none">
                  <div className="steam-wisp animate-steam-1" />
                  <div className="steam-wisp animate-steam-2 h-[14px]" />
                  <div className="steam-wisp animate-steam-3 h-[12px]" />
                </div>
              <img
                src="/espressologo.png"
                  alt=""
                  className="w-20 h-20 md:w-28 md:h-28 object-contain drop-shadow-lg"
              />
              </div>
            </div>

            {/* App name — oversized editorial Playfair with warm gradient */}
            <div className="opacity-0 animate-hero-enter-delay flex flex-col items-center">
              <h1 className="text-5xl md:text-7xl lg:text-8xl font-cafe italic text-warm-gradient tracking-tight leading-[1.1] select-none pb-1">
              espresso
            </h1>
            </div>

            {/* Decorative mid-rule */}
            <div className="rule-animated mx-auto max-w-[180px] md:max-w-[240px] mt-6 mb-6" />

            {/* Tagline — serif italic, refined */}
            <div className="opacity-0 animate-hero-enter-delay-2 flex flex-col items-center gap-3">
              <p className="font-serif italic text-lg md:text-xl text-espresso-500/90 tracking-wide leading-relaxed">
                Collective wisdom, distilled.
              </p>
              <p className="text-sm text-charcoal-400 font-sans max-w-sm mx-auto leading-relaxed">
                Insights from the world&apos;s best operators, extracted,
                synthesized, searchable.
            </p>
            </div>
          </div>

          {/* ── Featured Podcasts ── */}
          <div className="space-y-4 max-w-3xl mx-auto w-full opacity-0 animate-section-enter">
            {loading ? (
              <div className="bg-white/80 border border-espresso-100 rounded-2xl p-8 animate-pulse">
                <div className="h-3 bg-espresso-100 rounded-full w-1/4 mb-4" />
                <div className="h-5 bg-espresso-100 rounded-full w-2/3 mb-3" />
                <div className="h-3 bg-espresso-50 rounded-full w-1/3 mb-4" />
                <div className="h-3 bg-cream-200 rounded-full w-full mb-2" />
                <div className="h-3 bg-cream-200 rounded-full w-5/6" />
              </div>
            ) : (
              featuredPodcasts.map((podcast) => {
                const colors = ACCENT_MAP[podcast.accent_color] || DEFAULT_ACCENT
                return (
                  <Link
                    key={podcast.id}
                    href={`/${podcast.slug}`}
                    className={`group relative block bg-white/80 backdrop-blur-sm border border-espresso-200/60 rounded-2xl p-6 md:p-7 transition-all duration-300 ${colors.border} hover:shadow-lg hover:shadow-espresso-200/30 text-left overflow-hidden`}
                  >
                    {/* Subtle warm gradient glow on hover */}
                    <div className="absolute inset-0 bg-gradient-to-br from-espresso-50/0 via-transparent to-accent-50/0 group-hover:from-espresso-50/40 group-hover:to-accent-50/30 transition-all duration-500 rounded-2xl" />

                    <div className="relative flex flex-col gap-4">
                    <div className="flex items-start justify-between gap-4">
                      <div className="space-y-2 min-w-0 flex-1">
                        {podcast.tagline && (
                            <span className={`inline-block text-[10px] font-sans font-semibold uppercase tracking-[0.15em] ${colors.tagText} ${colors.tagBg} px-2.5 py-1 rounded-full`}>
                            {podcast.tagline}
                          </span>
                        )}
                          <h2 className={`text-xl md:text-2xl font-serif font-semibold text-charcoal-900 ${colors.text} transition-colors leading-tight`}>
                          {podcast.name}
                        </h2>
                        {podcast.host && (
                            <p className="text-sm text-espresso-500 font-medium">
                              by {podcast.host}
                          </p>
                        )}
                          <p className="text-charcoal-600 font-sans text-sm leading-relaxed">
                            {podcast.slug === 'lennys-podcast'
                              ? "Interviews with world-class product leaders and growth experts to uncover concrete, actionable, and tactical advice to help you build, launch, and grow your own product."
                              : podcast.description}
                        </p>
                      </div>

                      <div className="flex-shrink-0 flex items-center">
                        {podcast.cover_image ? (
                          <img
                            src={podcast.cover_image}
                            alt=""
                              className="w-14 h-14 rounded-xl object-cover shadow-sm group-hover:shadow-md transition-shadow duration-300"
                          />
                        ) : (
                          <div className={`text-charcoal-300 ${colors.arrow} transition-colors transform group-hover:translate-x-1 duration-300`}>
                            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M5 12h14M12 5l7 7-7 7"/>
                            </svg>
                          </div>
                        )}
                        </div>
                      </div>

                      {/* Nudge — editorial rule + CTA */}
                      <div className="flex items-center gap-3">
                        <div className="flex-1 h-px bg-gradient-to-r from-espresso-200/60 to-transparent" />
                        <span className={`inline-flex items-center gap-1.5 text-[11px] font-sans font-medium tracking-wide ${colors.tagText} opacity-50 group-hover:opacity-100 transition-all duration-300`}>
                          Explore knowledge base
                          <svg className="w-3 h-3 transform group-hover:translate-x-0.5 transition-transform duration-300" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M5 12h14M12 5l7 7-7 7"/>
                          </svg>
                        </span>
                      </div>
                    </div>
                  </Link>
                )
              })
            )}
          </div>

          {/* ── Coming Soon & Suggest ── */}
          {!loading && (
            <div className="max-w-3xl mx-auto w-full space-y-6 opacity-0 animate-section-enter-d1">
              {/* Section divider — editorial style matching hero */}
              <div className="flex items-center gap-4 justify-center">
                <div className="h-px w-16 md:w-24 bg-gradient-to-r from-transparent to-espresso-300/70" />
                <span className="text-[10px] font-sans font-medium uppercase tracking-[0.3em] text-espresso-400 select-none">
                  Coming Soon
                </span>
                <div className="h-px w-16 md:w-24 bg-gradient-to-l from-transparent to-espresso-300/70" />
              </div>

              <p className="text-sm text-charcoal-500 font-serif italic text-center">
                Vote for the knowledge bases you want explored next, or suggest your own.
              </p>

              {/* Grid: coming-soon podcasts + suggest card */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {comingSoonPodcasts.map((podcast) => {
                  const hasVoted = votedIds.has(podcast.id)
                  const isVoting = votingId === podcast.id

                  return (
                    <div
                      key={podcast.id}
                      className="group bg-white/70 backdrop-blur-sm border border-espresso-200/50 rounded-2xl p-5 text-left transition-all duration-300 hover:border-espresso-300 hover:shadow-md hover:shadow-espresso-100/40 flex flex-col"
                    >
                      <div className="space-y-2.5 flex-1">
                        {podcast.tagline && (
                          <span className="inline-block text-[9px] font-sans font-semibold uppercase tracking-[0.15em] text-espresso-600 bg-espresso-50 px-2 py-0.5 rounded-full">
                            {podcast.tagline}
                          </span>
                        )}
                        <h3 className="text-base font-serif font-semibold text-charcoal-900 group-hover:text-espresso-600 transition-colors leading-snug">
                          {podcast.name}
                        </h3>
                        {podcast.host && (
                          <p className="text-[11px] text-espresso-400 font-medium leading-snug">{podcast.host}</p>
                        )}
                        <p className="text-charcoal-500 font-sans text-xs leading-relaxed line-clamp-3">
                          {podcast.description}
                        </p>
                      </div>
                        <button
                          onClick={() => handleVote(podcast.id)}
                          disabled={hasVoted || isVoting}
                        className={`mt-3 w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-xs font-medium transition-all duration-200 ${
                            hasVoted
                            ? 'bg-espresso-50 text-espresso-600 border border-espresso-200 cursor-default'
                            : 'bg-cream-100 text-charcoal-600 border border-espresso-200/40 hover:bg-espresso-50 hover:text-espresso-600 hover:border-espresso-300'
                          }`}
                        >
                        <svg className="w-3 h-3" viewBox="0 0 24 24" fill={hasVoted ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M12 5l-7 7h14l-7-7z" />
                          </svg>
                          <span>
                            {hasVoted ? 'Voted' : 'Vote'}
                            {podcast.vote_count > 0 && <span className="ml-1 opacity-70">· {podcast.vote_count}</span>}
                          </span>
                        </button>
                    </div>
                  )
                })}

                {/* Suggest Card */}
                <button
                  onClick={() => setShowSuggest(!showSuggest)}
                  className={`group bg-white/50 border-2 border-dashed rounded-2xl p-5 text-left transition-all duration-300 flex flex-col items-center justify-center gap-3 min-h-[180px] ${
                    showSuggest
                      ? 'border-espresso-400 bg-espresso-50/40'
                      : 'border-espresso-200/60 hover:border-espresso-300 hover:bg-espresso-50/30'
                  }`}
                >
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center transition-all duration-300 ${
                    showSuggest
                      ? 'bg-espresso-200 text-espresso-700 rotate-45'
                      : 'bg-cream-200 text-espresso-400 group-hover:bg-espresso-100 group-hover:text-espresso-600'
                  }`}>
                    <svg className="w-4 h-4 transition-transform duration-300" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M12 5v14M5 12h14" />
                    </svg>
                  </div>
                  <span className={`text-sm font-serif font-semibold transition-colors ${
                    showSuggest ? 'text-espresso-700' : 'text-charcoal-600 group-hover:text-espresso-600'
                  }`}>
                    Suggest a knowledge base
                  </span>
                  <span className="text-[11px] text-charcoal-400 leading-snug text-center font-sans">
                    Podcasts, personalities, thought leaders
                  </span>
                </button>
              </div>

              {/* ── Expanded: Community Requests + Form ── */}
              <div className={`overflow-hidden transition-all duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] ${
                showSuggest ? 'max-h-[1000px] opacity-100' : 'max-h-0 opacity-0'
              }`}>
                <div className="bg-white/80 backdrop-blur-sm border border-espresso-200/50 rounded-2xl p-6 space-y-5 mt-1">

                  {/* Existing community requests */}
                  {requests.length > 0 && (
                    <div className="space-y-3">
                      <div className="flex items-center gap-3">
                        <div className="h-px flex-1 bg-gradient-to-r from-espresso-200/40 to-transparent" />
                        <h4 className="text-[10px] font-sans font-semibold uppercase tracking-[0.2em] text-espresso-400">
                        Community Suggestions
                      </h4>
                        <div className="h-px flex-1 bg-gradient-to-l from-espresso-200/40 to-transparent" />
                      </div>
                      <ul className="divide-y divide-espresso-100/60">
                        {requests.map((req) => {
                          const hasVoted = requestVotedIds.has(req.id)
                          const isVoting = requestVotingId === req.id
                          return (
                            <li key={req.id} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
                              <button
                                onClick={() => handleRequestVote(req.id)}
                                disabled={hasVoted || isVoting}
                                className={`flex flex-col items-center justify-center min-w-[42px] py-1.5 rounded-xl border text-xs font-medium transition-all duration-200 ${
                                  hasVoted
                                    ? 'bg-espresso-50 border-espresso-200 text-espresso-600 cursor-default'
                                    : 'bg-cream-100 border-espresso-200/40 text-charcoal-500 hover:border-espresso-300 hover:text-espresso-600 hover:bg-espresso-50'
                                }`}
                                title={hasVoted ? 'Already voted' : 'Upvote'}
                              >
                                <svg className="w-2.5 h-2.5 mb-0.5" viewBox="0 0 24 24" fill={hasVoted ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                  <path d="M12 5l-7 7h14l-7-7z" />
                                </svg>
                                <span>{req.vote_count}</span>
                              </button>
                              <div className="flex-grow min-w-0 text-left">
                                <p className="text-sm font-serif font-semibold text-charcoal-800 truncate">{req.podcast_name}</p>
                                {req.podcast_host && (
                                  <p className="text-[11px] text-espresso-400 truncate">{req.podcast_host}</p>
                                )}
                              </div>
                            </li>
                          )
                        })}
                      </ul>
                    </div>
                  )}

                  {/* Success message */}
                  {submitSuccess && (
                    <div className="text-center text-sm text-espresso-700 bg-espresso-50 border border-espresso-200/60 rounded-xl py-3 px-4 font-serif italic">
                      Suggestion submitted ✓ — it will appear after review.
                    </div>
                  )}

                  {/* Divider + Actions */}
                  <div className="border-t border-espresso-100/60 pt-4">
                    {/* Not signed in — inline sign-up / sign-in form */}
                    {!user && (
                      <div className="space-y-3">
                        {/* Mode toggle */}
                        <div className="flex bg-cream-200/60 rounded-xl p-0.5">
                      <button
                            type="button"
                            onClick={() => { setInlineAuthMode('signup'); setInlineAuthError(null); setInlineAuthSuccess(null) }}
                            className={`flex-1 py-2 text-xs font-medium rounded-lg transition-all ${
                              inlineAuthMode === 'signup'
                                ? 'bg-white text-charcoal-900 shadow-sm'
                                : 'text-charcoal-500 hover:text-charcoal-700'
                            }`}
                          >
                            Sign Up
                          </button>
                          <button
                            type="button"
                            onClick={() => { setInlineAuthMode('signin'); setInlineAuthError(null); setInlineAuthSuccess(null) }}
                            className={`flex-1 py-2 text-xs font-medium rounded-lg transition-all ${
                              inlineAuthMode === 'signin'
                                ? 'bg-white text-charcoal-900 shadow-sm'
                                : 'text-charcoal-500 hover:text-charcoal-700'
                            }`}
                          >
                            Sign In
                          </button>
                        </div>

                        {inlineAuthError && (
                          <p className="text-xs text-red-600 bg-red-50 rounded-xl px-3 py-2.5">{inlineAuthError}</p>
                        )}
                        {inlineAuthSuccess && (
                          <p className="text-xs text-espresso-700 bg-espresso-50 rounded-xl px-3 py-2.5">{inlineAuthSuccess}</p>
                        )}

                        {!inlineAuthSuccess && (
                          <form
                            onSubmit={inlineAuthMode === 'signup' ? handleInlineSignUp : handleInlineSignIn}
                            className="space-y-2.5"
                          >
                            {inlineAuthMode === 'signup' && (
                              <input
                                type="text"
                                placeholder="Your name"
                                value={inlineName}
                                onChange={(e) => setInlineName(e.target.value)}
                                required
                                className="w-full px-4 py-2.5 text-sm border border-espresso-200/50 rounded-xl focus:outline-none focus:ring-2 focus:ring-espresso-300/30 focus:border-espresso-300 bg-cream-50 placeholder:text-charcoal-400 transition-all"
                                disabled={inlineAuthLoading}
                              />
                            )}
                            <input
                              type="email"
                              placeholder="Email"
                              value={inlineEmail}
                              onChange={(e) => setInlineEmail(e.target.value)}
                              required
                              className="w-full px-4 py-2.5 text-sm border border-espresso-200/50 rounded-xl focus:outline-none focus:ring-2 focus:ring-espresso-300/30 focus:border-espresso-300 bg-cream-50 placeholder:text-charcoal-400 transition-all"
                              disabled={inlineAuthLoading}
                            />
                            <input
                              type="password"
                              placeholder={inlineAuthMode === 'signup' ? 'Create a password (min. 6 chars)' : 'Password'}
                              value={inlinePassword}
                              onChange={(e) => setInlinePassword(e.target.value)}
                              required
                              minLength={inlineAuthMode === 'signup' ? 6 : undefined}
                              className="w-full px-4 py-2.5 text-sm border border-espresso-200/50 rounded-xl focus:outline-none focus:ring-2 focus:ring-espresso-300/30 focus:border-espresso-300 bg-cream-50 placeholder:text-charcoal-400 transition-all"
                              disabled={inlineAuthLoading}
                            />
                            <button
                              type="submit"
                              disabled={inlineAuthLoading}
                              className="w-full text-sm font-medium text-white bg-espresso-600 hover:bg-espresso-700 disabled:opacity-50 rounded-xl py-2.5 transition-all duration-200 shadow-sm hover:shadow-md"
                            >
                              {inlineAuthLoading
                                ? (inlineAuthMode === 'signup' ? 'Creating account…' : 'Signing in…')
                                : (inlineAuthMode === 'signup' ? 'Create Account & Suggest' : 'Sign In & Suggest')
                              }
                            </button>
                          </form>
                        )}
                      </div>
                    )}

                    {/* Signed in via Supabase — show submit form */}
                    {user && !submitSuccess && (
                      <form onSubmit={handleSubmitRequest} className="space-y-3">
                        <p className="text-xs text-charcoal-500 font-sans">
                          Suggesting as <span className="font-semibold text-espresso-600">{user.user_metadata?.full_name || user.email?.split('@')[0]}</span>
                        </p>
                        <input
                          type="text"
                          placeholder="Podcast, personality, or topic name *"
                          value={newName}
                          onChange={(e) => setNewName(e.target.value)}
                          required
                          className="w-full px-4 py-2.5 text-sm border border-espresso-200/50 rounded-xl focus:outline-none focus:ring-2 focus:ring-espresso-300/30 focus:border-espresso-300 bg-cream-50 placeholder:text-charcoal-400 transition-all"
                        />
                        <input
                          type="text"
                          placeholder="Host / Creator (optional)"
                          value={newHost}
                          onChange={(e) => setNewHost(e.target.value)}
                          className="w-full px-4 py-2.5 text-sm border border-espresso-200/50 rounded-xl focus:outline-none focus:ring-2 focus:ring-espresso-300/30 focus:border-espresso-300 bg-cream-50 placeholder:text-charcoal-400 transition-all"
                        />
                        <input
                          type="url"
                          placeholder="Link (optional)"
                          value={newUrl}
                          onChange={(e) => setNewUrl(e.target.value)}
                          className="w-full px-4 py-2.5 text-sm border border-espresso-200/50 rounded-xl focus:outline-none focus:ring-2 focus:ring-espresso-300/30 focus:border-espresso-300 bg-cream-50 placeholder:text-charcoal-400 transition-all"
                        />
                        <button
                          type="submit"
                          disabled={submitting || !newName.trim()}
                          className="w-full text-sm font-medium text-white bg-espresso-600 hover:bg-espresso-700 disabled:opacity-50 rounded-xl py-2.5 transition-all duration-200 shadow-sm hover:shadow-md"
                        >
                          {submitting ? 'Submitting…' : 'Submit Suggestion'}
                        </button>
                        <p className="text-[11px] text-charcoal-400 text-center leading-snug font-serif italic">
                          Suggestions are reviewed before being added to the list.
                        </p>
                      </form>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

        </div>
      </main>

      <Footer />
    </div>
  )
}
