import Link from 'next/link'
import Header from '@/components/Header'
import KnowledgeGraphView from '@/components/KnowledgeGraphView'
import { getKnowledgeGraphForPodcast } from '@/lib/api/knowledge-graph'

export const revalidate = 300

export default async function PodcastKnowledgeGraphPage({
  params,
  searchParams,
}: {
  params: { 'podcast-slug': string }
  searchParams?: { [key: string]: string | string[] | undefined }
}) {
  const podcastSlug = params['podcast-slug']
  const graph = await getKnowledgeGraphForPodcast(podcastSlug)
  const tabParamRaw = searchParams?.tab
  const tabParam = Array.isArray(tabParamRaw) ? tabParamRaw[0] : tabParamRaw
  const backHref = tabParam ? `/${podcastSlug}?tab=${encodeURIComponent(tabParam)}` : `/${podcastSlug}`

  if (!graph) {
    return (
      <div className="min-h-screen bg-cream-50">
        <Header />
        <div className="max-w-5xl mx-auto px-4 md:px-6 py-10">
          <p className="text-charcoal-500">Theme graph is not available for this podcast.</p>
          <Link href={backHref} className="text-accent-700 hover:underline text-sm">
            Back to podcast page
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-cream-50">
      <Header />
      <main className="max-w-6xl mx-auto px-4 md:px-6 py-5 space-y-4">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-wider text-charcoal-500">Multidimensional Theme Graph</p>
            <h1 className="text-2xl font-serif font-semibold text-charcoal-900">
              {graph.podcastName}
            </h1>
          </div>
          <Link
            href={backHref}
            className="px-3 py-2 text-sm rounded-lg border border-charcoal-200 text-charcoal-700 hover:bg-white transition-colors"
          >
            Back to Base
          </Link>
        </div>

        <KnowledgeGraphView data={graph} />
      </main>
    </div>
  )
}

