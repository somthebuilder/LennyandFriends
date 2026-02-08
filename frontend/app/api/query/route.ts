import { NextRequest, NextResponse } from 'next/server'
import { matchThemes, checkAmbiguity, selectGuests } from '@/lib/intelligence'
import { generateBatchResponses } from '@/lib/rag-engine'
import { generateClarificationQuestions } from '@/lib/lenny-moderator'

interface UserContext {
  role?: string
  company?: string
  interests?: string
  goals?: string
}

interface QueryRequest {
  query: string
  user_name?: string
  user_context?: UserContext
  clarification?: string
}

interface QueryResponse {
  needs_clarification: boolean
  clarification_questions?: string[]
  active_themes?: Array<{ theme_id: string; score: number }>
  guest_responses?: Array<{
    guest_id: string
    guest_name: string
    response: string
    confidence: number
    source_chunks: string[]
  }>
}

export async function POST(request: NextRequest) {
  try {
    const body: QueryRequest = await request.json()
    const { query, user_context, clarification } = body

    if (!query) {
      return NextResponse.json({ error: 'Query is required' }, { status: 400 })
    }

    // Build context-aware query
    let contextualQuery = query
    if (user_context) {
      const contextParts: string[] = []
      if (user_context.role) contextParts.push(`Role: ${user_context.role}`)
      if (user_context.company) contextParts.push(`Company: ${user_context.company}`)
      if (user_context.interests) contextParts.push(`Interests: ${user_context.interests}`)
      if (user_context.goals) contextParts.push(`Goals: ${user_context.goals}`)

      if (contextParts.length > 0) {
        contextualQuery = `User context: ${contextParts.join(', ')}. ${query}`
      }
    }

    // If this is a clarification response, combine with original query
    if (clarification) {
      contextualQuery = `${query} ${clarification}`
    }

    // Step 1: Match themes (intent detection)
    const activeThemes = await matchThemes(contextualQuery, 5, 0.3)

    // Step 2: Check ambiguity
    const { isAmbiguous, reason } = checkAmbiguity(activeThemes)

    if (isAmbiguous) {
      // Generate clarification questions
      const userContextStr = user_context
        ? [
            user_context.role && `Role: ${user_context.role}`,
            user_context.company && `Company: ${user_context.company}`,
          ]
            .filter(Boolean)
            .join(', ')
        : undefined

      const questions = await generateClarificationQuestions(
        query,
        activeThemes,
        reason || 'Query is ambiguous',
        userContextStr
      )

      return NextResponse.json({
        needs_clarification: true,
        clarification_questions: questions,
        active_themes: activeThemes.map(t => ({
          theme_id: t.theme_id,
          score: t.score,
        })),
      } as QueryResponse)
    }

    // Step 3: Select guests
    const guestScores = await selectGuests(activeThemes, 10)

    // Step 4: Generate responses
    const guestConfigs = guestScores.map(gs => ({
      guest_id: gs.guest_id,
      guest_name: gs.guest_name,
    }))

    const themeIds = activeThemes.map(t => t.theme_id)
    const responses = await generateBatchResponses(
      contextualQuery,
      guestConfigs,
      themeIds
    )

    // Format responses
    const guestResponses = responses.map(r => ({
      guest_id: r.guest_id,
      guest_name: r.guest_name,
      response: r.response_text,
      confidence: r.confidence,
      source_chunks: r.source_chunks,
    }))

    return NextResponse.json({
      needs_clarification: false,
      guest_responses: guestResponses,
      active_themes: activeThemes.map(t => ({
        theme_id: t.theme_id,
        score: t.score,
      })),
    } as QueryResponse)
  } catch (error: any) {
    console.error('Error in query API:', error)
    return NextResponse.json(
      {
        error: 'Internal server error',
        details: error.message,
      },
      { status: 500 }
    )
  }
}
