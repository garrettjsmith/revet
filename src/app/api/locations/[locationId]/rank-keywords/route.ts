import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { checkAgencyAdmin } from '@/lib/locations'
import { createCampaign } from '@/lib/local-falcon'

/**
 * GET /api/locations/[locationId]/rank-keywords
 * Returns keyword scan configs for a location.
 *
 * POST /api/locations/[locationId]/rank-keywords
 * Adds a keyword to track. Creates a LocalFalcon campaign if API key is configured.
 * Body: { keyword: string, grid_size?: number, radius_km?: number, frequency?: string }
 *
 * DELETE /api/locations/[locationId]/rank-keywords
 * Removes a keyword config.
 * Body: { id: string }
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { locationId: string } }
) {
  const supabase = createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { data: location } = await supabase
    .from('locations')
    .select('id')
    .eq('id', params.locationId)
    .single()

  if (!location) {
    return NextResponse.json({ error: 'Access denied' }, { status: 403 })
  }

  const adminClient = createAdminClient()
  const { data: configs } = await adminClient
    .from('local_falcon_keyword_configs')
    .select('*')
    .eq('location_id', params.locationId)
    .order('created_at', { ascending: true })

  // Also fetch latest scan data per keyword for status display
  const { data: latestScans } = await adminClient
    .from('local_falcon_scans')
    .select('keyword, solv, arp, scanned_at')
    .eq('location_id', params.locationId)
    .order('scanned_at', { ascending: false })

  // Deduplicate: keep only the most recent scan per keyword
  const scansByKeyword = new Map<string, { solv: number; arp: number; scanned_at: string }>()
  for (const scan of latestScans || []) {
    const key = scan.keyword.toLowerCase()
    if (!scansByKeyword.has(key)) {
      scansByKeyword.set(key, {
        solv: scan.solv,
        arp: scan.arp,
        scanned_at: scan.scanned_at,
      })
    }
  }

  return NextResponse.json({
    configs: configs || [],
    scans: Object.fromEntries(scansByKeyword),
  })
}

export async function POST(
  request: NextRequest,
  { params }: { params: { locationId: string } }
) {
  const isAdmin = await checkAgencyAdmin()
  if (!isAdmin) {
    return NextResponse.json({ error: 'Agency admin required' }, { status: 403 })
  }

  const body = await request.json()
  const { keyword, grid_size, radius_km, frequency } = body as {
    keyword?: string
    grid_size?: number
    radius_km?: number
    frequency?: string
  }

  if (!keyword || typeof keyword !== 'string' || keyword.trim().length === 0) {
    return NextResponse.json({ error: 'Keyword required' }, { status: 400 })
  }

  const adminClient = createAdminClient()

  // Get location's place_id for LocalFalcon campaign
  const { data: location } = await adminClient
    .from('locations')
    .select('id, name, place_id')
    .eq('id', params.locationId)
    .single()

  if (!location) {
    return NextResponse.json({ error: 'Location not found' }, { status: 404 })
  }

  const gridSize = grid_size || 49
  const radiusKm = radius_km || 8
  const freq = frequency || 'weekly'

  // Grid size value → grid dimension for LocalFalcon (49=7, 25=5, 81=9)
  const gridDim = String(Math.round(Math.sqrt(gridSize)))

  // Try to create campaign in LocalFalcon
  let campaignId: string | null = null
  if (process.env.LOCALFALCON_API_KEY && location.place_id) {
    try {
      const result = await createCampaign({
        name: `${location.name} — ${keyword.trim()}`,
        placeId: location.place_id,
        keyword: keyword.trim(),
        gridSize: gridDim,
        radius: String(radiusKm),
        measurement: 'km',
        frequency: freq as 'daily' | 'weekly' | 'biweekly' | 'monthly',
      })
      campaignId = result.campaign_id || result.id || null
    } catch (err) {
      console.error(`[rank-keywords] Failed to create LocalFalcon campaign:`, err instanceof Error ? err.message : err)
      // Continue — store the config even if campaign creation fails
    }
  }

  const { data: config, error } = await adminClient
    .from('local_falcon_keyword_configs')
    .upsert(
      {
        location_id: params.locationId,
        keyword: keyword.trim(),
        campaign_id: campaignId,
        grid_size: gridSize,
        radius_km: radiusKm,
        frequency: freq,
        active: true,
      },
      { onConflict: 'location_id,keyword' }
    )
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true, config })
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { locationId: string } }
) {
  const isAdmin = await checkAgencyAdmin()
  if (!isAdmin) {
    return NextResponse.json({ error: 'Agency admin required' }, { status: 403 })
  }

  const body = await request.json()
  const { id } = body as { id?: string }

  if (!id) {
    return NextResponse.json({ error: 'Config ID required' }, { status: 400 })
  }

  const adminClient = createAdminClient()
  const { error } = await adminClient
    .from('local_falcon_keyword_configs')
    .delete()
    .eq('id', id)
    .eq('location_id', params.locationId)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
