import { createServerSupabase } from '@/lib/supabase-server'

export type KnowledgeGraphNodeType = 'theme' | 'guest' | 'episode' | 'book'

export interface KnowledgeGraphNode {
  id: string
  type: KnowledgeGraphNodeType
  label: string
  slug?: string
  value?: number
  description?: string
}

export type KnowledgeGraphEdgeType = 'theme_guest' | 'theme_episode' | 'theme_book'

export interface KnowledgeGraphEdge {
  id: string
  source: string
  target: string
  type: KnowledgeGraphEdgeType
  weight: number
  samples?: string[]
}

export interface KnowledgeGraphData {
  podcastSlug: string
  podcastName: string
  nodes: KnowledgeGraphNode[]
  edges: KnowledgeGraphEdge[]
  meta: {
    themeCount: number
    guestCount: number
    episodeCount: number
    bookCount: number
  }
}

export async function getKnowledgeGraphForPodcast(
  podcastSlug: string
): Promise<KnowledgeGraphData | null> {
  const supabase = createServerSupabase()

  const { data: cacheRow, error } = await supabase
    .from('knowledge_graph_cache')
    .select('graph_data')
    .eq('podcast_slug', podcastSlug)
    .maybeSingle()

  if (error || !cacheRow?.graph_data) return null

  const graphData = cacheRow.graph_data as KnowledgeGraphData
  if (!graphData.nodes || !graphData.edges || !graphData.meta) return null

  return graphData
}

