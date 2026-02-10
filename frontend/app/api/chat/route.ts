import { NextRequest, NextResponse } from 'next/server'
import { createHash } from 'crypto'

export async function POST(request: NextRequest) {
  try {
    const { message, podcastSlug } = await request.json()
    const normalizedMessage = typeof message === 'string' ? message.trim() : ''
    const normalizedPodcastSlug = typeof podcastSlug === 'string' ? podcastSlug.trim() : ''

    if (!normalizedMessage) {
      return NextResponse.json({ error: 'Message is required' }, { status: 400 })
    }
    if (!normalizedPodcastSlug) {
      return NextResponse.json({ error: 'podcastSlug is required' }, { status: 400 })
    }
    if (normalizedMessage.length > 500) {
      return NextResponse.json({ error: 'Message too long' }, { status: 400 })
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!supabaseUrl || !supabaseServiceRoleKey) {
      return NextResponse.json({ error: 'Server configuration missing' }, { status: 500 })
    }

    const functionUrl = `${supabaseUrl}/functions/v1/ai_chat`
    const ip =
      request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
      request.headers.get('x-real-ip') ??
      'unknown'
    const userAgent = request.headers.get('user-agent') ?? 'unknown'
    const userKey = createHash('sha256').update(`${ip}:${userAgent}`).digest('hex').slice(0, 32)

    const response = await fetch(functionUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${supabaseServiceRoleKey}`,
        apikey: supabaseServiceRoleKey,
        'x-user-key': userKey,
      },
      body: JSON.stringify({
        message: normalizedMessage,
        podcastSlug: normalizedPodcastSlug,
      }),
    })

    const data = await response.json().catch(() => ({}))
    if (!response.ok) {
      const errorMsg = typeof data?.error === 'string' ? data.error : 'Chat request failed'
      return NextResponse.json({ error: errorMsg }, { status: response.status })
    }

    return NextResponse.json(data)
  } catch (error) {
    console.error('Chat API Error:', error)
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}

