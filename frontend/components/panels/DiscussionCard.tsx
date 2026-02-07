'use client'

import { useState } from 'react'
import type { Discussion, AgreementLevel } from '@/lib/types/panel'

interface DiscussionCardProps {
  discussion: Discussion
  onAskExpert: (expertName: string) => void
}

const agreementIndicators: Record<AgreementLevel, { text: string; icon: string }> = {
  consensus: { text: 'Strong consensus', icon: '✓' },
  moderate_disagreement: { text: 'Moderate disagreement', icon: '⚖️' },
  strong_disagreement: { text: 'Strong disagreement', icon: '⚔️' },
  nuanced: { text: 'Nuanced', icon: '🎯' },
}

export default function DiscussionCard({ discussion, onAskExpert }: DiscussionCardProps) {
  const [isExpanded, setIsExpanded] = useState(false)
  const indicator = agreementIndicators[discussion.agreementLevel]

  const previewPerspectives = discussion.perspectives.slice(0, 3)

  return (
    <div
      className={`editorial-card p-6 border border-charcoal-100 transition-all duration-300 ${
        isExpanded ? '' : 'hover:shadow-lg cursor-pointer'
      }`}
      onClick={!isExpanded ? () => setIsExpanded(true) : undefined}
    >
      {!isExpanded ? (
        // Collapsed State
        <>
          <div className="flex items-start gap-3 mb-3">
            <span className="text-2xl">💬</span>
            <div className="flex-1">
              <h3 className="font-bold text-charcoal-900 text-lg mb-2">
                {discussion.title}
              </h3>
              <p className="text-sm text-charcoal-600 mb-3">
                {discussion.perspectives.length} perspectives · {indicator.text} {indicator.icon}
              </p>
            </div>
          </div>

          {/* Perspective Previews */}
          <div className="space-y-2 mb-4">
            {previewPerspectives.map((perspective, idx) => {
              const initials = perspective.expertName
                .split(' ')
                .map(n => n[0])
                .join('')
              const firstSentence = perspective.content.split('.')[0] + '.'
              
              return (
                <p key={idx} className="text-sm text-charcoal-700">
                  <span className="font-semibold">{initials}:</span> '{firstSentence}'
                </p>
              )
            })}
          </div>

          <button
            onClick={(e) => {
              e.stopPropagation()
              setIsExpanded(true)
            }}
            className="text-sm font-medium text-orange-600 hover:text-orange-700 transition-colors"
          >
            Expand discussion →
          </button>
        </>
      ) : (
        // Expanded State
        <>
          <div className="flex items-start justify-between mb-6">
            <div className="flex items-start gap-3">
              <span className="text-2xl">💬</span>
              <div>
                <h3 className="font-bold text-charcoal-900 text-xl mb-2">
                  {discussion.title}
                </h3>
                <p className="text-sm text-charcoal-600">
                  {discussion.perspectives.length} perspectives · {indicator.text} {indicator.icon}
                </p>
              </div>
            </div>
            <button
              onClick={() => setIsExpanded(false)}
              className="text-sm font-medium text-charcoal-500 hover:text-charcoal-700 transition-colors"
            >
              Collapse discussion ↑
            </button>
          </div>

          {/* Expert Perspectives */}
          <div className="space-y-8 mb-8">
            {discussion.perspectives.map((perspective) => (
              <div key={perspective.id} className="border-b border-charcoal-100 pb-6 last:border-0 last:pb-0">
                {/* Expert Header */}
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-12 h-12 rounded-full bg-gradient-to-br from-orange-300 to-orange-400 flex items-center justify-center text-white text-sm font-bold flex-shrink-0 shadow-md">
                    {perspective.expertAvatar ? (
                      <img 
                        src={perspective.expertAvatar} 
                        alt={perspective.expertName}
                        className="w-full h-full rounded-full object-cover"
                      />
                    ) : (
                      perspective.expertName.split(' ').map(n => n[0]).join('')
                    )}
                  </div>
                  <div>
                    <p className="font-bold text-charcoal-900">
                      {perspective.expertName}
                    </p>
                    <p className="text-sm text-charcoal-500">
                      {perspective.expertTitle}{perspective.expertCompany ? `, ${perspective.expertCompany}` : ''}
                    </p>
                  </div>
                </div>

                {/* Divider */}
                <div className="h-px bg-charcoal-100 mb-4"></div>

                {/* Perspective Text */}
                <p className="text-charcoal-700 leading-relaxed mb-4 whitespace-pre-line">
                  {perspective.content}
                </p>

                {/* Episode Citation */}
                <div className="flex items-start gap-2 mb-4 text-sm text-charcoal-600">
                  <span>📎</span>
                  <div>
                    <p>Episode {perspective.episodeNumber} - '{perspective.episodeTitle}' @ {perspective.timestamp}</p>
                  </div>
                </div>

                {/* Action Buttons */}
                <div className="flex gap-3">
                  <button className="px-4 py-2 text-sm font-medium text-charcoal-700 border border-charcoal-300 rounded-lg hover:bg-charcoal-50 transition-colors">
                    🎧 Listen to episode
                  </button>
                  <button
                    onClick={() => onAskExpert(perspective.expertName)}
                    className="px-4 py-2 text-sm font-medium text-orange-600 border border-orange-300 rounded-lg hover:bg-orange-50 transition-colors"
                  >
                    💬 Ask {perspective.expertName.split(' ')[0]}
                  </button>
                </div>
              </div>
            ))}
          </div>

          {/* Key Takeaways */}
          {discussion.keyTakeaways.length > 0 && (
            <div className="bg-orange-50 border border-orange-200 rounded-lg p-6 mb-6">
              <h4 className="font-bold text-charcoal-900 mb-4 flex items-center gap-2">
                <span>💡</span>
                Key Takeaways from this discussion:
              </h4>
              <ul className="space-y-2">
                {discussion.keyTakeaways.map((takeaway, idx) => {
                  const icon = 
                    takeaway.type === 'consensus' ? '✓' :
                    takeaway.type === 'nuanced' ? '⚖️' :
                    '🎯'
                  
                  return (
                    <li key={idx} className="flex items-start gap-2 text-sm text-charcoal-700">
                      <span className="text-orange-600 mt-0.5">{icon}</span>
                      <span>{takeaway.text}</span>
                    </li>
                  )
                })}
              </ul>
            </div>
          )}

          <button
            onClick={() => setIsExpanded(false)}
            className="text-sm font-medium text-charcoal-500 hover:text-charcoal-700 transition-colors"
          >
            Collapse discussion ↑
          </button>
        </>
      )}
    </div>
  )
}

