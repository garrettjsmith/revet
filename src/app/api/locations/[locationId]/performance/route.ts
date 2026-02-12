import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * GET /api/locations/[locationId]/performance?period=30d
 *
 * Returns aggregated performance metrics for a location.
 * Pulls from gbp_performance_metrics table (synced daily by cron).
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

  // Verify location access
  const { data: location } = await supabase
    .from('locations')
    .select('id')
    .eq('id', params.locationId)
    .single()

  if (!location) {
    return NextResponse.json({ error: 'Location not found' }, { status: 404 })
  }

  const period = request.nextUrl.searchParams.get('period') || '30d'
  const days = period === '7d' ? 7 : period === '90d' ? 90 : 30

  const endDate = new Date()
  const startDate = new Date()
  startDate.setDate(startDate.getDate() - days)

  // Previous period for trend comparison
  const prevEndDate = new Date(startDate)
  const prevStartDate = new Date()
  prevStartDate.setDate(prevStartDate.getDate() - days * 2)

  const adminClient = createAdminClient()

  // Fetch current period metrics
  const { data: currentMetrics } = await adminClient
    .from('gbp_performance_metrics')
    .select('date, metric, value')
    .eq('location_id', params.locationId)
    .gte('date', startDate.toISOString().split('T')[0])
    .lte('date', endDate.toISOString().split('T')[0])
    .order('date', { ascending: true })

  // Fetch previous period for trends
  const { data: prevMetrics } = await adminClient
    .from('gbp_performance_metrics')
    .select('metric, value')
    .eq('location_id', params.locationId)
    .gte('date', prevStartDate.toISOString().split('T')[0])
    .lt('date', startDate.toISOString().split('T')[0])

  // Aggregate current period totals
  const impressionTypes = [
    'impressions_desktop_maps',
    'impressions_desktop_search',
    'impressions_mobile_maps',
    'impressions_mobile_search',
  ]

  const metricTotals: Record<string, number> = {}
  const dailyData: Record<string, Record<string, number>> = {}

  for (const row of currentMetrics || []) {
    metricTotals[row.metric] = (metricTotals[row.metric] || 0) + row.value
    if (!dailyData[row.date]) dailyData[row.date] = {}
    dailyData[row.date][row.metric] = (dailyData[row.date][row.metric] || 0) + row.value
  }

  // Aggregate previous period totals
  const prevTotals: Record<string, number> = {}
  for (const row of prevMetrics || []) {
    prevTotals[row.metric] = (prevTotals[row.metric] || 0) + row.value
  }

  // Calculate totals and trends
  const totalImpressions = impressionTypes.reduce((sum, m) => sum + (metricTotals[m] || 0), 0)
  const prevImpressions = impressionTypes.reduce((sum, m) => sum + (prevTotals[m] || 0), 0)

  const metrics = {
    total_impressions: {
      value: totalImpressions,
      previous: prevImpressions,
      trend: prevImpressions > 0 ? ((totalImpressions - prevImpressions) / prevImpressions * 100) : 0,
    },
    website_clicks: {
      value: metricTotals['website_clicks'] || 0,
      previous: prevTotals['website_clicks'] || 0,
      trend: (prevTotals['website_clicks'] || 0) > 0
        ? (((metricTotals['website_clicks'] || 0) - (prevTotals['website_clicks'] || 0)) / (prevTotals['website_clicks'] || 1) * 100)
        : 0,
    },
    call_clicks: {
      value: metricTotals['call_clicks'] || 0,
      previous: prevTotals['call_clicks'] || 0,
      trend: (prevTotals['call_clicks'] || 0) > 0
        ? (((metricTotals['call_clicks'] || 0) - (prevTotals['call_clicks'] || 0)) / (prevTotals['call_clicks'] || 1) * 100)
        : 0,
    },
    direction_requests: {
      value: metricTotals['direction_requests'] || 0,
      previous: prevTotals['direction_requests'] || 0,
      trend: (prevTotals['direction_requests'] || 0) > 0
        ? (((metricTotals['direction_requests'] || 0) - (prevTotals['direction_requests'] || 0)) / (prevTotals['direction_requests'] || 1) * 100)
        : 0,
    },
  }

  // Build daily time series (aggregated impressions per day)
  const daily = Object.entries(dailyData)
    .map(([date, values]) => ({
      date,
      impressions: impressionTypes.reduce((sum, m) => sum + (values[m] || 0), 0),
      website_clicks: values['website_clicks'] || 0,
      call_clicks: values['call_clicks'] || 0,
      direction_requests: values['direction_requests'] || 0,
    }))
    .sort((a, b) => a.date.localeCompare(b.date))

  return NextResponse.json({
    period,
    days,
    metrics,
    daily,
  })
}
