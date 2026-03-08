import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { verifyCronSecret } from '@/lib/cron-auth'

export const maxDuration = 120

export async function GET(request: NextRequest) {
  const authError = verifyCronSecret(request)
  if (authError) return authError

  const adminClient = createAdminClient()

  // Get all active locations
  const { data: locations } = await adminClient
    .from('locations')
    .select('id, name, org_id')
    .eq('active', true)

  if (!locations || locations.length === 0) {
    return NextResponse.json({ processed: 0 })
  }

  const results: Array<{
    location_id: string
    total_reviews_30d: number
    replied_count: number
    avg_response_hours: number | null
    response_rate: number
  }> = []

  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
  const today = new Date().toISOString().split('T')[0]

  for (const loc of locations) {
    // Get reviews from last 30 days with reply data
    const { data: reviews } = await adminClient
      .from('reviews')
      .select('id, published_at, reply_body, reply_published_at')
      .eq('location_id', loc.id)
      .gte('published_at', thirtyDaysAgo)

    if (!reviews || reviews.length === 0) continue

    const replied = reviews.filter((r: any) => r.reply_body)
    const responseRate = replied.length / reviews.length

    // Calculate average response time for reviews that have both timestamps
    const responseTimes: number[] = []
    for (const r of replied) {
      if (r.published_at && r.reply_published_at) {
        const published = new Date(r.published_at).getTime()
        const replyTime = new Date(r.reply_published_at).getTime()
        const hoursToRespond = (replyTime - published) / (1000 * 60 * 60)
        if (hoursToRespond > 0 && hoursToRespond < 720) { // Cap at 30 days
          responseTimes.push(hoursToRespond)
        }
      }
    }

    const avgResponseHours = responseTimes.length > 0
      ? responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length
      : null

    results.push({
      location_id: loc.id,
      total_reviews_30d: reviews.length,
      replied_count: replied.length,
      avg_response_hours: avgResponseHours ? Math.round(avgResponseHours * 10) / 10 : null,
      response_rate: Math.round(responseRate * 1000) / 10,
    })

    // Log to agent_activity_log if response rate is low or response time is high
    const isSlowResponse = avgResponseHours !== null && avgResponseHours > 24
    const isLowRate = responseRate < 0.8 && reviews.length >= 3

    if (isSlowResponse || isLowRate) {
      const { count: existingCount } = await adminClient
        .from('agent_activity_log')
        .select('id', { count: 'exact', head: true })
        .eq('location_id', loc.id)
        .eq('action_type', 'response_time_alert')
        .gte('created_at', today)

      if ((existingCount || 0) === 0) {
        const issues: string[] = []
        if (isSlowResponse) issues.push(`avg response time: ${Math.round(avgResponseHours!)}h`)
        if (isLowRate) issues.push(`response rate: ${Math.round(responseRate * 100)}%`)

        await adminClient.from('agent_activity_log').insert({
          location_id: loc.id,
          action_type: 'response_time_alert',
          status: 'completed',
          summary: `Review response needs attention: ${issues.join(', ')}`,
          details: {
            total_reviews_30d: reviews.length,
            replied_count: replied.length,
            response_rate: responseRate,
            avg_response_hours: avgResponseHours,
          },
        })
      }
    }

    // Store metrics as performance data
    await adminClient
      .from('gbp_performance_metrics')
      .upsert(
        {
          location_id: loc.id,
          date: today,
          metric: 'review_response_rate',
          value: Math.round(responseRate * 100),
        },
        { onConflict: 'location_id,date,metric' }
      )

    if (avgResponseHours !== null) {
      await adminClient
        .from('gbp_performance_metrics')
        .upsert(
          {
            location_id: loc.id,
            date: today,
            metric: 'avg_response_hours',
            value: Math.round(avgResponseHours),
          },
          { onConflict: 'location_id,date,metric' }
        )
    }
  }

  return NextResponse.json({
    processed: locations.length,
    tracked: results.length,
    alerts: results.filter(r =>
      (r.avg_response_hours !== null && r.avg_response_hours > 24) ||
      (r.response_rate < 80 && r.total_reviews_30d >= 3)
    ).length,
  })
}
