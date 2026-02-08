import { NextRequest, NextResponse } from 'next/server'
import { generateGuestResponse } from '@/lib/rag-engine'

interface SplitChatRequest {
  query: string
  guest_id: string
  original_query?: string
  previous_response?: string
  user_context?: {
    role?: string
    company?: string
    interests?: string
    goals?: string
  }
}

export async function POST(request: NextRequest) {
  try {
    const body: SplitChatRequest = await request.json()
    const { query, guest_id, original_query, previous_response, user_context } = body

    if (!query || !guest_id) {
      return NextResponse.json(
        { error: 'Query and guest_id are required' },
        { status: 400 }
      )
    }

    // Build context-aware query
    let contextQuery = query

    // Add conversation context if available
    if (original_query && previous_response) {
      contextQuery = `Original question: ${original_query}\n\nPrevious response: ${previous_response}\n\nFollow-up: ${query}`
    }

    // Add user context if available
    if (user_context) {
      const contextParts: string[] = []
      if (user_context.role) contextParts.push(`Role: ${user_context.role}`)
      if (user_context.company) contextParts.push(`Company: ${user_context.company}`)
      if (user_context.interests) contextParts.push(`Interests: ${user_context.interests}`)
      if (user_context.goals) contextParts.push(`Goals: ${user_context.goals}`)

      if (contextParts.length > 0) {
        contextQuery = `User context: ${contextParts.join(', ')}. ${contextQuery}`
      }
    }

    // Get guest name (we'll need to fetch this from the database)
    // For now, we'll extract it from guest_id or fetch from Supabase
    const guestName = await getGuestName(guest_id)

    // Generate response
    const response = await generateGuestResponse(contextQuery, guest_id, guestName, undefined, 5)

    return NextResponse.json({
      guest_id: response.guest_id,
      guest_name: response.guest_name,
      response: response.response_text,
      confidence: response.confidence,
      source_chunks: response.source_chunks,
    })
  } catch (error: any) {
    console.error('Error in split-chat API:', error)
    return NextResponse.json(
      {
        error: 'Internal server error',
        details: error.message,
      },
      { status: 500 }
    )
  }
}

/**
 * Get guest name from database
 */
async function getGuestName(guestId: string): Promise<string> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const supabaseServiceKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

  const { createClient } = await import('@supabase/supabase-js')
  const supabase = createClient(supabaseUrl, supabaseServiceKey)

  // Try to get from episodes first
  const { data: episode } = await supabase
    .from('episodes')
    .select('guest_name')
    .eq('guest_id', guestId)
    .limit(1)
    .single()

  if (episode?.guest_name) {
    return episode.guest_name
  }

  // Fallback: format guest_id as name
  return guestId.replace('guest-', '').replace(/-/g, ' ')
}
