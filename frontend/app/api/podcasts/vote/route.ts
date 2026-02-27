import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase-server'

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => ({}))) as { podcastId?: unknown }
  const podcastId = typeof body.podcastId === 'string' ? body.podcastId.trim() : ''
  if (!podcastId) {
    return NextResponse.json({ error: 'podcastId is required' }, { status: 400 })
  }

  const supabase = createServerSupabase()

  const { data: podcast, error: podcastError } = await supabase
    .from('podcasts')
    .select('id,status,vote_count')
    .eq('id', podcastId)
    .maybeSingle()

  if (podcastError || !podcast) {
    return NextResponse.json({ error: 'Podcast not found' }, { status: 404 })
  }
  if (podcast.status !== 'coming_soon') {
    return NextResponse.json({ error: 'Voting is only enabled for coming soon podcasts' }, { status: 400 })
  }

  const nextVoteCount = (podcast.vote_count ?? 0) + 1
  const { data: updated, error: updateError } = await supabase
    .from('podcasts')
    .update({ vote_count: nextVoteCount })
    .eq('id', podcastId)
    .eq('status', 'coming_soon')
    .select('vote_count')
    .maybeSingle()

  if (updateError || !updated) {
    console.error('[api/podcasts/vote] Failed to update vote count:', updateError?.message)
    return NextResponse.json({ error: 'Unable to record vote' }, { status: 502 })
  }

  return NextResponse.json({ vote_count: updated.vote_count ?? nextVoteCount })
}
