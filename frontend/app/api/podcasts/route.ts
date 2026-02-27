import { NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase-server'

export async function GET() {
  const supabase = createServerSupabase()
  const { data, error } = await supabase
    .from('podcasts')
    .select(
      'id, name, host, description, slug, accent_color, tagline, cover_image, status, featured, vote_count'
    )
    .in('status', ['active', 'coming_soon'])
    .order('display_order', { ascending: true })

  if (error) {
    console.error('[api/podcasts] Failed to fetch podcasts:', error.message)
    return NextResponse.json({ error: 'Failed to fetch podcasts' }, { status: 502 })
  }

  return NextResponse.json(data ?? [])
}
