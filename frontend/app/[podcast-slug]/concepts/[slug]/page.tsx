import Link from 'next/link'
import { getConceptBySlug } from '@/lib/api/concepts'

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
  const concept = await getConceptBySlug(params.slug, params['podcast-slug'])

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

  return (
    <article className="min-h-screen bg-cream-50">
      <header className="border-b border-charcoal-200 bg-white sticky top-0 z-10">
        <div className="max-w-3xl mx-auto px-6 h-16 flex items-center justify-between">
          <Link
            href={`/${params['podcast-slug']}`}
            className="flex items-center gap-2 text-charcoal-500 hover:text-charcoal-900 transition-colors text-sm font-medium"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M19 12H5M12 19l-7-7 7-7" />
            </svg>
            Back to Knowledge Base
          </Link>
        </div>
      </header>

      <div className="max-w-3xl mx-auto px-6 py-12 space-y-12">
        <div className="space-y-6">
          <div className="flex items-center gap-3 flex-wrap">
            <span className="chip-accent">Core Concept</span>
            {concept.theme_label && <span className="text-sm text-charcoal-500">Theme: {concept.theme_label}</span>}
            {concept.category && <span className="text-sm text-charcoal-500">Category: {concept.category}</span>}
            <span className="text-sm text-charcoal-500">{concept.guest_count ?? 0} guests · {concept.episode_count ?? 0} episodes</span>
          </div>

          <h1 className="text-4xl md:text-5xl font-serif font-bold text-charcoal-900 leading-tight">{concept.title}</h1>

          {concept.summary && (
            <p className="text-xl text-charcoal-600 font-serif italic leading-relaxed border-l-4 border-accent-200 pl-6 py-2">
              {concept.summary}
            </p>
          )}
        </div>

        <div className="prose-editorial">
          {concept.body
            .split(/\n{2,}/)
            .map((paragraph, idx) => paragraph.trim())
            .filter(Boolean)
            .map((paragraph, idx) => (
              <p key={idx}>{paragraph}</p>
            ))}
        </div>

        <div className="border-t border-charcoal-200 pt-12 space-y-6">
          <h3 className="text-lg font-serif font-semibold text-charcoal-900">References & Sources</h3>
          <div className="grid gap-4 sm:grid-cols-2">
            {concept.references?.map((ref, idx) => {
              const clickable = deepLink(ref.episode_url, ref.time_seconds)
              const label = formatSeconds(ref.time_seconds) ?? ref.timestamp ?? null
              return (
                <div key={idx} className="p-4 rounded-lg bg-white border border-charcoal-200 space-y-2">
                  <div className="font-medium text-charcoal-900">{ref.guest_name}</div>
                  <div className="text-sm text-charcoal-600">{ref.episode_title}</div>
                  {label && <div className="text-xs text-charcoal-400 font-mono">Time: {label}</div>}
                  {clickable && (
                    <a
                      href={clickable}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 text-xs text-accent-700 hover:text-accent-600"
                    >
                      Open clip
                      <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                        <polyline points="15 3 21 3 21 9" />
                        <line x1="10" y1="14" x2="21" y2="3" />
                      </svg>
                    </a>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </article>
  )
}

