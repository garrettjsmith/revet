import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

/**
 * POST /api/agency/work-queue/assign
 *
 * Assigns a work queue item to a team member.
 * Body: { item_id: string, item_type: string, assigned_to: string | null }
 *
 * Supports:
 *   - review_reply / ai_draft_review → updates reviews.assigned_to
 *   - post_pending → updates gbp_post_queue.assigned_to
 */
export async function POST(request: NextRequest) {
  const supabase = createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { data: adminCheck } = await supabase
    .from('org_members')
    .select('is_agency_admin')
    .eq('user_id', user.id)
    .eq('is_agency_admin', true)
    .limit(1)

  if (!adminCheck || adminCheck.length === 0) {
    return NextResponse.json({ error: 'Agency admin required' }, { status: 403 })
  }

  const body = await request.json()
  const { item_id, item_type, assigned_to } = body as {
    item_id: string
    item_type: string
    assigned_to: string | null
  }

  if (!item_id || !item_type) {
    return NextResponse.json({ error: 'item_id and item_type are required' }, { status: 400 })
  }

  const adminClient = createAdminClient()

  if (item_type === 'review_reply' || item_type === 'ai_draft_review') {
    const { error } = await adminClient
      .from('reviews')
      .update({ assigned_to })
      .eq('id', item_id)

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
  } else if (item_type === 'post_pending') {
    const { error } = await adminClient
      .from('gbp_post_queue')
      .update({ assigned_to })
      .eq('id', item_id)

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
  } else {
    return NextResponse.json({ error: 'Assignment not supported for this item type' }, { status: 400 })
  }

  return NextResponse.json({ ok: true, assigned_to })
}
