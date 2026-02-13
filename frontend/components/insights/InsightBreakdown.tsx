'use client'

import { useState, useEffect } from 'react'
import { Insight, SIGNAL_LABELS, SignalBadge } from '@/lib/api/insights'

const SIGNAL_STYLES: Record<SignalBadge, { bg: string; text: string; dot: string }> = {
  high_consensus: {
    bg: 'bg-green-50',
    text: 'text-green-700',
    dot: 'bg-green-500',
  },
  split_view: {
    bg: 'bg-amber-50',
    text: 'text-amber-700',
    dot: 'bg-amber-500',
  },
  emerging: {
    bg: 'bg-blue-50',
    text: 'text-blue-700',
    dot: 'bg-blue-500',
  },
}

interface InsightBreakdownProps {
  insight: Insight
  isVoted: boolean
  onVote: (insightId: string) => Promise<boolean>
  onClose: () => void
  onDiscussInChat: (insightTitle: string) => void
}

function formatSeconds(seconds?: number): string | null {
  if (typeof seconds !== 'number' || Number.isNaN(seconds) || seconds < 0) return null
  const hrs = Math.floor(seconds / 3600)
  const mins = Math.floor((seconds % 3600) / 60)
  const secs = Math.floor(seconds % 60)
  if (hrs > 0) return `${hrs}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`
  return `${mins}:${String(secs).padStart(2, '0')}`
}

function deepLink(url?: string, seconds?: number): string | null {
  if (!url) return null
  if (typeof seconds !== 'number' || Number.isNaN(seconds) || seconds < 0) return url
  const joiner = url.includes('?') ? '&' : '?'
  return `${url}${joiner}t=${Math.floor(seconds)}`
}

export default function InsightBreakdown({ insight, isVoted, onVote, onClose, onDiscussInChat }: InsightBreakdownProps) {
  const signal = SIGNAL_STYLES[insight.signal]

  const [isSubmitting, setIsSubmitting] = useState(false)

  // Reset submitting state when insight changes
  useEffect(() => {
    setIsSubmitting(false)
  }, [insight.id])

  async function handleBulbClick(e: React.MouseEvent) {
    e.stopPropagation()
    if (isVoted || isSubmitting) return

    setIsSubmitting(true)
    try {
      await onVote(insight.id)
    } finally {
      setIsSubmitting(false)
    }
  }

  // Deduplicate guests from the evidence list
  const relevantGuests = Array.from(
    new Map(insight.evidence.map((ref) => [ref.guest_name, ref])).values()
  )
  const MAX_VISIBLE_GUESTS = 3
  const visibleGuests = relevantGuests.slice(0, MAX_VISIBLE_GUESTS)
  const remainingGuestCount = relevantGuests.length - MAX_VISIBLE_GUESTS

  return (
    <div className="bg-white border border-charcoal-200 rounded-xl overflow-hidden animate-fade-in">
      {/* Close button (mobile) */}
      <div className="flex items-center justify-between px-5 pt-4 md:hidden">
        <span className={`inline-flex items-center gap-1.5 text-[11px] font-medium px-2 py-0.5 rounded-full ${signal.bg} ${signal.text}`}>
          <span className={`w-1.5 h-1.5 rounded-full ${signal.dot}`} />
          {SIGNAL_LABELS[insight.signal]}
        </span>
        <div className="flex items-center gap-2">
          {/* Bulb button (mobile) */}
          <button
            onClick={handleBulbClick}
            disabled={isVoted || isSubmitting}
            className={`inline-flex items-center gap-1 p-1.5 rounded-lg transition-all duration-200 ${
              isVoted
                ? 'text-yellow-500 bg-yellow-50'
                : 'text-charcoal-300 hover:text-yellow-500 hover:bg-yellow-50'
            } ${isSubmitting ? 'opacity-50' : ''}`}
            title={isVoted ? 'Marked as valuable' : 'Mark as valuable'}
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill={isVoted ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth={isVoted ? '0' : '1.5'} strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 2a7 7 0 0 0-7 7c0 2.38 1.19 4.47 3 5.74V17a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1v-2.26c1.81-1.27 3-3.36 3-5.74a7 7 0 0 0-7-7z" />
              <path d="M9 21a1 1 0 0 0 1 1h4a1 1 0 0 0 1-1v-1H9v1z" />
            </svg>
            {insight.valuable_count > 0 && (
              <span className="text-xs font-medium">{insight.valuable_count}</span>
            )}
          </button>
          <button
            onClick={onClose}
            className="p-1.5 text-charcoal-400 hover:text-charcoal-700 transition-colors rounded-lg hover:bg-charcoal-50"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>

      <div className="p-5 md:p-6 space-y-6">
        {/* Signal badge + bulb + close (desktop) */}
        <div className="hidden md:flex items-center justify-between">
          <span className={`inline-flex items-center gap-1.5 text-[11px] font-medium px-2 py-0.5 rounded-full ${signal.bg} ${signal.text}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${signal.dot}`} />
            {SIGNAL_LABELS[insight.signal]}
          </span>
          <div className="flex items-center gap-2">
            {/* Bulb button with count (desktop) */}
            <button
              onClick={handleBulbClick}
              disabled={isVoted || isSubmitting}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-sm font-medium transition-all duration-200 ${
                isVoted
                  ? 'text-yellow-600 bg-yellow-50 border border-yellow-200'
                  : 'text-charcoal-400 bg-charcoal-50 border border-charcoal-200 hover:text-yellow-600 hover:bg-yellow-50 hover:border-yellow-200'
              } ${isSubmitting ? 'opacity-50' : ''}`}
              title={isVoted ? 'Marked as valuable' : 'Mark as valuable'}
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill={isVoted ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth={isVoted ? '0' : '1.5'} strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 2a7 7 0 0 0-7 7c0 2.38 1.19 4.47 3 5.74V17a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1v-2.26c1.81-1.27 3-3.36 3-5.74a7 7 0 0 0-7-7z" />
                <path d="M9 21a1 1 0 0 0 1 1h4a1 1 0 0 0 1-1v-1H9v1z" />
              </svg>
              {insight.valuable_count > 0 && (
                <span className="text-xs">{insight.valuable_count}</span>
              )}
            </button>
            <button
              onClick={onClose}
              className="p-1.5 text-charcoal-400 hover:text-charcoal-700 transition-colors rounded-lg hover:bg-charcoal-50"
            >
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Title */}
        <h2 className="text-xl md:text-2xl font-serif font-semibold text-charcoal-900 leading-snug">
          {insight.title}
        </h2>
        {(insight.theme_label || insight.category) && (
          <div className="flex items-center gap-2 flex-wrap">
            {insight.theme_label && <span className="text-xs text-charcoal-500">Theme: {insight.theme_label}</span>}
            {insight.category && <span className="text-xs text-charcoal-500">Category: {insight.category}</span>}
          </div>
        )}

        {/* Section A: Guests who discussed this topic */}
        <div className="bg-cream-50 rounded-lg p-4 space-y-3">
          <span className="text-xs font-medium uppercase tracking-wider text-charcoal-400">
            Discussed by
          </span>
          <div className="flex flex-wrap gap-2">
            {visibleGuests.map((ref, idx) => (
              <span
                key={idx}
                className="relative group/guest inline-flex items-center gap-1.5 text-xs bg-white border border-charcoal-200 px-2.5 py-1.5 rounded-full text-charcoal-700 cursor-default"
              >
                {/* Person icon */}
                <svg className="w-3 h-3 text-charcoal-400 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="8" r="4" />
                  <path d="M20 21a8 8 0 1 0-16 0" />
                </svg>
                <span className="font-medium">{ref.guest_name}</span>

                {/* Tooltip for guest role */}
                {ref.guest_role && (
                  <span className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2.5 py-1.5 rounded-lg bg-charcoal-900 text-white text-[11px] font-normal whitespace-nowrap opacity-0 group-hover/guest:opacity-100 transition-opacity duration-150 z-10 shadow-lg">
                    {ref.guest_role}
                    <span className="absolute top-full left-1/2 -translate-x-1/2 -mt-px border-4 border-transparent border-t-charcoal-900" />
                  </span>
                )}
              </span>
            ))}
            {remainingGuestCount > 0 && (
              <span className="inline-flex items-center text-xs bg-cream-100 border border-charcoal-200 px-2.5 py-1.5 rounded-full text-charcoal-500 font-medium">
                + {remainingGuestCount}
              </span>
            )}
          </div>
          <p className="text-[11px] text-charcoal-400">
            {relevantGuests.length} guest{relevantGuests.length !== 1 ? 's' : ''} across {insight.episode_count} episode{insight.episode_count !== 1 ? 's' : ''}
          </p>
        </div>

        {/* Section B: What this means */}
        <div className="space-y-3">
          <h3 className="text-sm font-semibold uppercase tracking-wider text-charcoal-500">
            What this means
          </h3>
          <ul className="space-y-2.5">
            {insight.explanation.map((point, idx) => (
              <li key={idx} className="flex gap-3 text-sm text-charcoal-700 leading-relaxed">
                <span className="flex-shrink-0 w-5 h-5 rounded-full bg-cream-100 text-charcoal-400 text-[11px] font-medium flex items-center justify-center mt-0.5">
                  {idx + 1}
                </span>
                <span>{point}</span>
              </li>
            ))}
          </ul>
        </div>

        {/* Section C: References — always expanded, no collapsible toggle */}
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-charcoal-500">
            <span>References</span>
            <span className="text-xs font-normal normal-case text-charcoal-400">
              ({insight.evidence.length} sources)
            </span>
          </div>

          <div className="space-y-2">
            {insight.evidence.map((ref, idx) => (
              <div
                key={idx}
                className="bg-cream-50 rounded-lg p-3 space-y-1.5"
              >
                {(() => {
                  const clipUrl = deepLink(ref.episode_url, ref.time_seconds)
                  const timeLabel = formatSeconds(ref.time_seconds) ?? ref.timestamp ?? null
                  return (
                <div className="flex items-center gap-2 text-xs">
                  <span className="font-medium text-charcoal-700">{ref.guest_name}</span>
                  <span className="text-charcoal-300">·</span>
                  <span className="text-charcoal-500 truncate">{ref.episode_title}</span>
                  {timeLabel && (
                    <>
                      <span className="text-charcoal-300">·</span>
                      <span className="text-charcoal-400 font-mono text-[11px]">{timeLabel}</span>
                    </>
                  )}
                  {clipUrl && (
                    <a
                      href={clipUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex-shrink-0 text-xs text-accent-700 hover:text-accent-600 transition-colors ml-auto inline-flex items-center gap-1"
                      title="Open episode"
                      onClick={(e) => e.stopPropagation()}
                    >
                      view
                      <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                        <polyline points="15 3 21 3 21 9" />
                        <line x1="10" y1="14" x2="21" y2="3" />
                      </svg>
                    </a>
                  )}
                </div>
                  )
                })()}
                {ref.quote && (
                  <p className="text-sm text-charcoal-600 italic leading-relaxed pl-3 border-l-2 border-charcoal-200">
                    &ldquo;{ref.quote}&rdquo;
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* CTA */}
        <div className="pt-2">
          <button
            onClick={() => onDiscussInChat(insight.title)}
            className="w-full flex items-center justify-center gap-2 py-3 rounded-lg bg-charcoal-900 text-white text-sm font-medium transition-all hover:bg-charcoal-800 hover:shadow-md active:bg-charcoal-900"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
            </svg>
            Discuss this in Chat
          </button>
        </div>
      </div>
    </div>
  )
}
