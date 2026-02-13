'use client'

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

interface InsightCardProps {
  insight: Insight
  isSelected?: boolean
  onSelect: (insight: Insight) => void
}

export default function InsightCard({ insight, isSelected, onSelect }: InsightCardProps) {
  const signal = SIGNAL_STYLES[insight.signal]

  return (
    <button
      onClick={() => onSelect(insight)}
      className={`group block w-full text-left bg-white border rounded-xl p-5 md:p-6 transition-all duration-200 ${
        isSelected
          ? 'border-accent-400 shadow-md ring-1 ring-accent-200'
          : 'border-charcoal-200 hover:border-charcoal-300 hover:shadow-sm'
      }`}
    >
      {/* Header */}
      <div className="space-y-3">
        <div className="flex items-center gap-2 flex-wrap">
          <span
            className={`inline-flex items-center gap-1.5 text-[11px] font-medium px-2 py-0.5 rounded-full ${signal.bg} ${signal.text}`}
          >
            <span className={`w-1.5 h-1.5 rounded-full ${signal.dot}`} />
            {SIGNAL_LABELS[insight.signal]}
          </span>

          {/* Bulb icon with count (shown only if count > 0) */}
          {insight.valuable_count > 0 && (
            <span className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full bg-yellow-50 text-yellow-700 ml-auto">
              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor" stroke="none">
                <path d="M12 2a7 7 0 0 0-7 7c0 2.38 1.19 4.47 3 5.74V17a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1v-2.26c1.81-1.27 3-3.36 3-5.74a7 7 0 0 0-7-7zM9 21a1 1 0 0 0 1 1h4a1 1 0 0 0 1-1v-1H9v1z" />
              </svg>
              {insight.valuable_count}
            </span>
          )}
        </div>

        {/* Title */}
        <h3
          className={`text-lg md:text-xl font-serif font-semibold leading-snug transition-colors ${
            isSelected ? 'text-accent-700' : 'text-charcoal-900 group-hover:text-charcoal-700'
          }`}
        >
          {insight.title}
        </h3>
      </div>

      {/* Footer */}
      <div className="mt-4 pt-3 border-t border-charcoal-100 flex items-center justify-between">
        <div className="flex items-center gap-3 text-xs text-charcoal-400">
          <span className="flex items-center gap-1">
            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
              <circle cx="9" cy="7" r="4" />
              <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
              <path d="M16 3.13a4 4 0 0 1 0 7.75" />
            </svg>
            <span className="font-medium text-charcoal-500">{insight.guest_count}</span> guests
          </span>
          <span className="text-charcoal-300">·</span>
          <span className="flex items-center gap-1">
            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 11a9 9 0 0 1 9 9" />
              <path d="M4 4a16 16 0 0 1 16 16" />
              <circle cx="5" cy="19" r="1" />
            </svg>
            <span className="font-medium text-charcoal-500">{insight.episode_count}</span> episodes
          </span>
        </div>

        <span
          className={`text-xs font-medium transition-colors ${
            isSelected ? 'text-accent-600' : 'text-charcoal-400 group-hover:text-accent-500'
          }`}
        >
          View breakdown →
        </span>
      </div>
    </button>
  )
}
