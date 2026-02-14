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

  // Extract unique guests with roles from references
  const guestRoleMap = new Map<string, string | undefined>()
  for (const ref of concept.references ?? []) {
    if (ref.guest_name && ref.guest_name !== 'Unknown guest' && !guestRoleMap.has(ref.guest_name)) {
      guestRoleMap.set(ref.guest_name, ref.guest_role)
    }
  }
  const uniqueGuests = Array.from(guestRoleMap.entries()).map(([name, role]) => ({ name, role }))
  const displayGuests = uniqueGuests.slice(0, 2)
  const extraGuestCount = uniqueGuests.length - displayGuests.length

  const content = (
    <div className="space-y-3">
      {/* Meta row: guest chips + bulb */}
      {(displayGuests.length > 0 || concept.valuable_count > 0 || previewMode) && (
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            {displayGuests.map((guest) => (
              <span
                key={guest.name}
                className="relative inline-flex items-center text-xs text-charcoal-600 bg-cream-100 px-2.5 py-1 rounded-md font-medium group/guest"
              >
                {guest.name}
                {guest.role && (
                  <span className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2.5 py-1.5 rounded-lg bg-charcoal-900 text-white text-[11px] font-normal whitespace-nowrap opacity-0 group-hover/guest:opacity-100 transition-opacity duration-150 z-10 shadow-lg">
                    {guest.role}
                    <span className="absolute top-full left-1/2 -translate-x-1/2 -mt-px border-4 border-transparent border-t-charcoal-900" />
                  </span>
                )}
              </span>
            ))}
            {extraGuestCount > 0 && (
              <span className="text-xs text-charcoal-400 flex-shrink-0">
                +{extraGuestCount} more
              </span>
            )}
            {previewMode && (
              <span className="text-xs text-accent-700">Preview</span>
            )}
          </div>

          {concept.valuable_count > 0 && (
            <span className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full bg-yellow-50 text-yellow-700 flex-shrink-0">
              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="url(#bulb-grad-ccard)" stroke="none">
                <defs><linearGradient id="bulb-grad-ccard" x1="0" y1="0" x2="0.5" y2="1"><stop offset="0%" stopColor="#facc15"/><stop offset="50%" stopColor="#f59e0b"/><stop offset="100%" stopColor="#ea580c"/></linearGradient></defs>
                <path d="M12 2a7 7 0 0 0-7 7c0 2.38 1.19 4.47 3 5.74V17a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1v-2.26c1.81-1.27 3-3.36 3-5.74a7 7 0 0 0-7-7zM9 21a1 1 0 0 0 1 1h4a1 1 0 0 0 1-1v-1H9v1z" />
              </svg>
              {concept.valuable_count}
            </span>
          )}
        </div>
      )}

      {/* Title */}
      <h3 className="text-xl font-serif font-semibold text-charcoal-900 group-hover:text-accent-600 transition-colors leading-snug">
        {concept.title}
      </h3>

      {/* Summary */}
      <p className="text-charcoal-600 line-clamp-2 leading-relaxed">
        {concept.summary || concept.body}
      </p>
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
