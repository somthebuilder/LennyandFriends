/**
 * Extract inline citation references from AI-generated concept body text.
 *
 * The AI embeds citations like:
 *   [Guest Name] explains at [00:35:02]: "quote..." - [https://www.youtube.com/watch?v=xxx&t=2102]
 *   As [Guest Name] notes at [00:16:33]: "quote..." - [url=https://www.youtube.com/watch?v=xxx&t=993]
 *   [Guest Name] at [00:40:25]: "quote" - [url=https://...]
 *
 * This function extracts guest name, timestamp (as seconds), YouTube URL,
 * and the quoted text from these inline patterns.
 */

export interface ExtractedReference {
  guest_name: string
  episode_url: string
  time_seconds?: number
  timestamp?: string
  quote?: string
}

/** Parse HH:MM:SS or MM:SS into total seconds */
function parseTimestamp(ts: string): number | undefined {
  const parts = ts.split(':').map(Number)
  if (parts.some(isNaN)) return undefined
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2]
  if (parts.length === 2) return parts[0] * 60 + parts[1]
  return undefined
}

export function extractBodyReferences(body: string): ExtractedReference[] {
  const refs: ExtractedReference[] = []
  const seen = new Set<string>() // dedup by guest_name + url base

  // Pattern 1: [Guest Name] ... at [HH:MM:SS]: "quote" - [url=URL] or [URL]
  // Pattern 2: [Guest Name] ... at [HH:MM:SS]: "quote" - URL
  // Pattern 3: [Guest Name] at [HH:MM:SS]: "quote" - [url=URL]
  const citationPattern =
    /\[([A-Z][a-zA-Z\s.'-]+)\][^[]*?(?:at\s+)?\[(\d{1,2}:\d{2}(?::\d{2})?)\][^"]*?"([^"]*?)"[^[]*?(?:-\s*)?(?:\[(?:url=)?(https?:\/\/[^\]\s]+)\]|(https?:\/\/\S+))/g

  let match
  while ((match = citationPattern.exec(body)) !== null) {
    const guestName = match[1].trim()
    const timestamp = match[2]
    const quote = match[3].trim()
    const url = (match[4] || match[5] || '').replace(/\]$/, '').trim()

    if (!guestName || !url) continue

    // Clean URL - remove trailing brackets/punctuation
    const cleanUrl = url.replace(/[\]\).,;]+$/, '')

    const dedup = `${guestName}::${cleanUrl.replace(/[&?]t=\d+/, '')}`
    if (seen.has(dedup)) continue
    seen.add(dedup)

    refs.push({
      guest_name: guestName,
      episode_url: cleanUrl,
      time_seconds: parseTimestamp(timestamp),
      timestamp,
      quote: quote.length > 10 ? quote : undefined,
    })
  }

  // Pattern for citations without quotes:
  // [Guest Name] at [HH:MM:SS] - [url=URL] or [URL]
  const noQuotePattern =
    /\[([A-Z][a-zA-Z\s.'-]+)\]\s*(?:\w+\s+)?at\s+\[(\d{1,2}:\d{2}(?::\d{2})?)\][^[\n]*?(?:-\s*)?(?:\[(?:url=)?(https?:\/\/[^\]\s]+)\]|(https?:\/\/\S+))/g

  while ((match = noQuotePattern.exec(body)) !== null) {
    const guestName = match[1].trim()
    const timestamp = match[2]
    const url = (match[3] || match[4] || '').replace(/\]$/, '').trim()

    if (!guestName || !url) continue

    const cleanUrl = url.replace(/[\]\).,;]+$/, '')
    const dedup = `${guestName}::${cleanUrl.replace(/[&?]t=\d+/, '')}`
    if (seen.has(dedup)) continue
    seen.add(dedup)

    refs.push({
      guest_name: guestName,
      episode_url: cleanUrl,
      time_seconds: parseTimestamp(timestamp),
      timestamp,
    })
  }

  // Pattern for Source References section (## 9. Source References)
  // 1. Guest Name - Episode Title - HH:MM:SS - [URL]
  const sourceRefPattern =
    /^\d+\.\s*([A-Z][a-zA-Z\s.'-]+?)\s*-\s*(.+?)\s*-\s*(\d{1,2}:\d{2}(?::\d{2})?)\s*-\s*\[?(https?:\/\/[^\]\s]+)\]?/gm

  while ((match = sourceRefPattern.exec(body)) !== null) {
    const guestName = match[1].trim()
    const episodeTitle = match[2].trim()
    const timestamp = match[3]
    const url = match[4].replace(/[\]\).,;]+$/, '').trim()

    if (!guestName || !url) continue

    const dedup = `${guestName}::${url.replace(/[&?]t=\d+/, '')}`
    if (seen.has(dedup)) continue
    seen.add(dedup)

    refs.push({
      guest_name: guestName,
      episode_url: url,
      time_seconds: parseTimestamp(timestamp),
      timestamp,
    })
  }

  return refs
}

/**
 * Merge extracted body references with database references.
 * Database refs take priority (they have episode titles).
 * Body-only refs are appended.
 */
export function mergeReferences(
  dbRefs: Array<{
    guest_name: string
    episode_title: string
    episode_url?: string
    timestamp?: string
    time_seconds?: number
    quote?: string
  }>,
  bodyRefs: ExtractedReference[]
): Array<{
  guest_name: string
  episode_title: string
  episode_url?: string
  timestamp?: string
  time_seconds?: number
  quote?: string
}> {
  // Build a set of existing DB references for dedup
  const existingKeys = new Set(
    dbRefs.map((r) => {
      const baseUrl = (r.episode_url || '').replace(/[&?]t=\d+/, '')
      return `${r.guest_name}::${baseUrl}`
    })
  )

  const merged = [...dbRefs]

  for (const bodyRef of bodyRefs) {
    const baseUrl = bodyRef.episode_url.replace(/[&?]t=\d+/, '')
    const key = `${bodyRef.guest_name}::${baseUrl}`

    if (existingKeys.has(key)) continue
    existingKeys.add(key)

    // Try to extract episode title from URL path or use a generic label
    let episodeTitle = 'Episode clip'
    // YouTube URLs sometimes have the video title in the page, but we can't access that
    // We'll use the guest name as context
    if (bodyRef.episode_url.includes('youtube.com') || bodyRef.episode_url.includes('youtu.be')) {
      episodeTitle = `${bodyRef.guest_name} — Episode clip`
    }

    merged.push({
      guest_name: bodyRef.guest_name,
      episode_title: episodeTitle,
      episode_url: bodyRef.episode_url,
      timestamp: bodyRef.timestamp,
      time_seconds: bodyRef.time_seconds,
      quote: bodyRef.quote,
    })
  }

  return merged
}
