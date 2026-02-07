import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://rhzpjvuutpjtdsbnskdy.supabase.co'
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || ''
const supabaseKey = supabaseServiceKey || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''

const supabase = createClient(supabaseUrl, supabaseKey)

export async function POST(
  request: NextRequest,
  { params }: { params: { 'panel-slug': string } }
) {
  try {
    const panelSlug = params['panel-slug']
    const body = await request.json()
    const { question, mentionedExpertIds } = body

    if (!question || typeof question !== 'string') {
      return NextResponse.json(
        { error: 'Question is required' },
        { status: 400 }
      )
    }

    // Get user from auth header
    const authHeader = request.headers.get('authorization')
    if (!authHeader) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    const token = authHeader.replace('Bearer ', '')
    const { data: { user }, error: authError } = await supabase.auth.getUser(token)
    
    if (authError || !user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    // TODO: Replace with actual RAG system integration
    // This is a placeholder that returns mock responses
    // In production, this would:
    // 1. Embed the question
    // 2. Search vector database for relevant chunks
    // 3. Filter by mentionedExpertIds if provided
    // 4. Generate responses using LLM
    // 5. Return structured responses with citations

    const startTime = Date.now()

    // Mock response generation (replace with actual RAG)
    const mockResponses = generateMockResponses(panelSlug, question, mentionedExpertIds)
    const responseTime = (Date.now() - startTime) / 1000

    // Save question to database
    const { data: questionData, error: questionError } = await supabase
      .from('user_questions')
      .insert({
        panel_id: panelSlug,
        question_text: question,
        mentioned_expert_ids: mentionedExpertIds,
        user_id: user.id,
        response_time: responseTime,
        asked_at: new Date().toISOString(),
      })
      .select()
      .single()

    if (questionError) {
      console.error('Error saving question:', questionError)
      // Continue even if save fails
    }

    // Check for consensus
    const consensus = mockResponses.length >= 2 
      ? {
          summary: 'The panel generally agrees that focusing on product-market fit before growth is crucial for long-term success.',
          agreeingExpertIds: mockResponses.map(r => r.expertId),
        }
      : null

    return NextResponse.json({
      responses: mockResponses,
      consensus,
    })
  } catch (error: any) {
    console.error('Error in ask endpoint:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

// Mock response generator - replace with actual RAG system
function generateMockResponses(
  panelSlug: string,
  question: string,
  mentionedExpertIds: string[] | null
): any[] {
  // This is placeholder logic - replace with actual RAG
  const allExperts = [
    {
      id: 'brian-chesky',
      name: 'Brian Chesky',
      title: 'Co-founder & CEO',
      company: 'Airbnb',
    },
    {
      id: 'andrew-chen',
      name: 'Andrew Chen',
      title: 'GP',
      company: 'Andreessen Horowitz',
    },
    {
      id: 'elena-verna',
      name: 'Elena Verna',
      title: 'Growth Advisor',
      company: 'ex-Amplitude',
    },
  ]

  const expertsToRespond = mentionedExpertIds
    ? allExperts.filter(e => mentionedExpertIds.includes(e.id))
    : allExperts

  return expertsToRespond.map((expert, idx) => ({
    id: `response-${idx}`,
    questionId: 'temp',
    expertId: expert.id,
    expertName: expert.name,
    expertTitle: expert.title,
    expertCompany: expert.company,
    responseText: `Based on my experience at ${expert.company}, I believe that ${question.toLowerCase()} requires a thoughtful approach. The key is to focus on creating genuine value for users before scaling. This means understanding your core value proposition deeply and ensuring product-market fit before investing heavily in growth channels.`,
    sourceChunks: [`chunk-${idx}-1`, `chunk-${idx}-2`],
    episodeReferences: [
      {
        episodeId: `ep-${idx}`,
        episodeTitle: 'Growth Strategies',
        episodeNumber: 42 + idx,
        timestamp: `${10 + idx}:${30 + idx}`,
      },
    ],
    confidence: 0.85,
  }))
}

