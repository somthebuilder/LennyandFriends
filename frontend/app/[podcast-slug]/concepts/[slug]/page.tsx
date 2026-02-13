import Link from 'next/link'
import Header from '@/components/Header'
import ConceptValuableButton from '@/components/concepts/ConceptValuableButton'
import ConceptBody from '@/components/concepts/ConceptBody'
import { getConceptBySlug } from '@/lib/api/concepts'
import { extractBodyReferences, mergeReferences } from '@/lib/extract-body-references'

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

export default async function ConceptPage({ params }: { params: { 'podcast-slug': string; slug: string } }) {
  const podcastSlug = params['podcast-slug']
  const concept = await getConceptBySlug(params.slug, podcastSlug)

  if (!concept) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center space-y-4">
          <h1 className="text-2xl font-serif font-semibold">Concept not found</h1>
          <Link href={`/${params['podcast-slug']}`} className="text-accent-600 hover:underline">
            Return to Knowledge Base
          </Link>
        </div>
      </div>
    )
  }

  const tabs = [
    {
      id: 'insights',
      label: 'Insights',
      href: `/${podcastSlug}?tab=insights`,
      icon: (
        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
          <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
        </svg>
      ),
    },
    {
      id: 'concepts',
      label: 'Concepts',
      href: `/${podcastSlug}?tab=concepts`,
      icon: (
        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10" />
          <path d="M12 16v-4" />
          <path d="M12 8h.01" />
        </svg>
      ),
    },
    {
      id: 'chat',
      label: 'Chat',
      href: `/${podcastSlug}?tab=chat`,
      icon: (
        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
        </svg>
      ),
    },
  ]

  // Extract inline citations from body and merge with database references
  const bodyRefs = extractBodyReferences(concept.body)
  const allReferences = mergeReferences(concept.references ?? [], bodyRefs)

  return (
    <div className="min-h-screen bg-cream-50 flex flex-col">
      <Header />

      <div className="sticky top-14 z-30 bg-cream-50/95 backdrop-blur-md border-b border-charcoal-200/50">
        <div className="max-w-5xl mx-auto px-4 md:px-6">
          <nav className="flex gap-1" role="tablist">
            {tabs.map((tab) => {
              const isActive = tab.id === 'concepts'
              const classes = `relative flex items-center gap-1.5 px-4 py-3 text-sm font-medium transition-colors ${
                isActive ? 'text-charcoal-900' : 'text-charcoal-400 hover:text-charcoal-600'
              }`
              return isActive ? (
                <span key={tab.id} role="tab" aria-selected="true" className={classes}>
                  {tab.icon}
                  {tab.label}
                  <span className="absolute bottom-0 left-2 right-2 h-0.5 bg-charcoal-900 rounded-full" />
                </span>
              ) : (
                <Link key={tab.id} role="tab" aria-selected="false" href={tab.href} className={classes}>
                  {tab.icon}
                  {tab.label}
                </Link>
              )
            })}
          </nav>
        </div>
      </div>

      <article className="flex-1">
        {/* Sticky back + title + bulb */}
        <div className="sticky top-[7.5rem] z-20 border-b border-charcoal-200/50 bg-cream-50/95 backdrop-blur-md">
          <div className="max-w-5xl mx-auto px-4 md:px-6 py-2">
            <div className="grid grid-cols-[40px_1fr_auto] items-center gap-3">
              <Link
                href={`/${podcastSlug}?tab=concepts`}
                className="inline-flex items-center justify-center w-9 h-9 rounded-full text-charcoal-500 hover:text-charcoal-900 hover:bg-white transition-colors"
                aria-label="Back to concepts"
                title="Back to concepts"
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M19 12H5M12 19l-7-7 7-7" />
                </svg>
              </Link>
              <p className="text-sm font-medium text-charcoal-700 truncate">{concept.title}</p>
              <ConceptValuableButton conceptId={concept.id} initialCount={concept.valuable_count} />
            </div>
          </div>
        </div>

        <div className="max-w-3xl mx-auto px-4 md:px-6 py-6 md:py-10 space-y-6 md:space-y-8">
          {/* Title section — responsive sizing */}
          <div className="space-y-4 md:space-y-6">
            {(concept.theme_label || concept.category) && (
              <div className="flex items-center gap-3 flex-wrap text-xs md:text-sm text-charcoal-500">
                {concept.theme_label && <span>Theme: {concept.theme_label}</span>}
                {concept.category && <span>Category: {concept.category}</span>}
              </div>
            )}

            <h1 className="text-2xl md:text-4xl lg:text-5xl font-serif font-bold text-charcoal-900 leading-tight">
              {concept.title}
            </h1>

            {concept.summary && (
              <p className="text-base md:text-xl text-charcoal-600 font-serif italic leading-relaxed border-l-4 border-accent-200 pl-4 md:pl-6 py-2">
                {concept.summary}
              </p>
            )}
          </div>

          {/* Body — rendered with proper formatting */}
          <ConceptBody body={concept.body} />

          {/* References & Sources — DB refs merged with inline body citations */}
          {allReferences.length > 0 && (
            <div className="border-t border-charcoal-200 pt-8 md:pt-12 space-y-4 md:space-y-6">
              <h3 className="text-base md:text-lg font-serif font-semibold text-charcoal-900">References &amp; Sources</h3>
              <div className="grid gap-3 md:gap-4 sm:grid-cols-2">
                {allReferences.map((ref, idx) => {
                  const clickUrl = deepLink(ref.episode_url, ref.time_seconds)
                  const timeLabel = formatSeconds(ref.time_seconds) ?? ref.timestamp ?? null
                  const cardContent = (
                    <>
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1 space-y-1">
                          <div className="font-medium text-sm md:text-base text-charcoal-900">{ref.guest_name}</div>
                          <div className="text-xs md:text-sm text-charcoal-600 line-clamp-2">{ref.episode_title}</div>
                        </div>
                        <div className="flex-shrink-0 w-8 h-8 rounded-full bg-accent-50 flex items-center justify-center">
                          <svg className="w-4 h-4 text-accent-700" viewBox="0 0 24 24" fill="currentColor">
                            <path d="M8 5v14l11-7z" />
                          </svg>
                        </div>
                      </div>
                      {timeLabel && (
                        <div className="flex items-center gap-1.5 text-[11px] md:text-xs text-charcoal-400">
                          <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <circle cx="12" cy="12" r="10" />
                            <polyline points="12 6 12 12 16 14" />
                          </svg>
                          <span className="font-mono">{timeLabel}</span>
                        </div>
                      )}
                    </>
                  )
                  return clickUrl ? (
                    <a
                      key={idx}
                      href={clickUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block p-3 md:p-4 rounded-lg bg-white border border-charcoal-200 space-y-2 md:space-y-3 hover:border-accent-300 hover:shadow-md hover:bg-accent-50/30 transition-all cursor-pointer group"
                    >
                      {cardContent}
                    </a>
                  ) : (
                    <div key={idx} className="p-3 md:p-4 rounded-lg bg-white border border-charcoal-200 space-y-2 md:space-y-3">
                      {cardContent}
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>
      </article>
    </div>
  )
}
