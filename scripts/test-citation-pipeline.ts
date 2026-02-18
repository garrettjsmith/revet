/**
 * Test script for BrightLocal citation pipeline logic.
 *
 * Run with: npx tsx scripts/test-citation-pipeline.ts
 *
 * Tests the core helper functions:
 *
 *   - normalizePhone() — strips formatting, country code
 *   - normalizeText() — lowercase, strips punctuation, collapses whitespace
 *   - determineListingStatus() — returns correct status based on NAP + citation state
 *   - buildRecommendation() — generates actionable text for mismatches
 */

export {} // isolate module scope

// ─── Replicate helpers from citation-sync/route.ts ─────────────

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

interface CTCitation {
  citation_id: number
  source: string
  url: string | null
  'citation-status': string
  status: string
  'domain-authority': string | null
  'site-type': string | null
  'listing-type': string | null
  'business-name': string | null
  address: string | null
  postcode: string | null
  telephone: string | null
  'date-identified': string | null
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

// ─── Test runner ────────────────────────────────────────────────

let passed = 0
let failed = 0

function assert(condition: boolean, label: string) {
  if (condition) {
    passed++
    console.log(`  PASS  ${label}`)
  } else {
    failed++
    console.error(`  FAIL  ${label}`)
  }
}

function assertEqual(actual: unknown, expected: unknown, label: string) {
  if (actual === expected) {
    passed++
    console.log(`  PASS  ${label}`)
  } else {
    failed++
    console.error(`  FAIL  ${label}`)
    console.error(`         expected: ${JSON.stringify(expected)}`)
    console.error(`         actual:   ${JSON.stringify(actual)}`)
  }
}

// ─── resolveRegion tests ────────────────────────────────────────

// Replicate resolveRegion from brightlocal.ts
const US_STATES: Record<string, string> = {
  AL: 'Alabama', AK: 'Alaska', AZ: 'Arizona', AR: 'Arkansas', CA: 'California',
  CO: 'Colorado', CT: 'Connecticut', DE: 'Delaware', FL: 'Florida', GA: 'Georgia',
  HI: 'Hawaii', ID: 'Idaho', IL: 'Illinois', IN: 'Indiana', IA: 'Iowa',
  KS: 'Kansas', KY: 'Kentucky', LA: 'Louisiana', ME: 'Maine', MD: 'Maryland',
  MA: 'Massachusetts', MI: 'Michigan', MN: 'Minnesota', MS: 'Mississippi', MO: 'Missouri',
  MT: 'Montana', NE: 'Nebraska', NV: 'Nevada', NH: 'New Hampshire', NJ: 'New Jersey',
  NM: 'New Mexico', NY: 'New York', NC: 'North Carolina', ND: 'North Dakota', OH: 'Ohio',
  OK: 'Oklahoma', OR: 'Oregon', PA: 'Pennsylvania', RI: 'Rhode Island', SC: 'South Carolina',
  SD: 'South Dakota', TN: 'Tennessee', TX: 'Texas', UT: 'Utah', VT: 'Vermont',
  VA: 'Virginia', WA: 'Washington', WV: 'West Virginia', WI: 'Wisconsin', WY: 'Wyoming',
  DC: 'District of Columbia',
}

function resolveRegion(state: string): { region?: string; region_code?: string } {
  const trimmed = state.trim()
  const upper = trimmed.toUpperCase()
  if (US_STATES[upper]) return { region: US_STATES[upper], region_code: upper }
  const entry = Object.entries(US_STATES).find(([, name]) => name.toLowerCase() === trimmed.toLowerCase())
  if (entry) return { region: entry[1], region_code: entry[0] }
  return { region: trimmed }
}

function assertDeepEqual(actual: unknown, expected: unknown, label: string) {
  const a = JSON.stringify(actual)
  const e = JSON.stringify(expected)
  if (a === e) {
    passed++
    console.log(`  PASS  ${label}`)
  } else {
    failed++
    console.error(`  FAIL  ${label}`)
    console.error(`         expected: ${e}`)
    console.error(`         actual:   ${a}`)
  }
}

console.log('\nresolveRegion:')
assertDeepEqual(resolveRegion('MA'), { region: 'Massachusetts', region_code: 'MA' }, 'abbreviation "MA" → full name + code')
assertDeepEqual(resolveRegion('ma'), { region: 'Massachusetts', region_code: 'MA' }, 'lowercase "ma" → full name + code')
assertDeepEqual(resolveRegion('Massachusetts'), { region: 'Massachusetts', region_code: 'MA' }, 'full name → same + code')
assertDeepEqual(resolveRegion('massachusetts'), { region: 'Massachusetts', region_code: 'MA' }, 'lowercase full name → resolved')
assertDeepEqual(resolveRegion('NY'), { region: 'New York', region_code: 'NY' }, 'abbreviation "NY"')
assertDeepEqual(resolveRegion('CA'), { region: 'California', region_code: 'CA' }, 'abbreviation "CA"')
assertDeepEqual(resolveRegion('Ontario'), { region: 'Ontario' }, 'non-US state → passthrough as region only')
assertDeepEqual(resolveRegion(' TX '), { region: 'Texas', region_code: 'TX' }, 'trimmed abbreviation')

// ─── normalizePhone tests ───────────────────────────────────────

console.log('\nnormalizePhone:')
assertEqual(normalizePhone('(555) 123-4567'), '5551234567', 'strips parens, spaces, dashes')
assertEqual(normalizePhone('+1-555-123-4567'), '5551234567', 'strips +1 country code')
assertEqual(normalizePhone('15551234567'), '5551234567', 'strips leading 1 from 11 digits')
assertEqual(normalizePhone('5551234567'), '5551234567', 'already clean 10 digits')
assertEqual(normalizePhone(null), '', 'null returns empty')
assertEqual(normalizePhone(''), '', 'empty returns empty')
assertEqual(normalizePhone('555.123.4567'), '5551234567', 'strips dots')

// ─── normalizeText tests ────────────────────────────────────────

console.log('\nnormalizeText:')
assertEqual(normalizeText("Joe's Pizza"), 'joes pizza', 'strips apostrophe, lowercases')
assertEqual(normalizeText('JOE\'S PIZZA'), 'joes pizza', 'uppercase normalized')
assertEqual(normalizeText('  Joe   Pizza  '), 'joe pizza', 'collapses whitespace, trims')
assertEqual(normalizeText('123 Main St.'), '123 main st', 'strips period')
assertEqual(normalizeText(null), '', 'null returns empty')
assertEqual(normalizeText(''), '', 'empty returns empty')
assertEqual(normalizeText('Acme, Inc.'), 'acme inc', 'strips comma and period')

// ─── determineListingStatus tests ───────────────────────────────

console.log('\ndetermineListingStatus:')

function makeCit(overrides: Partial<CTCitation> = {}): CTCitation {
  return {
    citation_id: 1,
    source: 'Yelp',
    url: 'https://yelp.com/biz/test',
    'citation-status': 'active',
    status: 'Got it',
    'domain-authority': null,
    'site-type': null,
    'listing-type': null,
    'business-name': "Joe's Pizza",
    address: '123 Main St',
    postcode: '10001',
    telephone: '(555) 123-4567',
    'date-identified': null,
    ...overrides,
  }
}

assertEqual(
  determineListingStatus(makeCit(), true),
  'found',
  'active listing with correct NAP → found'
)

assertEqual(
  determineListingStatus(makeCit(), false),
  'action_needed',
  'active listing with incorrect NAP → action_needed'
)

assertEqual(
  determineListingStatus(makeCit({ 'citation-status': 'possible', url: null }), true),
  'not_listed',
  'possible status + no URL → not_listed (even with correct NAP)'
)

assertEqual(
  determineListingStatus(makeCit({ 'citation-status': 'pending', url: null }), false),
  'not_listed',
  'pending status + no URL → not_listed (even with incorrect NAP)'
)

assertEqual(
  determineListingStatus(makeCit({ 'citation-status': 'possible', url: 'https://example.com' }), false),
  'action_needed',
  'possible status + has URL + incorrect NAP → action_needed'
)

assertEqual(
  determineListingStatus(makeCit({ 'citation-status': 'possible', url: 'https://example.com' }), true),
  'found',
  'possible status + has URL + correct NAP → found'
)

// ─── buildRecommendation tests ──────────────────────────────────

console.log('\nbuildRecommendation:')

assertEqual(
  buildRecommendation(makeCit({ url: null, 'citation-status': 'possible' }), false, "Joe's Pizza", '5551234567'),
  "Not listed on Yelp. Submit business listing to improve citation coverage.",
  'not live → recommendation to submit'
)

assertEqual(
  buildRecommendation(makeCit(), true, "Joe's Pizza", '(555) 123-4567'),
  null,
  'matching NAP (normalized) → no recommendation'
)

assertEqual(
  buildRecommendation(makeCit({ 'business-name': 'Joes Pizza LLC' }), true, "Joe's Pizza", '(555) 123-4567'),
  'Incorrect business name on Yelp. Update the listing to match current business information.',
  'mismatched name → name recommendation'
)

assertEqual(
  buildRecommendation(makeCit({ telephone: '(999) 999-9999' }), true, "Joe's Pizza", '(555) 123-4567'),
  'Incorrect phone number on Yelp. Update the listing to match current business information.',
  'mismatched phone → phone recommendation'
)

assertEqual(
  buildRecommendation(makeCit({ 'business-name': 'Wrong Name', telephone: '9999999999' }), true, "Joe's Pizza", '(555) 123-4567'),
  'Incorrect business name, phone number on Yelp. Update the listing to match current business information.',
  'both wrong → combined recommendation'
)

// ─── End-to-end: full pipeline simulation ──────────────────────

console.log('\nEnd-to-end pipeline simulation:')

const expectedName = "Joe's Pizza"
const expectedAddress = '123 Main St, New York, NY, 10001'
const expectedPhone = '(555) 123-4567'

const testCitations: CTCitation[] = [
  // Correct listing
  makeCit({ source: 'Yelp', 'business-name': "Joe's Pizza", telephone: '555-123-4567', address: '123 Main St, New York, NY, 10001' }),
  // Incorrect name
  makeCit({ source: 'Facebook', 'business-name': 'JOES PIZZA INC', telephone: '555-123-4567', address: '123 Main St, New York, NY, 10001' }),
  // Incorrect phone
  makeCit({ source: 'YellowPages', 'business-name': "Joe's Pizza", telephone: '(555) 999-0000', address: '123 Main St, New York, NY, 10001' }),
  // Not listed
  makeCit({ source: 'Foursquare', 'citation-status': 'possible', url: null, 'business-name': null, telephone: null, address: null }),
]

let correct = 0
let incorrect = 0
let missing = 0

for (const cit of testCitations) {
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

  const status = determineListingStatus(cit, napCorrect)

  // Verify each citation gets the right status
  if (cit.source === 'Yelp') {
    assertEqual(status, 'found', 'Yelp (correct NAP) → found')
    assert(napCorrect === true, 'Yelp NAP is correct')
  } else if (cit.source === 'Facebook') {
    assertEqual(status, 'action_needed', 'Facebook (wrong name) → action_needed')
    assert(napCorrect === false, 'Facebook NAP is incorrect (name mismatch)')
    assert(nameMatch === false, 'Facebook name does not match')
  } else if (cit.source === 'YellowPages') {
    assertEqual(status, 'action_needed', 'YellowPages (wrong phone) → action_needed')
    assert(napCorrect === false, 'YellowPages NAP is incorrect (phone mismatch)')
    assert(phoneMatch === false, 'YellowPages phone does not match')
  } else if (cit.source === 'Foursquare') {
    assertEqual(status, 'not_listed', 'Foursquare (not active, no URL) → not_listed')
  }
}

assertEqual(correct, 1, 'pipeline: 1 correct')
assertEqual(incorrect, 2, 'pipeline: 2 incorrect')
assertEqual(missing, 1, 'pipeline: 1 missing')

// ─── Summary ────────────────────────────────────────────────────

console.log(`\n${'─'.repeat(50)}`)
console.log(`Results: ${passed} passed, ${failed} failed`)

if (failed > 0) {
  process.exit(1)
} else {
  console.log('All tests passed!')
}
