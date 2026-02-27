import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => ({}))) as {
    email?: unknown
    redirectTo?: unknown
    userData?: unknown
  }
  const email = typeof body.email === 'string' ? body.email.trim() : ''
  const redirectTo = typeof body.redirectTo === 'string' ? body.redirectTo.trim() : ''
  const userData = typeof body.userData === 'object' && body.userData !== null
    ? (body.userData as Record<string, unknown>)
    : undefined

  if (!email) {
    return NextResponse.json({ error: 'Email is required' }, { status: 400 })
  }
  if (!supabaseUrl || !supabaseAnonKey) {
    return NextResponse.json({ error: 'Server auth configuration is missing' }, { status: 500 })
  }

  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  try {
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        ...(redirectTo ? { emailRedirectTo: redirectTo } : {}),
        ...(userData ? { data: userData } : {}),
      },
    })
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }
    return NextResponse.json({ ok: true })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to contact auth provider'
    return NextResponse.json({ error: message }, { status: 502 })
  }
}
