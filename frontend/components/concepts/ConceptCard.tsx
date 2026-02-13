import Link from 'next/link'
import { Concept } from '@/lib/api/concepts'

interface ConceptCardProps {
  concept: Concept
  podcastSlug: string
  previewMode?: boolean
}

export default function ConceptCard({ concept, podcastSlug, previewMode = false }: ConceptCardProps) {
  const className =
    'group block bg-transparent border-b border-[#E5E5E2] py-6 first:pt-0 transition-colors'

  const content = (
    <div className="space-y-3">
      {/* Meta row with bulb on the right */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-xs text-charcoal-400">5 min read</span>
          {previewMode && (
            <>
              <span className="text-charcoal-300">·</span>
              <span className="text-xs text-accent-700">Preview</span>
            </>
          )}
        </div>

        {/* Bulb icon with count (shown only if count > 0) */}
        {concept.valuable_count > 0 && (
          <span className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full bg-yellow-50 text-yellow-700">
            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor" stroke="none">
              <path d="M12 2a7 7 0 0 0-7 7c0 2.38 1.19 4.47 3 5.74V17a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1v-2.26c1.81-1.27 3-3.36 3-5.74a7 7 0 0 0-7-7zM9 21a1 1 0 0 0 1 1h4a1 1 0 0 0 1-1v-1H9v1z" />
            </svg>
            {concept.valuable_count}
          </span>
        )}
      </div>

      {/* Title */}
      <h3 className="text-xl font-serif font-semibold text-charcoal-900 group-hover:text-accent-600 transition-colors leading-snug">
        {concept.title}
      </h3>

      {/* Summary */}
      <p className="text-charcoal-600 line-clamp-2 leading-relaxed">
        {concept.summary || concept.body}
      </p>

      {/* Reference Chips */}
      {concept.references && concept.references.length > 0 && (
        <div className="pt-2 flex flex-wrap gap-2">
          {concept.references.slice(0, 3).map((ref, idx) => (
            <span
              key={idx}
              className="inline-flex items-center gap-1.5 text-xs text-charcoal-600 bg-cream-100 px-2.5 py-1 rounded-md"
            >
              <span className="font-medium text-charcoal-700">{ref.guest_name}</span>
              <span className="text-charcoal-300">·</span>
              <span className="truncate max-w-[130px]">{ref.episode_title}</span>
            </span>
          ))}
          {concept.references.length > 3 && (
            <span className="text-xs text-charcoal-400 self-center">
              +{concept.references.length - 3} more
            </span>
          )}
        </div>
      )}
    </div>
  )

  if (previewMode) {
    return <div className={className}>{content}</div>
  }

  return (
    <Link
      href={`/${podcastSlug}/concepts/${concept.slug}`}
      className={className}
    >
      {content}
    </Link>
  )
}
