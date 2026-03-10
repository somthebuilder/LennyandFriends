'use client'

import dynamic from 'next/dynamic'
import { useMemo, useState } from 'react'
import type { KnowledgeGraphData } from '@/lib/api/knowledge-graph'

interface KnowledgeGraphViewProps {
  data: KnowledgeGraphData
}

const ForceGraph2D = dynamic(
  () => import('react-force-graph-2d').then((mod) => mod.default),
  { ssr: false }
)

const NODE_COLORS = {
  theme: '#22c55e',
  guest: '#60a5fa',
  episode: '#c084fc',
  book: '#f59e0b',
}

const DIMENSIONS: Array<{ key: keyof typeof NODE_COLORS; label: string }> = [
  { key: 'theme', label: 'Themes' },
  { key: 'guest', label: 'Guests' },
  { key: 'episode', label: 'Episodes' },
  { key: 'book', label: 'Books' },
]

function shortLabel(input: string) {
  if (input.length <= 42) return input
  return `${input.slice(0, 39)}...`
}

export default function KnowledgeGraphView({ data }: KnowledgeGraphViewProps) {
  const [enabledTypes, setEnabledTypes] = useState<Set<keyof typeof NODE_COLORS>>(
    () => new Set(DIMENSIONS.map((d) => d.key))
  )
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null)
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null)

  function toggleType(type: keyof typeof NODE_COLORS) {
    setEnabledTypes((prev) => {
      const next = new Set(prev)
      if (next.has(type)) {
        if (next.size === 1) return next
        next.delete(type)
      } else {
        next.add(type)
      }
      return next
    })
  }

  const graphData = useMemo(() => {
    const visibleNodes = data.nodes.filter(
      (node) => enabledTypes.has(node.type as keyof typeof NODE_COLORS)
    )
    const visibleIds = new Set(visibleNodes.map((node) => node.id))
    const visibleEdges = data.edges.filter(
      (edge) => visibleIds.has(edge.source) && visibleIds.has(edge.target)
    )

    return {
      nodes: visibleNodes.map((n) => ({ ...n })),
      links: visibleEdges.map((e) => ({
        ...e,
        source: e.source,
        target: e.target,
      })),
    }
  }, [data.edges, data.nodes, enabledTypes])

  const selectedNode = useMemo(
    () => data.nodes.find((n) => n.id === selectedNodeId) ?? null,
    [data.nodes, selectedNodeId]
  )
  const hoveredNode = useMemo(
    () => data.nodes.find((n) => n.id === hoveredNodeId) ?? null,
    [data.nodes, hoveredNodeId]
  )
  const selectedLinks = useMemo(() => {
    if (!selectedNodeId) return []
    return data.edges.filter(
      (edge) => edge.source === selectedNodeId || edge.target === selectedNodeId
    )
  }, [data.edges, selectedNodeId])
  const selectedNeighborIds = useMemo(() => {
    const ids = new Set<string>()
    for (const edge of selectedLinks) {
      ids.add(edge.source === selectedNodeId ? edge.target : edge.source)
    }
    return ids
  }, [selectedLinks, selectedNodeId])
  const selectedNeighbors = useMemo(
    () => data.nodes.filter((n) => selectedNeighborIds.has(n.id)),
    [data.nodes, selectedNeighborIds]
  )

  function toShortLabel(label: string) {
    const words = label
      .split(/\s+/)
      .map((w) => w.trim())
      .filter(Boolean)
    if (words.length === 0) return '?'
    if (words.length === 1) return words[0].slice(0, 3).toUpperCase()
    return words
      .slice(0, 3)
      .map((w) => w[0]?.toUpperCase() ?? '')
      .join('')
  }

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-charcoal-200 bg-white p-4">
        <div className="flex flex-wrap gap-2 text-xs mb-3">
          <span className="px-2 py-1 rounded-full bg-charcoal-100 text-charcoal-700">Links: {data.edges.length}</span>
          <span className="px-2 py-1 rounded-full bg-emerald-50 text-emerald-700">Themes: {data.meta.themeCount}</span>
          <span className="px-2 py-1 rounded-full bg-sky-50 text-sky-700">Guests: {data.meta.guestCount}</span>
          <span className="px-2 py-1 rounded-full bg-violet-50 text-violet-700">Episodes: {data.meta.episodeCount}</span>
          <span className="px-2 py-1 rounded-full bg-amber-50 text-amber-700">Books: {data.meta.bookCount}</span>
        </div>
        <div className="flex flex-wrap gap-2 mb-1">
          {DIMENSIONS.map((dimension) => {
            const active = enabledTypes.has(dimension.key)
            return (
              <button
                key={dimension.key}
                onClick={() => toggleType(dimension.key)}
                className={`px-2.5 py-1 rounded-full text-xs border transition-colors ${
                  active
                    ? 'bg-charcoal-900 text-white border-charcoal-900'
                    : 'bg-white text-charcoal-500 border-charcoal-200 hover:border-charcoal-300'
                }`}
              >
                {dimension.label}
              </button>
            )
          })}
        </div>
        <p className="text-[11px] text-charcoal-500 mt-2">
          Click a node to inspect relationships and evidence quotes.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-4">
        <div className="h-[72vh] min-h-[560px] rounded-xl border border-charcoal-800 bg-[#07122b] overflow-hidden">
          <ForceGraph2D
            graphData={graphData}
            nodeAutoColorBy="type"
            linkDirectionalParticles={1}
            linkDirectionalParticleSpeed={(link) => 0.0015 + ((link as { weight?: number }).weight ?? 1) * 0.00035}
            linkWidth={(link) => Math.min(3.5, 0.8 + ((link as { weight?: number }).weight ?? 1) * 0.3)}
            linkColor={() => 'rgba(148, 163, 184, 0.7)'}
            nodeCanvasObject={(node, ctx, globalScale) => {
              const n = node as {
                id: string
                label: string
                type: keyof typeof NODE_COLORS
                x?: number
                y?: number
              }
              if (typeof n.x !== 'number' || typeof n.y !== 'number') return
              const short = toShortLabel(n.label)
              const radius = n.type === 'theme' ? 10 : 8
              const fontSize = Math.max(6, 10 / globalScale)
              ctx.beginPath()
              ctx.arc(n.x, n.y, radius, 0, 2 * Math.PI, false)
              ctx.fillStyle = NODE_COLORS[n.type]
              ctx.fill()
              ctx.lineWidth = selectedNodeId === n.id ? 2.5 : hoveredNodeId === n.id ? 2 : 1
              ctx.strokeStyle = selectedNodeId === n.id ? '#f8fafc' : 'rgba(255,255,255,0.4)'
              ctx.stroke()

              // Draw compact short-form by default to reduce clutter.
              ctx.font = `700 ${fontSize}px Inter, sans-serif`
              ctx.fillStyle = '#e2e8f0'
              ctx.textAlign = 'center'
              ctx.textBaseline = 'middle'
              ctx.fillText(short, n.x, n.y)

              // Full label only on hover.
              if (hoveredNodeId === n.id) {
                const full = shortLabel(n.label)
                const labelFontSize = Math.max(8, 11 / globalScale)
                ctx.font = `600 ${labelFontSize}px Inter, sans-serif`
                const textWidth = ctx.measureText(full).width
                const padX = 8
                const padY = 5
                const boxW = textWidth + padX * 2
                const boxH = labelFontSize + padY * 2
                const boxX = n.x + radius + 10
                const boxY = n.y - boxH / 2
                ctx.fillStyle = 'rgba(2, 6, 23, 0.88)'
                ctx.fillRect(boxX, boxY, boxW, boxH)
                ctx.fillStyle = '#f8fafc'
                ctx.textAlign = 'left'
                ctx.textBaseline = 'middle'
                ctx.fillText(full, boxX + padX, n.y)
              }
            }}
            onNodeClick={(node) => setSelectedNodeId(node.id != null ? String(node.id) : null)}
            onNodeHover={(node) => setHoveredNodeId(node?.id != null ? String(node.id) : null)}
            cooldownTicks={120}
            d3VelocityDecay={0.22}
            d3AlphaDecay={0.018}
          />
        </div>

        <aside className="rounded-xl border border-charcoal-200 bg-white p-4 overflow-y-auto max-h-[72vh]">
          {selectedNode ? (
            <div className="space-y-4">
              <div>
                <p className="text-xs uppercase tracking-wide text-charcoal-500">{selectedNode.type}</p>
                <h3 className="text-xl font-serif font-semibold text-charcoal-900">{selectedNode.label}</h3>
                {selectedNode.description && (
                  <p className="text-sm text-charcoal-600 mt-2">{selectedNode.description}</p>
                )}
              </div>

              <div className="border-t border-charcoal-200 pt-3">
                <p className="text-xs uppercase tracking-wide text-charcoal-500 mb-2">
                  Connections ({selectedLinks.length})
                </p>
                <div className="flex flex-wrap gap-2">
                  {DIMENSIONS.map((dim) => {
                    const count = selectedNeighbors.filter((n) => n.type === dim.key).length
                    if (!count) return null
                    return (
                      <span key={dim.key} className="px-2 py-1 rounded-full text-xs bg-charcoal-100 text-charcoal-700">
                        {count} {dim.label}
                      </span>
                    )
                  })}
                </div>
              </div>

              {selectedNeighbors.length > 0 && (
                <div className="border-t border-charcoal-200 pt-3">
                  <p className="text-xs uppercase tracking-wide text-charcoal-500 mb-2">Related Nodes</p>
                  <ul className="space-y-1.5">
                    {selectedNeighbors.slice(0, 10).map((node) => (
                      <li key={node.id} className="text-sm text-charcoal-700">
                        <button
                          onClick={() => setSelectedNodeId(node.id)}
                          className="hover:text-accent-700 transition-colors text-left"
                        >
                          {node.label}
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {selectedLinks.some((l) => l.samples && l.samples.length > 0) && (
                <div className="border-t border-charcoal-200 pt-3">
                  <p className="text-xs uppercase tracking-wide text-charcoal-500 mb-2">What They Said</p>
                  <ul className="space-y-2">
                    {selectedLinks
                      .flatMap((l) => l.samples ?? [])
                      .filter(Boolean)
                      .slice(0, 5)
                      .map((sample, index) => (
                        <li key={index} className="text-sm text-charcoal-600 italic">
                          "{shortLabel(sample)}"
                        </li>
                      ))}
                  </ul>
                </div>
              )}
            </div>
          ) : (
            <div className="text-sm text-charcoal-500">
              Hover a node to see full name. Click to inspect relationships, linked entities, and evidence.
            </div>
          )}
        </aside>
      </div>
    </div>
  )
}

