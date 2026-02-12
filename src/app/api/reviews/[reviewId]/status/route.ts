import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * PATCH /api/reviews/[reviewId]/status
 *
 * Updates review status. Used by the work queue for skip/reject actions.
 * Optionally clears the AI draft (for reject).
 *
 * Body: { status: string, clear_draft?: boolean }
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: { reviewId: string } }
) {
  const supabase = createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Verify the user has access to this review's location
  const adminClient = createAdminClient()
  const { data: review } = await adminClient
    .from('reviews')
    .select('id, location_id')
    .eq('id', params.reviewId)
    .single()

  if (!review) {
    return NextResponse.json({ error: 'Review not found' }, { status: 404 })
  }

  const { data: access } = await supabase
    .from('locations')
    .select('id')
    .eq('id', review.location_id)
    .single()

  if (!access) {
    return NextResponse.json({ error: 'Access denied' }, { status: 403 })
  }

  const body = await request.json()
  const { status, clear_draft } = body

  const validStatuses = ['new', 'seen', 'flagged', 'responded', 'archived']
  if (!status || !validStatuses.includes(status)) {
    return NextResponse.json({ error: 'Invalid status' }, { status: 400 })
  }

  const update: Record<string, any> = { status }
  if (clear_draft) {
    update.ai_draft = null
    update.ai_draft_generated_at = null
  }

  await adminClient
    .from('reviews')
    .update(update)
    .eq('id', params.reviewId)

  return NextResponse.json({ ok: true })
}
