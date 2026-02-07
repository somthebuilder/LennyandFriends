'use client'

import type { QuestionResponse } from '@/lib/types/panel'

interface ExpertResponseProps {
  response: QuestionResponse
}

export default function ExpertResponse({ response }: ExpertResponseProps) {
  return (
    <div className="editorial-card p-6 bg-white border border-charcoal-100">
      {/* Header */}
      <div className="flex items-center gap-3 mb-4">
        <div className="w-12 h-12 rounded-full bg-gradient-to-br from-orange-300 to-orange-400 flex items-center justify-center text-white text-sm font-bold flex-shrink-0 shadow-md">
          {response.expertAvatar ? (
            <img 
              src={response.expertAvatar} 
              alt={response.expertName}
              className="w-full h-full rounded-full object-cover"
            />
          ) : (
            response.expertName.split(' ').map(n => n[0]).join('')
          )}
        </div>
        <div>
          <p className="font-bold text-charcoal-900">{response.expertName}</p>
          <p className="text-sm text-charcoal-500">
            {response.expertTitle}{response.expertCompany ? `, ${response.expertCompany}` : ''}
          </p>
        </div>
      </div>

      {/* Divider */}
      <div className="h-px bg-charcoal-100 mb-4"></div>

      {/* Response Content */}
      <p className="text-charcoal-700 leading-relaxed mb-4 whitespace-pre-line">
        {response.responseText}
      </p>

      {/* Episode Citation */}
      {response.episodeReferences.length > 0 && (
        <div className="flex items-start gap-2 mb-4 text-sm text-charcoal-600">
          <span>📎</span>
          <div>
            {response.episodeReferences.map((ref, idx) => (
              <p key={idx}>
                From: '{ref.episodeTitle}' panel discussion
                <br />
                Episode {ref.episodeNumber} @ {ref.timestamp}
              </p>
            ))}
          </div>
        </div>
      )}

      {/* Action Button */}
      {response.episodeReferences.length > 0 && (
        <button className="px-4 py-2 text-sm font-medium text-charcoal-700 border border-charcoal-300 rounded-lg hover:bg-charcoal-50 transition-colors">
          🎧 Listen to episode
        </button>
      )}
    </div>
  )
}

