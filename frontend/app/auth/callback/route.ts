import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

/**
 * Auth callback handler for Supabase magic link sign-in.
 *
 * When a user clicks the magic link in their email, Supabase redirects
 * them here with a `code` query parameter. We exchange that code for
 * a session and then redirect the user to the app.
 */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const next = searchParams.get('next') ?? '/'

  if (code) {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    const supabase = createClient(supabaseUrl, supabaseAnonKey)

    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) {
      return NextResponse.redirect(`${origin}${next}`)
    }
  }

  // If code exchange fails, redirect to homepage
  return NextResponse.redirect(`${origin}/`)
}
