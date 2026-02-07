import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://rhzpjvuutpjtdsbnskdy.supabase.co'
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || ''

// For now, we'll use the anon key if service key is not available
const supabaseKey = supabaseServiceKey || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''

const supabase = createClient(supabaseUrl, supabaseKey)

export async function GET(
  request: NextRequest,
  context: { params: { 'panel-slug': string } }
) {
  try {
    // Extract panel slug from params - handle both direct access and bracket notation
    const params = context.params
    const panelSlug = params['panel-slug'] || (params as any)['panel-slug'] || (params as any).panelSlug
    
    // Also try extracting from URL as fallback
    const url = new URL(request.url)
    const pathParts = url.pathname.split('/')
    const slugFromUrl = pathParts[pathParts.length - 1]
    
    const finalSlug = panelSlug || slugFromUrl
    
    console.log('API Route - Received panel slug from params:', panelSlug)
    console.log('API Route - Slug from URL:', slugFromUrl)
    console.log('API Route - Final slug:', finalSlug)
    console.log('API Route - All params:', params)
    console.log('API Route - Full URL:', request.url)
    
    if (!finalSlug) {
      console.error('API Route - No panel slug found')
      return NextResponse.json(
        { error: 'Panel slug is required', receivedParams: params, url: request.url },
        { status: 400 }
      )
    }
    
    // Get auth header (optional for GET requests)
    const authHeader = request.headers.get('authorization')
    let userId: string | null = null
    
    if (authHeader) {
      try {
        const token = authHeader.replace('Bearer ', '')
        const { data: { user }, error } = await supabase.auth.getUser(token)
        if (!error && user) {
          userId = user.id
        }
      } catch (e) {
        // Ignore auth errors - user might not be authenticated
      }
    }

    // TODO: Replace with actual database query
    // For now, return mock data based on slug
    console.log('API Route - Looking up panel for slug:', finalSlug)
    const mockPanel = getMockPanel(finalSlug)
    
    if (!mockPanel) {
      console.error('API Route - Panel not found for slug:', finalSlug)
      console.log('API Route - Available panel slugs:', ['the-growth-engine', 'product-leadership', 'pricing-mastery', 'b2b-sales-motion'])
      return NextResponse.json(
        { error: 'Panel not found', slug: finalSlug, availableSlugs: ['the-growth-engine', 'product-leadership', 'pricing-mastery', 'b2b-sales-motion'] },
        { status: 404 }
      )
    }
    
    console.log('API Route - Found panel:', mockPanel.title)
    
    // Check if user has marked this panel as valuable
    let isMarkedValuable = false
    if (userId) {
      try {
        const { data } = await supabase
          .from('panel_valuable')
          .select('id')
          .eq('panel_id', mockPanel.id)
          .eq('user_id', userId)
          .single()
        
        isMarkedValuable = !!data
      } catch (e) {
        // Table might not exist yet, ignore error
      }
    }

    return NextResponse.json({
      panel: mockPanel,
      isMarkedValuable,
    })
  } catch (error: any) {
    console.error('Error fetching panel:', error)
    return NextResponse.json(
      { error: 'Failed to fetch panel' },
      { status: 500 }
    )
  }
}

// Mock data function - replace with actual database query
function getMockPanel(slug: string) {
  // Panel data mapping - replace with actual database queries
  const panels: Record<string, any> = {
    'the-growth-engine': {
      id: 'the-growth-engine',
      slug: 'the-growth-engine',
      title: 'The Growth Engine',
      description: 'Master the levers of early-stage growth with perspectives from operators who scaled Airbnb, Uber, and Iterable. This panel brings together world-class experts to share their playbooks on acquisition, retention, monetization, and scaling.',
      shortDescription: 'Master the levers of early-stage growth with perspectives from operators who scaled Airbnb, Uber, and Iterable.',
      category: 'Early Stage Growth',
      experts: [
        {
          id: 'brian-chesky',
          name: 'Brian Chesky',
          title: 'Co-founder & CEO',
          company: 'Airbnb',
          avatar: undefined,
        },
        {
          id: 'andrew-chen',
          name: 'Andrew Chen',
          title: 'GP',
          company: 'Andreessen Horowitz',
          avatar: undefined,
        },
        {
          id: 'elena-verna',
          name: 'Elena Verna',
          title: 'Growth Advisor',
          company: 'ex-Amplitude',
          avatar: undefined,
        },
      ],
      discussions: [
        {
          id: 'disc-1',
          panelId: 'the-growth-engine',
          title: 'When to Focus on Growth vs Product-Market Fit',
          order: 1,
          agreementLevel: 'consensus' as const,
          perspectives: [
            {
              id: 'persp-1',
              discussionId: 'disc-1',
              expertId: 'brian-chesky',
              expertName: 'Brian Chesky',
              expertTitle: 'Co-founder & CEO',
              expertCompany: 'Airbnb',
              content: 'Growth at Airbnb was never about chasing vanity metrics. We focused on creating genuine value for both sides of our marketplace. The key was understanding that growth follows product-market fit, not the other way around. We spent months getting our first 100 users right before scaling.',
              episodeId: 'ep-1',
              episodeTitle: 'Building a Marketplace',
              episodeNumber: 42,
              timestamp: '12:34',
            },
            {
              id: 'persp-2',
              discussionId: 'disc-1',
              expertId: 'andrew-chen',
              expertName: 'Andrew Chen',
              expertTitle: 'GP',
              expertCompany: 'Andreessen Horowitz',
              content: 'The most successful growth strategies I\'ve seen combine data-driven experimentation with deep user understanding. You need to identify your core growth loops early and double down on what works. The mistake many founders make is trying to optimize everything at once instead of finding one channel that truly works.',
              episodeId: 'ep-2',
              episodeTitle: 'Growth Loops',
              episodeNumber: 88,
              timestamp: '23:15',
            },
          ],
          keyTakeaways: [
            { text: 'Product-market fit must precede growth', type: 'consensus' as const },
            { text: 'Focus on one channel that works before expanding', type: 'actionable' as const },
          ],
          metadata: {
            viewCount: 1240,
            expandCount: 856,
          },
        },
      ],
      metadata: {
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        viewCount: 5420,
        valuableCount: 1240,
      },
    },
    'product-leadership': {
      id: 'product-leadership',
      slug: 'product-leadership',
      title: 'Product Leadership',
      description: 'Hiring your first VP of Product? Scaling from 0-50 PM? Get the playbook from the best in the business. This panel brings together product leaders who have built and scaled world-class product organizations.',
      shortDescription: 'Hiring your first VP of Product? Scaling from 0-50 PM? Get the playbook from the best in the business.',
      category: 'Scaling Product Teams',
      experts: [
        {
          id: 'julie-zhuo',
          name: 'Julie Zhuo',
          title: 'Former VP of Product Design',
          company: 'Facebook',
          avatar: undefined,
        },
        {
          id: 'shreyas-doshi',
          name: 'Shreyas Doshi',
          title: 'Product Leader',
          company: 'Stripe, Twitter',
          avatar: undefined,
        },
        {
          id: 'des-traynor',
          name: 'Des Traynor',
          title: 'Co-founder',
          company: 'Intercom',
          avatar: undefined,
        },
      ],
      discussions: [
        {
          id: 'disc-1',
          panelId: 'product-leadership',
          title: 'Hiring Your First Product Manager',
          order: 1,
          agreementLevel: 'consensus' as const,
          perspectives: [
            {
              id: 'persp-1',
              discussionId: 'disc-1',
              expertId: 'julie-zhuo',
              expertName: 'Julie Zhuo',
              expertTitle: 'Former VP of Product Design',
              expertCompany: 'Facebook',
              content: 'The first PM hire is critical. Look for someone who can think strategically but also roll up their sleeves. They need to be comfortable with ambiguity and have strong communication skills. Don\'t just hire for experience - hire for potential and cultural fit.',
              episodeId: 'ep-1',
              episodeTitle: 'Building Product Teams',
              episodeNumber: 45,
              timestamp: '15:20',
            },
            {
              id: 'persp-2',
              discussionId: 'disc-1',
              expertId: 'shreyas-doshi',
              expertName: 'Shreyas Doshi',
              expertTitle: 'Product Leader',
              expertCompany: 'Stripe, Twitter',
              content: 'Your first PM should be someone who can wear multiple hats. They\'ll need to do product strategy, user research, and project management. Look for someone who has shipped products end-to-end, not just managed features.',
              episodeId: 'ep-2',
              episodeTitle: 'Product Management Fundamentals',
              episodeNumber: 92,
              timestamp: '28:45',
            },
          ],
          keyTakeaways: [
            { text: 'First PM should be a generalist who can wear multiple hats', type: 'consensus' as const },
            { text: 'Prioritize potential and cultural fit over just experience', type: 'actionable' as const },
          ],
          metadata: {
            viewCount: 850,
            expandCount: 620,
          },
        },
      ],
      metadata: {
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        viewCount: 3200,
        valuableCount: 850,
      },
    },
    'pricing-mastery': {
      id: 'pricing-mastery',
      slug: 'pricing-mastery',
      title: 'Pricing Mastery',
      description: 'Unpack complex pricing models, value-based positioning, and monetization strategies for PLG and Enterprise. Learn from experts who have priced products from seed to IPO.',
      shortDescription: 'Unpack complex pricing models, value-based positioning, and monetization strategies for PLG and Enterprise.',
      category: 'Pricing Strategy',
      experts: [
        {
          id: 'april-dunford',
          name: 'April Dunford',
          title: 'Positioning Expert',
          company: 'Obviously Awesome',
          avatar: undefined,
        },
        {
          id: 'kevin-kwok',
          name: 'Kevin Kwok',
          title: 'Investor',
          company: 'a16z',
          avatar: undefined,
        },
        {
          id: 'elena-verna',
          name: 'Elena Verna',
          title: 'Growth Advisor',
          company: 'ex-Amplitude',
          avatar: undefined,
        },
      ],
      discussions: [
        {
          id: 'disc-1',
          panelId: 'pricing-mastery',
          title: 'Value-Based Pricing vs Cost-Plus',
          order: 1,
          agreementLevel: 'moderate_disagreement' as const,
          perspectives: [
            {
              id: 'persp-1',
              discussionId: 'disc-1',
              expertId: 'april-dunford',
              expertName: 'April Dunford',
              expertTitle: 'Positioning Expert',
              expertCompany: 'Obviously Awesome',
              content: 'Value-based pricing is the only way to price enterprise products. You need to understand the value you create for customers and price accordingly. Cost-plus pricing leaves money on the table and doesn\'t reflect the true value of your solution.',
              episodeId: 'ep-1',
              episodeTitle: 'Pricing Strategy',
              episodeNumber: 67,
              timestamp: '22:10',
            },
            {
              id: 'persp-2',
              discussionId: 'disc-1',
              expertId: 'kevin-kwok',
              expertName: 'Kevin Kwok',
              expertTitle: 'Investor',
              expertCompany: 'a16z',
              content: 'While value-based pricing is ideal, you need to start somewhere. For early-stage companies, cost-plus with a healthy margin is a good starting point. As you learn more about customer value, you can evolve to value-based pricing.',
              episodeId: 'ep-2',
              episodeTitle: 'Monetization Models',
              episodeNumber: 105,
              timestamp: '18:30',
            },
          ],
          keyTakeaways: [
            { text: 'Value-based pricing is ideal but requires deep customer understanding', type: 'nuanced' as const },
            { text: 'Start with cost-plus and evolve to value-based as you learn', type: 'actionable' as const },
          ],
          metadata: {
            viewCount: 450,
            expandCount: 320,
          },
        },
      ],
      metadata: {
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        viewCount: 1800,
        valuableCount: 450,
      },
    },
    'b2b-sales-motion': {
      id: 'b2b-sales-motion',
      slug: 'b2b-sales-motion',
      title: 'B2B Sales Motion',
      description: 'How to build a repeatable enterprise sales motion and align your product roadmap with high-value contracts. Learn from operators who have scaled sales from $0 to $100M+ ARR.',
      shortDescription: 'How to build a repeatable enterprise sales motion and align your product roadmap with high-value contracts.',
      category: 'B2B Product',
      experts: [
        {
          id: 'anu-hariharan',
          name: 'Anu Hariharan',
          title: 'Partner',
          company: 'Y Combinator',
          avatar: undefined,
        },
        {
          id: 'casey-winters',
          name: 'Casey Winters',
          title: 'Growth Advisor',
          company: 'ex-Eventbrite, Pinterest',
          avatar: undefined,
        },
        {
          id: 'reid-hoffman',
          name: 'Reid Hoffman',
          title: 'Co-founder',
          company: 'LinkedIn',
          avatar: undefined,
        },
      ],
      discussions: [
        {
          id: 'disc-1',
          panelId: 'b2b-sales-motion',
          title: 'Product-Led vs Sales-Led Growth',
          order: 1,
          agreementLevel: 'nuanced' as const,
          perspectives: [
            {
              id: 'persp-1',
              discussionId: 'disc-1',
              expertId: 'anu-hariharan',
              expertName: 'Anu Hariharan',
              expertTitle: 'Partner',
              expertCompany: 'Y Combinator',
              content: 'The best B2B companies combine both product-led and sales-led motions. Product-led gets you initial adoption, but sales-led helps you land enterprise deals. You need both to scale effectively.',
              episodeId: 'ep-1',
              episodeTitle: 'B2B Growth Strategies',
              episodeNumber: 78,
              timestamp: '31:15',
            },
            {
              id: 'persp-2',
              discussionId: 'disc-1',
              expertId: 'casey-winters',
              expertName: 'Casey Winters',
              expertTitle: 'Growth Advisor',
              expertCompany: 'ex-Eventbrite, Pinterest',
              content: 'Start product-led, add sales when you have product-market fit. The product should do the heavy lifting for acquisition, but sales helps with expansion and enterprise deals. Don\'t add sales too early.',
              episodeId: 'ep-2',
              episodeTitle: 'Scaling B2B',
              episodeNumber: 115,
              timestamp: '25:40',
            },
          ],
          keyTakeaways: [
            { text: 'Best B2B companies combine product-led and sales-led motions', type: 'consensus' as const },
            { text: 'Start product-led, add sales after product-market fit', type: 'actionable' as const },
          ],
          metadata: {
            viewCount: 1300,
            expandCount: 980,
          },
        },
      ],
      metadata: {
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        viewCount: 5100,
        valuableCount: 1300,
      },
    },
  }

  const panel = panels[slug]
  if (!panel) {
    return null
  }

  return panel
}

