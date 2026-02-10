import Link from 'next/link'
import { getConceptBySlug } from '@/lib/api/concepts'

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

  return (
    <article className="min-h-screen bg-cream-50">
      {/* Header */}
      <header className="border-b border-charcoal-200 bg-white sticky top-0 z-10">
        <div className="max-w-3xl mx-auto px-6 h-16 flex items-center justify-between">
          <Link 
            href={`/${podcastSlug}`}
            className="flex items-center gap-2 text-charcoal-500 hover:text-charcoal-900 transition-colors text-sm font-medium"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M19 12H5M12 19l-7-7 7-7"/>
            </svg>
            Back to Knowledge Base
          </Link>
        </div>
      </header>

      <div className="max-w-3xl mx-auto px-6 py-12 space-y-12">
        {/* Title Section */}
        <div className="space-y-6">
          <div className="flex items-center gap-3">
            <span className="chip-accent">Core Concept</span>
            <span className="text-sm text-charcoal-500">Last updated {new Date(concept.created_at).toLocaleDateString()}</span>
          </div>
          
          <h1 className="text-4xl md:text-5xl font-serif font-bold text-charcoal-900 leading-tight">
            {concept.title}
          </h1>
          
          <p className="text-xl text-charcoal-600 font-serif italic leading-relaxed border-l-4 border-accent-200 pl-6 py-2">
            {concept.summary}
          </p>
        </div>

        {/* Main Content */}
        <div className="prose-editorial">
          {/* Placeholder content until we have real markdown rendering */}
          <p>
            Product sense is often described as an innate talent, but the best operators treat it as a learned skill. 
            It starts with deconstructing the problem space before jumping to solutions.
          </p>
          
          <h3>The Trap of User Empathy</h3>
          <p>
            Many PMs believe that talking to users is enough. While necessary, user empathy alone does not equal product sense. 
            Users can tell you their problems, but they rarely know the optimal solution that balances business constraints, technical feasibility, and market dynamics.
          </p>

          <h3>Developing Intuition</h3>
          <p>
            Great product sense comes from a rigorous study of patterns. It involves looking at successful products and reverse-engineering the decisions that led to their success.
          </p>
        </div>

        {/* References Section */}
        <div className="border-t border-charcoal-200 pt-12 space-y-6">
          <h3 className="text-lg font-serif font-semibold text-charcoal-900">
            References & Sources
          </h3>
          <div className="grid gap-4 sm:grid-cols-2">
            {concept.references?.map((ref, idx) => (
              <div key={idx} className="p-4 rounded-lg bg-white border border-charcoal-200 space-y-2">
                <div className="font-medium text-charcoal-900">{ref.guest_name}</div>
                <div className="text-sm text-charcoal-600">{ref.episode_title}</div>
                {ref.timestamp && (
                  <div className="text-xs text-charcoal-400 font-mono">Timestamp: {ref.timestamp}</div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* CTA */}
        <div className="bg-charcoal-900 rounded-xl p-8 text-center space-y-4">
          <h3 className="text-xl font-serif font-semibold text-white">
            Have questions about this concept?
          </h3>
          <p className="text-charcoal-300 max-w-md mx-auto">
            Ask the collective wisdom of the podcast guests to go deeper into specific nuances.
          </p>
          <button className="btn-primary bg-white text-charcoal-900 hover:bg-charcoal-50 hover:text-charcoal-900 border-none">
            Ask the Collective
          </button>
        </div>
      </div>
    </article>
  )
}

