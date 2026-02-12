import { NextRequest, NextResponse } from 'next/server'
import { checkAgencyAdmin } from '@/lib/locations'
import { searchCategories } from '@/lib/google/profiles'
import { getValidAccessToken, GoogleAuthError } from '@/lib/google/auth'

/**
 * GET /api/categories/search?q=dentist
 *
 * Proxies Google category search for the profile editor.
 * Agency admin only.
 */
export async function GET(request: NextRequest) {
  const isAdmin = await checkAgencyAdmin()
  if (!isAdmin) {
    return NextResponse.json({ error: 'Agency admin required' }, { status: 403 })
  }

  const query = request.nextUrl.searchParams.get('q') || ''
  if (!query || query.length < 2) {
    return NextResponse.json({ categories: [] })
  }

  try {
    await getValidAccessToken()
  } catch (err) {
    if (err instanceof GoogleAuthError) {
      return NextResponse.json({ error: 'Google connection required' }, { status: 401 })
    }
    return NextResponse.json({ error: 'Google auth error' }, { status: 500 })
  }

  try {
    const categories = await searchCategories(query)
    return NextResponse.json({
      categories: categories.map((c) => ({
        id: c.name.replace('categories/', ''),
        displayName: c.displayName,
      })),
    })
  } catch (err) {
    console.error('[categories/search] Error:', err)
    return NextResponse.json({ error: 'Category search failed' }, { status: 500 })
  }
}
