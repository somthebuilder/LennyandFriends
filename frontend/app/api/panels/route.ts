import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

export async function GET(request: NextRequest) {
  try {
    console.log('Fetching panels from database...')
    
    // Fetch panels from database
    const { data: panelsData, error: panelsError } = await supabase
      .from('panels')
      .select(`
        id,
        slug,
        title,
        short_description,
        description,
        category,
        is_featured
      `)
      .eq('is_featured', true)
      .eq('is_private', false)
      .order('created_at', { ascending: false })

    if (panelsError) {
      console.error('Error fetching panels:', panelsError)
      console.error('Error details:', JSON.stringify(panelsError, null, 2))
      // Return empty array so frontend can still render
      console.warn('Returning empty panels array due to database error')
      return NextResponse.json([])
    }

    console.log('Panels fetched:', panelsData?.length || 0)

    if (!panelsData || panelsData.length === 0) {
      console.log('No panels found in database')
      return NextResponse.json([])
    }

    // Fetch guests and valuable counts for each panel
    const panelsWithDetails = await Promise.all(
      panelsData.map(async (panel: any) => {
        // Fetch guests
        const { data: guests } = await supabase
          .from('panel_guests')
          .select('guest_name, display_order')
          .eq('panel_id', panel.id)
          .order('display_order', { ascending: true })

        // Fetch valuable count
        const { count: valuableCount } = await supabase
          .from('panel_valuable')
          .select('id', { count: 'exact', head: true })
          .eq('panel_id', panel.id)

        return {
          id: panel.id,
          slug: panel.slug,
          name: panel.title,
          description: panel.short_description || panel.description || '',
          category: panel.category || 'Uncategorized',
          insightfulCount: valuableCount || 0,
          guests: (guests || []).map((g: any) => ({
            name: g.guest_name,
            avatar: undefined,
          })),
        }
      })
    )

    return NextResponse.json(panelsWithDetails)
  } catch (error: any) {
    console.error('Error in panels API:', error)
    console.error('Error stack:', error.stack)
    // Return empty array instead of error so frontend can still render
    // The Supabase connection issue can be debugged separately
    console.warn('Returning empty panels array due to error')
    return NextResponse.json([])
  }
}

