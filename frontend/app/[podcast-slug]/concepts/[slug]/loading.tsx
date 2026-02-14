import Header from '@/components/Header'

export default function ConceptLoading() {
  return (
    <div className="min-h-screen bg-cream-50 flex flex-col">
      <Header />
      <main className="flex-1 max-w-3xl mx-auto px-4 md:px-6 py-8 w-full">
        {/* Loader */}
        <div className="flex flex-col items-center justify-center py-12 gap-3">
          <img src="/loader1.png" alt="" className="w-14 h-14 object-contain animate-pulse" />
          <p className="text-sm text-charcoal-400 font-serif italic animate-pulse">Brewing this concept…</p>
        </div>

        {/* Title skeleton */}
        <div className="space-y-3 mb-6">
          <div className="h-3 bg-espresso-100/50 rounded-full w-20 animate-pulse" />
          <div className="h-7 bg-espresso-100/70 rounded-full w-4/5 animate-pulse" style={{ animationDelay: '50ms' }} />
          <div className="h-4 bg-cream-200/80 rounded-full w-full animate-pulse" style={{ animationDelay: '100ms' }} />
          <div className="h-4 bg-cream-200/60 rounded-full w-3/4 animate-pulse" style={{ animationDelay: '150ms' }} />
        </div>

        {/* Metadata skeleton */}
        <div className="flex gap-3 mb-8">
          <div className="h-6 bg-espresso-50 rounded-full w-24 animate-pulse" />
          <div className="h-6 bg-espresso-50 rounded-full w-20 animate-pulse" />
        </div>

        {/* Body skeleton */}
        <div className="space-y-4">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="space-y-2 animate-pulse" style={{ animationDelay: `${i * 80}ms` }}>
              {i % 3 === 1 && <div className="h-5 bg-espresso-100/50 rounded-full w-48 mt-4" />}
              <div className="h-3.5 bg-cream-200/70 rounded-full w-full" />
              <div className="h-3.5 bg-cream-200/50 rounded-full w-11/12" />
              <div className="h-3.5 bg-cream-200/40 rounded-full w-4/5" />
            </div>
          ))}
        </div>
      </main>
    </div>
  )
}
