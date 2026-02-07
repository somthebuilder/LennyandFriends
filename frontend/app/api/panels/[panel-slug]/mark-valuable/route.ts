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
    const { marked } = body

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

    // TODO: Replace with actual panel lookup
    const panelId = panelSlug // In real implementation, look up panel by slug

    if (marked) {
      // Insert or update (upsert)
      const { error } = await supabase
        .from('panel_valuable')
        .upsert({
          panel_id: panelId,
          user_id: user.id,
          marked_at: new Date().toISOString(),
        }, {
          onConflict: 'panel_id,user_id',
        })

      if (error) {
        console.error('Error marking panel as valuable:', error)
        return NextResponse.json(
          { error: 'Failed to mark panel as valuable' },
          { status: 500 }
        )
      }
    } else {
      // Delete
      const { error } = await supabase
        .from('panel_valuable')
        .delete()
        .eq('panel_id', panelId)
        .eq('user_id', user.id)

      if (error) {
        console.error('Error unmarking panel as valuable:', error)
        return NextResponse.json(
          { error: 'Failed to unmark panel as valuable' },
          { status: 500 }
        )
      }
    }

    // Get updated count
    const { count, error: countError } = await supabase
      .from('panel_valuable')
      .select('*', { count: 'exact', head: true })
      .eq('panel_id', panelId)

    if (countError) {
      console.error('Error getting valuable count:', countError)
    }

    return NextResponse.json({
      valuableCount: count || 0,
    })
  } catch (error: any) {
    console.error('Error in mark-valuable:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

