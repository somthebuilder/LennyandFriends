import { NextRequest, NextResponse } from 'next/server'
import { getConcepts } from '@/lib/api/concepts'

export async function GET(request: NextRequest) {
  const podcastSlug = request.nextUrl.searchParams.get('podcastSlug') ?? 'lennys-podcast'
  const concepts = await getConcepts(podcastSlug)
  return NextResponse.json(concepts)
}

