import { NextRequest, NextResponse } from 'next/server'

/*
 * Workaround for corporate proxies / firewalls that re-sign TLS traffic
 * with a custom CA certificate.  Node.js (v22) does not use the system
 * certificate store by default, so outbound HTTPS fetches to Supabase
 * fail with UNABLE_TO_GET_ISSUER_CERT_LOCALLY.
 *
 * This disables certificate verification **only** for the Node.js process
 * running this route handler.  Safe for development; for production deploy
 * behind a reverse proxy (Vercel / Cloudflare) that handles TLS correctly.
 */
if (process.env.NODE_ENV !== 'production') {
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'
}

/** Web Crypto-based SHA-256 (works in Node.js 18+ and Edge runtime) */
async function sha256Hex(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value)
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

export async function POST(request: NextRequest) {
  // ── Step 1: Parse body ──────────────────────────────────────────
  let body: { message?: unknown; podcastSlug?: unknown; conversationHistory?: unknown; sessionId?: unknown; deviceId?: unknown; quizMode?: unknown }
  try {
    body = await request.json()
  } catch (parseErr) {
    console.error('[chat/route] JSON parse error:', parseErr)
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  const normalizedPodcastSlug =
    typeof body.podcastSlug === 'string' ? body.podcastSlug.trim() : ''
  const isQuizMode = body.quizMode && typeof body.quizMode === 'object'

  // Quiz mode only requires podcastSlug + quizMode payload; normal chat requires message
  const normalizedMessage =
    typeof body.message === 'string' ? body.message.trim() : ''

  if (!isQuizMode && !normalizedMessage) {
    return NextResponse.json({ error: 'Message is required' }, { status: 400 })
  }
  if (!normalizedPodcastSlug) {
    return NextResponse.json(
      { error: 'podcastSlug is required' },
      { status: 400 }
    )
  }
  if (!isQuizMode && normalizedMessage.length > 500) {
    return NextResponse.json({ error: 'Message too long' }, { status: 400 })
  }

  // ── Step 2: Resolve config ─────────────────────────────────────
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const supabaseServiceRoleKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

    if (!supabaseUrl || !supabaseServiceRoleKey) {
    console.error('[chat/route] Missing supabaseUrl or key')
    return NextResponse.json(
      { error: 'Server configuration missing' },
      { status: 500 }
    )
    }

  // ── Step 3: Build user key (hashed IP+UA) + extract deviceId ──
  let userKey = 'anon'
  const deviceId = typeof body.deviceId === 'string' ? body.deviceId.trim().slice(0, 64) : ''
  try {
    const ip =
      request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
      request.headers.get('x-real-ip') ??
      'unknown'
    const userAgent = request.headers.get('user-agent') ?? 'unknown'
    const hash = await sha256Hex(`${ip}:${userAgent}`)
    userKey = hash.slice(0, 32)
  } catch (hashErr) {
    console.error('[chat/route] Hash error (continuing with anon):', hashErr)
    // Non-fatal: fall back to 'anon'
  }

  // ── Step 4: Sanitize conversation history ──────────────────────
  const conversationHistory = body.conversationHistory
  const sanitizedHistory = Array.isArray(conversationHistory)
    ? conversationHistory
        .filter(
          (m: { role?: string; content?: string }) =>
            (m.role === 'user' || m.role === 'assistant') &&
            typeof m.content === 'string' &&
            m.content.trim().length > 0
        )
        .slice(-10)
        .map((m: { role: string; content: string }) => ({
          role: m.role,
          content: m.content.slice(0, 1000),
        }))
    : []

  // ── Step 5: Call Edge Function ─────────────────────────────────
  const functionUrl = `${supabaseUrl}/functions/v1/ai_chat`

  let response: Response
  try {
    response = await fetch(functionUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${supabaseServiceRoleKey}`,
        apikey: supabaseServiceRoleKey,
        'x-user-key': userKey,
        'x-device-id': deviceId,
      },
      body: JSON.stringify({
        message: normalizedMessage,
        podcastSlug: normalizedPodcastSlug,
        conversationHistory: sanitizedHistory,
        sessionId: typeof body.sessionId === 'string' ? body.sessionId.trim() : undefined,
        ...(isQuizMode ? { quizMode: body.quizMode } : {}),
      }),
    })
  } catch (fetchErr) {
    // Network error — fetch threw (DNS failure, connection refused, etc.)
    const errMsg =
      fetchErr instanceof Error ? fetchErr.message : String(fetchErr)
    console.error('[chat/route] fetch to Edge Function failed:', errMsg)
    return NextResponse.json(
      {
        error: 'Unable to reach the chat service. Please try again.',
        debug: process.env.NODE_ENV === 'development' ? errMsg : undefined,
      },
      { status: 502 }
    )
  }

  // ── Step 6: Parse & relay response ─────────────────────────────
    const data = await response.json().catch(() => ({}))

    if (!response.ok) {
    const errorMsg =
      typeof data?.error === 'string' ? data.error : 'Request failed'
    console.error(
      `[chat/route] Edge Function returned ${response.status}:`,
      errorMsg
    )
    return NextResponse.json(
      {
        error: errorMsg,
        credits_remaining: data?.credits_remaining,
        credits_total: data?.credits_total,
      },
      { status: response.status }
    )
    }

    return NextResponse.json(data)
}
