import { SupabaseClient } from '@supabase/supabase-js'
import { getCTReport, getCTResults, type CTCitation } from '@/lib/brightlocal'

/**
 * Check if a running BrightLocal CT report has completed, and if so,
 * pull results into citation_listings and mark the audit as completed.
 *
 * Returns true if results were pulled, false if the report isn't done yet.
 */
export async function pullAuditResults(
  supabase: SupabaseClient,
  audit: { id: string; brightlocal_report_id: string; location_id: string },
): Promise<boolean> {
  const report = await getCTReport(audit.brightlocal_report_id)
  const status = report.status.toLowerCase()
  if (status !== 'complete' && status !== 'completed') return false

  const citations = await getCTResults(audit.brightlocal_report_id)

  // Get location's expected NAP for comparison
  const { data: location } = await supabase
    .from('locations')
    .select('name, phone, address_line1, city, state, postal_code')
    .eq('id', audit.location_id)
    .single()

  const expectedName = location?.name || ''
  const expectedAddress = [location?.address_line1, location?.city, location?.state, location?.postal_code]
    .filter(Boolean)
    .join(', ')
  const expectedPhone = location?.phone || ''

  let correct = 0
  let incorrect = 0
  let missing = 0

  for (const cit of citations) {
    const citStatus = cit['citation-status']
    const isLive = citStatus === 'active'
    const hasListing = !!cit.url

    const nameMatch = !cit['business-name'] || normalizeText(cit['business-name']) === normalizeText(expectedName)
    const phoneMatch = !cit.telephone || normalizePhone(cit.telephone) === normalizePhone(expectedPhone)
    const addressMatch = !cit.address || normalizeText(cit.address) === normalizeText(expectedAddress)
    const napCorrect = nameMatch && phoneMatch && addressMatch

    if (!isLive && !hasListing) {
      missing++
    } else if (napCorrect) {
      correct++
    } else {
      incorrect++
    }

    const listingStatus = determineListingStatus(cit, napCorrect)

    await supabase
      .from('citation_listings')
      .upsert(
        {
          location_id: audit.location_id,
          audit_id: audit.id,
          directory_name: cit.source,
          directory_url: null,
          listing_url: cit.url,
          expected_name: expectedName,
          expected_address: expectedAddress,
          expected_phone: expectedPhone,
          found_name: cit['business-name'],
          found_address: cit.address,
          found_phone: cit.telephone,
          nap_correct: napCorrect,
          name_match: nameMatch,
          address_match: addressMatch,
          phone_match: phoneMatch,
          status: listingStatus,
          ai_recommendation: buildRecommendation(cit, isLive || hasListing, expectedName, expectedPhone),
          last_checked_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'location_id,directory_name' }
      )
  }

  await supabase
    .from('citation_audits')
    .update({
      status: 'completed',
      total_found: citations.length,
      total_correct: correct,
      total_incorrect: incorrect,
      total_missing: missing,
      completed_at: new Date().toISOString(),
    })
    .eq('id', audit.id)

  return true
}

// ─── Helpers ─────────────────────────────────────────────────

function normalizePhone(phone: string | null | undefined): string {
  if (!phone) return ''
  const digits = phone.replace(/\D/g, '')
  if (digits.length === 11 && digits.startsWith('1')) return digits.slice(1)
  return digits
}

function normalizeText(text: string | null | undefined): string {
  if (!text) return ''
  return text.toLowerCase().replace(/[^\w\s]/g, '').replace(/\s+/g, ' ').trim()
}

function determineListingStatus(cit: CTCitation, napCorrect: boolean): string {
  const citStatus = cit['citation-status']
  const hasListing = !!cit.url
  if (citStatus !== 'active' && !hasListing) return 'not_listed'
  if (!napCorrect) return 'action_needed'
  return 'found'
}

function buildRecommendation(
  cit: CTCitation,
  isLive: boolean,
  expectedName: string,
  expectedPhone: string,
): string | null {
  if (!isLive) {
    return `Not listed on ${cit.source}. Submit business listing to improve citation coverage.`
  }

  const issues: string[] = []
  if (cit['business-name'] && normalizeText(cit['business-name']) !== normalizeText(expectedName)) issues.push('business name')
  if (cit.telephone && normalizePhone(cit.telephone) !== normalizePhone(expectedPhone)) issues.push('phone number')

  if (issues.length === 0) return null

  return `Incorrect ${issues.join(', ')} on ${cit.source}. Update the listing to match current business information.`
}
