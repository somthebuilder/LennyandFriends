'use client'

interface NoResultsProps {
  question: string
  panelTopics: string[]
  relatedPanels?: Array<{ id: string; name: string; slug: string }>
  onAskDifferent: () => void
}

export default function NoResults({
  question,
  panelTopics,
  relatedPanels = [],
  onAskDifferent,
}: NoResultsProps) {
  return (
    <div className="editorial-card p-12 bg-white border border-charcoal-100 text-center">
      <div className="text-6xl mb-6">🤔</div>
      <h3 className="text-2xl font-bold text-charcoal-900 mb-4">
        Hmm, this panel hasn't discussed this topic
      </h3>
      <p className="text-charcoal-600 mb-8 max-w-2xl mx-auto">
        This panel focuses on {panelTopics.join(', ')}. Your question about "{question}" hasn't come up in their conversations.
      </p>

      {/* Suggestions */}
      <div className="text-left max-w-2xl mx-auto mb-8">
        <h4 className="font-semibold text-charcoal-900 mb-3">Try asking about:</h4>
        <ul className="space-y-2">
          {panelTopics.map((topic, idx) => (
            <li key={idx} className="flex items-start gap-2 text-charcoal-700">
              <span className="text-orange-600 mt-1">•</span>
              <span>{topic}</span>
            </li>
          ))}
        </ul>
      </div>

      {/* Related Panels */}
      {relatedPanels.length > 0 && (
        <div className="text-left max-w-2xl mx-auto mb-8">
          <h4 className="font-semibold text-charcoal-900 mb-3">Or explore other panels:</h4>
          <div className="space-y-2">
            {relatedPanels.map((panel) => (
              <a
                key={panel.id}
                href={`/lennys-podcast/panels/${panel.slug}`}
                className="block text-orange-600 hover:text-orange-700 font-medium transition-colors"
              >
                {panel.name} →
              </a>
            ))}
          </div>
        </div>
      )}

      <button
        onClick={onAskDifferent}
        className="px-6 py-3 bg-gradient-to-r from-orange-600 to-orange-500 text-white rounded-lg font-semibold hover:shadow-lg transition-all duration-200"
      >
        Ask a different question
      </button>
    </div>
  )
}

