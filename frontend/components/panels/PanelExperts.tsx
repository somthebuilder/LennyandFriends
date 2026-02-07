'use client'

import { useState } from 'react'
import type { Expert } from '@/lib/types/panel'

interface PanelExpertsProps {
  experts: Expert[]
}

export default function PanelExperts({ experts }: PanelExpertsProps) {
  const [isExpanded, setIsExpanded] = useState(false)
  const shouldCollapse = experts.length > 3
  const displayedExperts = shouldCollapse && !isExpanded 
    ? experts.slice(0, 3) 
    : experts

  return (
    <div>
      <h3 className="text-sm font-bold text-charcoal-500 uppercase tracking-wider mb-4">
        PANEL EXPERTS
      </h3>
      <div className={experts.length <= 3 
        ? "flex flex-wrap gap-4" 
        : "space-y-4"
      }>
        {displayedExperts.map((expert) => (
          <div 
            key={expert.id} 
            className="flex items-center gap-3"
          >
            <div className="w-12 h-12 rounded-full bg-gradient-to-br from-orange-300 to-orange-400 flex items-center justify-center text-white text-sm font-bold flex-shrink-0 shadow-md">
              {expert.avatar ? (
                <img 
                  src={expert.avatar} 
                  alt={expert.name}
                  className="w-full h-full rounded-full object-cover"
                />
              ) : (
                expert.name.split(' ').map(n => n[0]).join('')
              )}
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-charcoal-900 text-sm">
                {expert.name}
              </p>
              <p className="text-xs text-charcoal-500 leading-relaxed mt-0.5">
                {expert.title}{expert.company ? `, ${expert.company}` : ''}
              </p>
            </div>
          </div>
        ))}
      </div>
      {shouldCollapse && (
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="mt-4 text-sm font-medium text-orange-600 hover:text-orange-700 transition-colors"
        >
          {isExpanded 
            ? 'Show less' 
            : `Show ${experts.length - 3} more experts`
          }
        </button>
      )}
    </div>
  )
}

