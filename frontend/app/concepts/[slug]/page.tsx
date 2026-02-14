import Link from 'next/link'
import ConceptValuableButton from '@/components/concepts/ConceptValuableButton'
import ConceptBody from '@/components/concepts/ConceptBody'
import { getConceptBySlug } from '@/lib/api/concepts'
import { extractBodyReferences, mergeReferences } from '@/lib/extract-body-references'

export const revalidate = 300

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

export default async function ConceptPage({ params }: { params: { slug: string } }) {
  const podcastSlug = 'lennys-podcast'
  const concept = await getConceptBySlug(params.slug, podcastSlug)

  if (!concept) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center space-y-4">
          <h1 className="text-2xl font-serif font-semibold">Concept not found</h1>
          <Link href={`/${podcastSlug}`} className="text-accent-600 hover:underline">
            Return to Knowledge Base
          </Link>
        </div>
      </div>
    )
  }

  // Extract inline citations from body and merge with database references
  const bodyRefs = extractBodyReferences(concept.body)
  const allReferences = mergeReferences(concept.references ?? [], bodyRefs)

  return (
    <article className="min-h-screen bg-cream-50">
      {/* Header */}
      <header className="border-b border-charcoal-200 bg-white sticky top-0 z-10">
        <div className="max-w-3xl mx-auto px-4 md:px-6 h-16 flex items-center justify-between">
          <Link 
            href={`/${podcastSlug}`}
            className="flex items-center gap-2 text-charcoal-500 hover:text-charcoal-900 transition-colors text-sm font-medium"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M19 12H5M12 19l-7-7 7-7"/>
            </svg>
            Back to Knowledge Base
          </Link>
          <ConceptValuableButton conceptId={concept.id} initialCount={concept.valuable_count} />
        </div>
      </header>

      <div className="max-w-3xl mx-auto px-4 md:px-6 py-3 md:py-5 space-y-5 md:space-y-6">
        {/* Title Section */}
        <div className="space-y-4 md:space-y-6">
          <div className="flex items-center gap-3 text-xs md:text-sm text-charcoal-500">
            <span>Last updated {new Date(concept.created_at).toLocaleDateString()}</span>
          </div>
          
          <h1 className="text-2xl md:text-4xl lg:text-5xl font-serif font-bold text-charcoal-900 leading-tight">
            {concept.title}
          </h1>
          
          {concept.summary && (
            <p className="text-base md:text-xl text-charcoal-600 font-serif italic leading-relaxed border-l-4 border-accent-200 pl-4 md:pl-6 py-2">
              {concept.summary}
            </p>
          )}
        </div>

        {/* Main Content — rendered with proper formatting */}
        <ConceptBody body={concept.body} />

        {/* References & Sources — DB refs merged with inline body citations */}
        {allReferences.length > 0 && (
          <div className="border-t border-charcoal-200 pt-8 md:pt-12 space-y-4 md:space-y-6">
            <h3 className="text-base md:text-lg font-serif font-semibold text-charcoal-900">
              References &amp; Sources
            </h3>
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

        {/* CTA */}
        <div className="bg-charcoal-900 rounded-xl p-6 md:p-8 text-center space-y-4">
          <h3 className="text-lg md:text-xl font-serif font-semibold text-white">
            Have questions about this concept?
          </h3>
          <p className="text-sm md:text-base text-charcoal-300 max-w-md mx-auto">
            Ask the collective wisdom of the podcast guests to go deeper into specific nuances.
          </p>
          <Link
            href={`/${podcastSlug}?tab=chat`}
            className="inline-block btn-primary bg-white text-charcoal-900 hover:bg-charcoal-50 hover:text-charcoal-900 border-none"
          >
            Ask the Collective
          </Link>
        </div>
      </div>
    </article>
  )
}
