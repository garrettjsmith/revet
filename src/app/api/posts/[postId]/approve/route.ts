import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { sendEmail, buildPostReviewEmail } from '@/lib/email'

/**
 * POST /api/posts/[postId]/approve
 *
 * Advances a post through the approval pipeline.
 *
 * Actions:
 *   agency_approve  — draft → client_review (sends email to client)
 *   client_approve  — client_review → pending (ready for scheduled posting)
 *   reject          — any → rejected
 *   edit            — updates summary text (stays in current status)
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { postId: string } }
) {
  const supabase = createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json()
  const { action, summary } = body as {
    action: 'agency_approve' | 'client_approve' | 'reject' | 'edit'
    summary?: string
  }

  if (!action) {
    return NextResponse.json({ error: 'Action required' }, { status: 400 })
  }

  const adminClient = createAdminClient()

  // Get the post with location + org info
  const { data: post } = await adminClient
    .from('gbp_post_queue')
    .select('*, locations(name, org_id, organizations(name, slug))')
    .eq('id', params.postId)
    .single()

  if (!post) {
    return NextResponse.json({ error: 'Post not found' }, { status: 404 })
  }

  // Verify user has access to this location
  const { data: access } = await supabase
    .from('locations')
    .select('id')
    .eq('id', post.location_id)
    .single()

  if (!access) {
    return NextResponse.json({ error: 'Access denied' }, { status: 403 })
  }

  switch (action) {
    case 'agency_approve': {
      if (post.status !== 'draft') {
        return NextResponse.json({ error: 'Post is not in draft status' }, { status: 400 })
      }

      await adminClient
        .from('gbp_post_queue')
        .update({ status: 'client_review' })
        .eq('id', params.postId)

      // Send review email to org members
      const loc = post.locations as any
      const org = loc?.organizations
      if (org) {
        const { data: members } = await adminClient
          .from('org_members')
          .select('user_id, auth_users:user_id(email)')
          .eq('org_id', loc.org_id)
          .eq('is_agency_admin', false)

        const emails = (members || [])
          .map((m: any) => m.auth_users?.email)
          .filter(Boolean)

        if (emails.length > 0) {
          const reviewUrl = `${process.env.NEXT_PUBLIC_BASE_URL || 'https://app.revet.app'}/admin/${org.slug}/posts/review`

          const html = buildPostReviewEmail({
            orgName: org.name,
            locationName: loc.name,
            postSummary: post.summary,
            mediaUrl: post.media_url,
            scheduledFor: post.scheduled_for,
            reviewUrl,
          })

          await sendEmail({
            to: emails,
            subject: `Posts ready for review — ${loc.name}`,
            html,
          })
        }
      }

      return NextResponse.json({ ok: true, status: 'client_review' })
    }

    case 'client_approve': {
      if (post.status !== 'client_review') {
        return NextResponse.json({ error: 'Post is not pending client review' }, { status: 400 })
      }

      await adminClient
        .from('gbp_post_queue')
        .update({ status: 'pending' })
        .eq('id', params.postId)

      return NextResponse.json({ ok: true, status: 'pending' })
    }

    case 'reject': {
      await adminClient
        .from('gbp_post_queue')
        .update({ status: 'rejected' })
        .eq('id', params.postId)

      return NextResponse.json({ ok: true, status: 'rejected' })
    }

    case 'edit': {
      if (!summary || typeof summary !== 'string' || summary.trim().length === 0) {
        return NextResponse.json({ error: 'Summary required for edit' }, { status: 400 })
      }

      await adminClient
        .from('gbp_post_queue')
        .update({ summary: summary.trim() })
        .eq('id', params.postId)

      return NextResponse.json({ ok: true })
    }

    default:
      return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
  }
}
