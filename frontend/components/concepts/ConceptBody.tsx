import React, { ReactNode } from 'react'

/**
 * Clean and render AI-generated concept body text.
 *
 * The AI produces bodies with:
 *   - Markdown headings: ## 1. Concept Overview
 *   - Inline citations: [Guest Name] explains at [00:35:02]: "quote..." - [https://...]
 *   - Raw URLs: [url=https://...], [https://...], - [url=https://...]
 *   - Numbered lists: 1) item  2) item
 *   - Bullet lists: * item
 *   - Back-references: - [7], - [2]
 *
 * This component strips all inline URLs/citations and renders proper
 * semantic HTML. All source references belong in the References & Sources
 * section (rendered separately from concept.references).
 */

/** Remove inline YouTube URLs, citation brackets, and trailing URL references */
function cleanLine(line: string): string {
  let cleaned = line

  // Remove trailing URL patterns: - [https://...] or - [url=https://...]
  cleaned = cleaned.replace(/\s*-\s*\[(?:url=)?https?:\/\/[^\]]*\]/g, '')

  // Remove standalone [url=https://...] patterns
  cleaned = cleaned.replace(/\[url=https?:\/\/[^\]]*\]/g, '')

  // Remove standalone [https://...] patterns
  cleaned = cleaned.replace(/\[https?:\/\/[^\]]*\]/g, '')

  // Remove bare https://... URLs that appear mid-text or at end
  cleaned = cleaned.replace(/\s*https?:\/\/\S+/g, '')

  // Clean up "at [HH:MM:SS]:" timestamp references — keep guest name, remove timestamp
  cleaned = cleaned.replace(/\s+at\s+\[\d{1,2}:\d{2}(?::\d{2})?\]\s*:?/g, '')

  // Remove [timestamp=HH:MM:SS] patterns
  cleaned = cleaned.replace(/\[timestamp=\d{1,2}:\d{2}(?::\d{2})?\]/g, '')

  // Remove just bare [HH:MM:SS] timestamps
  cleaned = cleaned.replace(/\[\d{1,2}:\d{2}(?::\d{2})?\]/g, '')

  // Remove ALL back-reference numbers like [7], [5], [2] (footnote-style) anywhere in text
  cleaned = cleaned.replace(/\s*-\s*\[\d+\]\s*/g, ' ')
  cleaned = cleaned.replace(/\[\d+\]/g, '')

  // Clean up [Guest Name] brackets — just show the name
  cleaned = cleaned.replace(/\[([A-Z][a-zA-Z\s.'-]+)\]/g, '$1')

  // Clean up double spaces, trailing dashes, etc.
  cleaned = cleaned.replace(/\s{2,}/g, ' ')
  cleaned = cleaned.replace(/\s*-\s*$/, '')
  cleaned = cleaned.replace(/\s*,\s*$/, '')

  return cleaned.trim()
}

/** Parse the concept body into structured blocks */
interface Block {
  type: 'heading' | 'paragraph' | 'quote' | 'bullet-list' | 'numbered-list'
  content: string
  items?: string[]
  level?: number // heading level
}

function parseBody(body: string): Block[] {
  // First strip the source references section entirely
  const stripped = body.replace(
    /\n*#{1,3}\s*(?:\d+\.\s*)?(?:Source\s+)?References?\b.*$/is,
    ''
  ).trim()

  const lines = stripped.split('\n')
  const blocks: Block[] = []
  let currentList: { type: 'bullet-list' | 'numbered-list'; items: string[] } | null = null

  function flushList() {
    if (currentList && currentList.items.length > 0) {
      blocks.push({
        type: currentList.type,
        content: '',
        items: currentList.items,
      })
      currentList = null
    }
  }

  for (const rawLine of lines) {
    const line = rawLine.trim()
    if (!line) {
      flushList()
      continue
    }

    // Markdown heading: ## 1. Title or ### Title
    const headingMatch = line.match(/^(#{1,4})\s*(?:\d+\.\s*)?(.+)$/)
    if (headingMatch) {
      flushList()
      const cleaned = cleanLine(headingMatch[2])
      if (cleaned) {
        blocks.push({
          type: 'heading',
          content: cleaned,
          level: headingMatch[1].length,
        })
      }
      continue
    }

    // Bullet list: * item or - item (but not "- [url=...")
    const bulletMatch = line.match(/^[*\-]\s+(.+)$/)
    if (bulletMatch && !line.match(/^-\s+\[(?:url=)?https?:/)) {
      const cleaned = cleanLine(bulletMatch[1])
      if (cleaned) {
        if (!currentList || currentList.type !== 'bullet-list') {
          flushList()
          currentList = { type: 'bullet-list', items: [] }
        }
        currentList.items.push(cleaned)
      }
      continue
    }

    // Numbered list: 1) item or 1. item (at start of line, not section headings)
    const numberedMatch = line.match(/^\d+[.)]\s+(.+)$/)
    if (numberedMatch && !line.match(/^\d+\.\s+[A-Z][a-z]+\s+(Overview|Why|How|Real|Common|Advanced|Key|Takeaway)/)) {
      const cleaned = cleanLine(numberedMatch[1])
      if (cleaned) {
        if (!currentList || currentList.type !== 'numbered-list') {
          flushList()
          currentList = { type: 'numbered-list', items: [] }
        }
        currentList.items.push(cleaned)
      }
      continue
    }

    // Regular paragraph
    flushList()
    const cleaned = cleanLine(line)
    if (cleaned && cleaned.length > 3) {
      // Check if it's a quote (starts with a quote mark after cleaning)
      if (cleaned.startsWith('"') || cleaned.startsWith('\u201c')) {
        blocks.push({ type: 'quote', content: cleaned })
      } else {
        blocks.push({ type: 'paragraph', content: cleaned })
      }
    }
  }

  flushList()
  return blocks
}

/**
 * Render inline markdown: **bold**, *italic*, `code`, and preserve emoji.
 * Returns an array of ReactNodes (strings + JSX elements).
 */
function renderInline(text: string): ReactNode[] {
  const nodes: ReactNode[] = []
  // Match **bold**, *italic*, `code` — in that order so ** is matched before *
  const inlineRegex = /(\*\*(.+?)\*\*|\*(.+?)\*|`(.+?)`)/g
  let lastIndex = 0
  let match: RegExpExecArray | null

  while ((match = inlineRegex.exec(text)) !== null) {
    // Push preceding plain text
    if (match.index > lastIndex) {
      nodes.push(text.slice(lastIndex, match.index))
    }

    if (match[2] != null) {
      // **bold**
      nodes.push(<strong key={match.index} className="font-semibold text-charcoal-900">{match[2]}</strong>)
    } else if (match[3] != null) {
      // *italic*
      nodes.push(<em key={match.index}>{match[3]}</em>)
    } else if (match[4] != null) {
      // `code`
      nodes.push(<code key={match.index} className="text-xs bg-charcoal-100 rounded px-1 py-0.5 font-mono">{match[4]}</code>)
    }

    lastIndex = match.index + match[0].length
  }

  // Remaining plain text
  if (lastIndex < text.length) {
    nodes.push(text.slice(lastIndex))
  }

  return nodes.length > 0 ? nodes : [text]
}

interface ConceptBodyProps {
  body: string
}

export default function ConceptBody({ body }: ConceptBodyProps) {
  const blocks = parseBody(body)

  return (
    <div className="space-y-4">
      {blocks.map((block, idx) => {
        switch (block.type) {
          case 'heading':
            return (
              <h3
                key={idx}
                className="text-base md:text-lg font-semibold text-charcoal-900 pt-4 first:pt-0"
              >
                {renderInline(block.content)}
              </h3>
            )

          case 'paragraph':
            return (
              <p
                key={idx}
                className="text-sm md:text-base text-charcoal-700 leading-relaxed"
              >
                {renderInline(block.content)}
              </p>
            )

          case 'quote':
            return (
              <blockquote
                key={idx}
                className="text-sm md:text-base text-charcoal-600 italic leading-relaxed pl-4 border-l-2 border-charcoal-200"
              >
                {renderInline(block.content)}
              </blockquote>
            )

          case 'bullet-list':
            return (
              <ul key={idx} className="space-y-1.5 pl-5">
                {block.items?.map((item, i) => (
                  <li
                    key={i}
                    className="text-sm md:text-base text-charcoal-700 leading-relaxed list-disc"
                  >
                    {renderInline(item)}
                  </li>
                ))}
              </ul>
            )

          case 'numbered-list':
            return (
              <ol key={idx} className="space-y-1.5 pl-5">
                {block.items?.map((item, i) => (
                  <li
                    key={i}
                    className="text-sm md:text-base text-charcoal-700 leading-relaxed list-decimal"
                  >
                    {renderInline(item)}
                  </li>
                ))}
              </ol>
            )

          default:
            return null
        }
      })}
    </div>
  )
}
