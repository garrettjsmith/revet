import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { checkAgencyAdmin } from '@/lib/locations'
import {
  updateGBPProfile,
  fetchGBPProfile,
  normalizeGBPProfile,
} from '@/lib/google/profiles'
import { getValidAccessToken, GoogleAuthError } from '@/lib/google/auth'
import type { GBPProfileRaw } from '@/lib/google/profiles'
import { sendEmail, buildProfileRecommendationEmail } from '@/lib/email'

/**
 * GET /api/locations/[locationId]/recommendations
 *
 * List recommendations for a location. Grouped by batch.
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

  const adminClient = createAdminClient()
  const status = new URL(request.url).searchParams.get('status')

  let query = adminClient
    .from('profile_recommendations')
    .select('*')
    .eq('location_id', params.locationId)
    .order('created_at', { ascending: false })

  if (status) {
    query = query.eq('status', status)
  }

  const { data: recs, error } = await query

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ recommendations: recs || [] })
}

/**
 * POST /api/locations/[locationId]/recommendations
 *
 * Actions on recommendations: approve, reject, edit, apply
 * Body: { action, recommendation_id, edited_value? }
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { locationId: string } }
) {
  const isAdmin = await checkAgencyAdmin()
  if (!isAdmin) {
    return NextResponse.json({ error: 'Agency admin required' }, { status: 403 })
  }

  const supabase = createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json()
  const { action, recommendation_id, edited_value } = body

  if (!action || !recommendation_id) {
    return NextResponse.json({ error: 'action and recommendation_id required' }, { status: 400 })
  }

  const adminClient = createAdminClient()

  // Fetch the recommendation
  const { data: rec } = await adminClient
    .from('profile_recommendations')
    .select('*')
    .eq('id', recommendation_id)
    .eq('location_id', params.locationId)
    .single()

  if (!rec) {
    return NextResponse.json({ error: 'Recommendation not found' }, { status: 404 })
  }

  switch (action) {
    case 'approve': {
      // AM approves — if requires_client_approval, send to client; otherwise apply
      const now = new Date().toISOString()
      const finalValue = edited_value !== undefined ? edited_value : null

      if (rec.requires_client_approval) {
        // Save edit if provided, move to client_review
        await adminClient
          .from('profile_recommendations')
          .update({
            status: 'client_review',
            edited_value: finalValue,
            approved_by: user.id,
            approved_at: now,
          })
          .eq('id', recommendation_id)

        // Send email to client org members
        await sendClientApprovalEmail(adminClient, params.locationId, rec, finalValue)

        return NextResponse.json({ ok: true, status: 'client_review' })
      } else {
        // Apply directly
        await adminClient
          .from('profile_recommendations')
          .update({
            status: 'approved',
            edited_value: finalValue,
            approved_by: user.id,
            approved_at: now,
          })
          .eq('id', recommendation_id)

        // Apply to Google
        const applied = await applyRecommendation(adminClient, params.locationId, rec, finalValue)

        if (applied.error) {
          return NextResponse.json({ ok: false, error: applied.error }, { status: 500 })
        }

        return NextResponse.json({ ok: true, status: 'applied' })
      }
    }

    case 'approve_batch': {
      // Approve all pending recs in this batch
      const { batch_id } = body
      if (!batch_id) {
        return NextResponse.json({ error: 'batch_id required' }, { status: 400 })
      }

      const { data: batchRecs } = await adminClient
        .from('profile_recommendations')
        .select('*')
        .eq('batch_id', batch_id)
        .eq('location_id', params.locationId)
        .eq('status', 'pending')

      if (!batchRecs || batchRecs.length === 0) {
        return NextResponse.json({ error: 'No pending recommendations in batch' }, { status: 404 })
      }

      const now = new Date().toISOString()
      const results: { id: string; status: string; error?: string }[] = []

      for (const r of batchRecs) {
        if (r.requires_client_approval) {
          await adminClient
            .from('profile_recommendations')
            .update({ status: 'client_review', approved_by: user.id, approved_at: now })
            .eq('id', r.id)
          results.push({ id: r.id, status: 'client_review' })
        } else {
          await adminClient
            .from('profile_recommendations')
            .update({ status: 'approved', approved_by: user.id, approved_at: now })
            .eq('id', r.id)

          const applied = await applyRecommendation(adminClient, params.locationId, r, null)
          results.push({ id: r.id, status: applied.error ? 'error' : 'applied', error: applied.error })
        }
      }

      // Send client emails for any client_review items
      const clientReviewRecs = batchRecs.filter((r) => r.requires_client_approval)
      if (clientReviewRecs.length > 0) {
        await sendClientApprovalEmail(adminClient, params.locationId, clientReviewRecs[0], null)
      }

      return NextResponse.json({ ok: true, results })
    }

    case 'reject': {
      await adminClient
        .from('profile_recommendations')
        .update({ status: 'rejected' })
        .eq('id', recommendation_id)

      return NextResponse.json({ ok: true, status: 'rejected' })
    }

    case 'edit': {
      // Save an edit without approving yet
      if (edited_value === undefined) {
        return NextResponse.json({ error: 'edited_value required for edit action' }, { status: 400 })
      }

      // Store as AI correction for learning
      const originalText = typeof rec.proposed_value === 'string'
        ? rec.proposed_value
        : JSON.stringify(rec.proposed_value)
      const correctedText = typeof edited_value === 'string'
        ? edited_value
        : JSON.stringify(edited_value)

      if (originalText !== correctedText) {
        const { data: locationData } = await adminClient
          .from('locations')
          .select('org_id')
          .eq('id', params.locationId)
          .single()

        if (locationData) {
          await adminClient.from('ai_corrections').insert({
            org_id: locationData.org_id,
            location_id: params.locationId,
            field: rec.field,
            original_text: originalText,
            corrected_text: correctedText,
            context: { recommendation_id, batch_id: rec.batch_id },
          })
        }
      }

      await adminClient
        .from('profile_recommendations')
        .update({ edited_value })
        .eq('id', recommendation_id)

      return NextResponse.json({ ok: true })
    }

    case 'client_approve': {
      // Client approves — apply to Google
      if (rec.status !== 'client_review') {
        return NextResponse.json({ error: 'Recommendation not in client_review status' }, { status: 400 })
      }

      const applied = await applyRecommendation(
        adminClient,
        params.locationId,
        rec,
        rec.edited_value
      )

      if (applied.error) {
        return NextResponse.json({ ok: false, error: applied.error }, { status: 500 })
      }

      return NextResponse.json({ ok: true, status: 'applied' })
    }

    case 'client_reject': {
      // Client rejects — back to pending for AM to revise
      if (rec.status !== 'client_review') {
        return NextResponse.json({ error: 'Recommendation not in client_review status' }, { status: 400 })
      }

      await adminClient
        .from('profile_recommendations')
        .update({ status: 'pending', approved_by: null, approved_at: null })
        .eq('id', recommendation_id)

      return NextResponse.json({ ok: true, status: 'pending' })
    }

    default:
      return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 })
  }
}

// ─── Apply recommendation to Google ─────────────────────────

async function applyRecommendation(
  adminClient: ReturnType<typeof createAdminClient>,
  locationId: string,
  rec: { id: string; field: string; proposed_value: unknown },
  editedValue: unknown | null
): Promise<{ error?: string }> {
  // Hours recommendations are informational only (can't auto-apply)
  if (rec.field === 'hours') {
    await adminClient
      .from('profile_recommendations')
      .update({ status: 'applied', applied_at: new Date().toISOString() })
      .eq('id', rec.id)
    return {}
  }

  try {
    await getValidAccessToken()
  } catch (err) {
    if (err instanceof GoogleAuthError) {
      return { error: 'Google connection required' }
    }
    return { error: 'Google auth error' }
  }

  const { data: profile } = await adminClient
    .from('gbp_profiles')
    .select('gbp_location_name')
    .eq('location_id', locationId)
    .single()

  if (!profile) {
    return { error: 'No GBP profile found' }
  }

  const value = editedValue !== null && editedValue !== undefined ? editedValue : rec.proposed_value

  try {
    const fields: Partial<GBPProfileRaw> = {}
    const updateMaskParts: string[] = []

    if (rec.field === 'description') {
      fields.profile = { description: value as string }
      updateMaskParts.push('profile.description')
    } else if (rec.field === 'categories') {
      // value is an array of category display names — add as additional categories
      const catNames = value as string[]
      fields.categories = {
        additionalCategories: catNames.map((name) => ({
          name: `categories/${name.toLowerCase().replace(/\s+/g, '_')}`,
          displayName: name,
        })),
      }
      updateMaskParts.push('categories')
    }

    if (updateMaskParts.length > 0) {
      await updateGBPProfile(
        profile.gbp_location_name,
        fields,
        updateMaskParts.join(',')
      )

      // Re-fetch and update local DB
      const raw = await fetchGBPProfile(profile.gbp_location_name)
      const normalized = normalizeGBPProfile(raw)

      await adminClient
        .from('gbp_profiles')
        .update({
          ...normalized,
          last_pushed_at: new Date().toISOString(),
          last_synced_at: new Date().toISOString(),
          sync_status: 'active',
          sync_error: null,
        })
        .eq('location_id', locationId)
    }

    // Mark as applied
    await adminClient
      .from('profile_recommendations')
      .update({ status: 'applied', applied_at: new Date().toISOString() })
      .eq('id', rec.id)

    // Check if all recs in batch are resolved — update setup_status
    const { data: remaining } = await adminClient
      .from('profile_recommendations')
      .select('id')
      .eq('location_id', locationId)
      .in('status', ['pending', 'approved', 'client_review'])

    if (!remaining || remaining.length === 0) {
      await adminClient
        .from('locations')
        .update({ setup_status: 'optimized' })
        .eq('id', locationId)
    } else {
      await adminClient
        .from('locations')
        .update({ setup_status: 'optimizing' })
        .eq('id', locationId)
    }

    return {}
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    console.error('[recommendations] Apply failed:', message)
    return { error: message }
  }
}

// ─── Client approval email ──────────────────────────────────

async function sendClientApprovalEmail(
  adminClient: ReturnType<typeof createAdminClient>,
  locationId: string,
  rec: { field: string; proposed_value: unknown; edited_value?: unknown },
  editedValue: unknown | null
) {
  const { data: location } = await adminClient
    .from('locations')
    .select('name, org_id, organizations(name, slug)')
    .eq('id', locationId)
    .single()

  if (!location) return

  const org = (location as any).organizations
  const orgSlug = org?.slug || ''

  // Get non-agency org members to email
  const { data: members } = await adminClient
    .from('org_members')
    .select('user_id, users:user_id(email)')
    .eq('org_id', location.org_id)
    .eq('is_agency_admin', false)

  if (!members || members.length === 0) return

  const emails = members
    .map((m: any) => m.users?.email)
    .filter(Boolean) as string[]

  if (emails.length === 0) return

  const value = editedValue || rec.edited_value || rec.proposed_value
  const reviewUrl = `${process.env.NEXT_PUBLIC_APP_URL || 'https://app.revet.app'}/admin/${orgSlug}/locations/${locationId}/recommendations`

  const html = buildProfileRecommendationEmail({
    locationName: location.name,
    orgName: org?.name || '',
    field: rec.field,
    proposedValue: typeof value === 'string' ? value : JSON.stringify(value),
    reviewUrl,
  })

  await sendEmail({
    to: emails,
    subject: `Profile update ready for review — ${location.name}`,
    html,
  })
}
