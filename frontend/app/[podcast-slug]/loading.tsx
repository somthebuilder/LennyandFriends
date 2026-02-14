import Header from '@/components/Header'

/**
 * Streaming loading skeleton for the podcast page.
 * Shown while the server fetches concepts/insights from Supabase.
 */
export default function PodcastLoading() {
  return (
    <div className="min-h-screen bg-cream-50 flex flex-col">
      <Header />

      {/* Tab bar skeleton */}
      <div className="sticky top-14 z-30 bg-cream-50/95 backdrop-blur-md border-b border-charcoal-200/50">
        <div className="max-w-5xl mx-auto px-4 md:px-6">
          <nav className="flex gap-1">
            {['Insights', 'Concepts', 'Chat'].map((label) => (
              <div
                key={label}
                className={`px-5 py-3 text-sm font-medium ${
                  label === 'Insights'
                    ? 'text-charcoal-900 border-b-2 border-charcoal-900'
                    : 'text-charcoal-400'
                }`}
              >
                {label}
              </div>
            ))}
          </nav>
        </div>
      </div>

      {/* Content skeleton */}
      <div className="max-w-5xl mx-auto px-4 md:px-6 py-3 md:py-5 w-full">
        {/* Bean loading animation */}
        <div className="flex flex-col items-center justify-center py-16 gap-4">
          <div className="relative">
            {/* Coffee cup icon */}
            <div className="w-12 h-12 rounded-full bg-espresso-100 flex items-center justify-center animate-pulse">
              <img src="/espressologo.png" alt="" className="w-8 h-8 object-contain opacity-60" />
            </div>
          </div>
          <p className="text-sm text-charcoal-400 font-serif italic animate-pulse">
            Brewing your knowledge base…
          </p>
        </div>

        {/* Card skeletons */}
        <div className="space-y-3 mt-2">
          {[1, 2, 3, 4].map((i) => (
            <div
              key={i}
              className="bg-white/60 border border-espresso-100/50 rounded-xl p-5 animate-pulse"
              style={{ animationDelay: `${i * 100}ms` }}
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 space-y-3">
                  <div className="h-2.5 bg-espresso-100/60 rounded-full w-20" />
                  <div className="h-4 bg-espresso-100/80 rounded-full w-3/4" />
                  <div className="space-y-2 pt-1">
                    <div className="h-2.5 bg-cream-200/80 rounded-full w-full" />
                    <div className="h-2.5 bg-cream-200/60 rounded-full w-5/6" />
                  </div>
                </div>
                <div className="flex-shrink-0">
                  <div className="w-10 h-10 rounded-lg bg-espresso-50" />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
