import { NextRequest, NextResponse } from 'next/server'
import { getConceptsPage } from '@/lib/api/concepts'

export async function GET(request: NextRequest) {
  const podcastSlug = request.nextUrl.searchParams.get('podcastSlug') ?? 'lennys-podcast'
  const limitRaw = request.nextUrl.searchParams.get('limit')
  const offsetRaw = request.nextUrl.searchParams.get('offset')
  const limitParam = limitRaw === null ? undefined : Number(limitRaw)
  const offsetParam = offsetRaw === null ? undefined : Number(offsetRaw)

  const page = await getConceptsPage(podcastSlug, {
    limit: Number.isFinite(limitParam) ? limitParam : undefined,
    offset: Number.isFinite(offsetParam) ? offsetParam : undefined,
  })

  return NextResponse.json(page)
}

