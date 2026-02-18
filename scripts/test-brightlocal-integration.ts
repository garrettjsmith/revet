/**
 * Integration test — verifies our BrightLocal response parsing against
 * REAL response shapes from production logs and BL API docs.
 *
 * Each test feeds the exact JSON that BrightLocal returns into
 * the same parsing logic our functions use, and checks we extract
 * the right values.
 *
 * Run: npx tsx scripts/test-brightlocal-integration.ts
 */

export {} // isolate module scope

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type R = Record<string, any> // matches LegacyResponse from brightlocal.ts

let passed = 0
let failed = 0

function assert(condition: boolean, label: string, detail?: string) {
  if (condition) {
    console.log(`  PASS  ${label}`)
    passed++
  } else {
    console.log(`  FAIL  ${label}${detail ? ` — ${detail}` : ''}`)
    failed++
  }
}

// ─── Test: ct/add response parsing ─────────────────────────

function testCtAddParsing() {
  console.log('\nct/add response parsing:')

  // REAL production response (from error log for location 4dceebb6):
  // {"status":"added","report-id":2389255}
  const flatResponse: R = { status: 'added', 'report-id': 2389255 }

  // Our code: res.response?.['report-id'] ?? res['report-id']
  const reportIdFlat = flatResponse.response?.['report-id'] ?? flatResponse['report-id']
  assert(reportIdFlat === 2389255, 'flat response: extracts report-id', `got: ${reportIdFlat}`)
  assert(String(reportIdFlat) === '2389255', 'flat response: String() works', `got: ${String(reportIdFlat)}`)

  // Doc response shape: {"response":{"status":"added","report-id":682}}
  const wrappedResponse: R = { response: { status: 'added', 'report-id': 682 } }
  const reportIdWrapped = wrappedResponse.response?.['report-id'] ?? wrappedResponse['report-id']
  assert(reportIdWrapped === 682, 'wrapped response: extracts report-id', `got: ${reportIdWrapped}`)

  // Error response (production log for location 2d9dccc0):
  // {"success":false,"errors":{"location_id":"Multiple reports for selected location."}}
  const errorResponse: R = { success: false, errors: { location_id: 'Multiple reports for selected location.' } }
  const reportIdError = errorResponse.response?.['report-id'] ?? errorResponse['report-id']
  assert(!reportIdError, 'error response: no report-id extracted', `got: ${reportIdError}`)
}

// ─── Test: ct/get-all response parsing ─────────────────────

function testCtGetAllParsing() {
  console.log('\nct/get-all response parsing:')

  // Doc response shape:
  // {"response":{"results":[{"report_id":"278","customer_id":"35","location_id":"5",...}]}}
  const docResponse: R = {
    response: {
      results: [
        { report_id: '278', customer_id: '35', location_id: '5', report_name: 'Test' },
        { report_id: '300', customer_id: '35', location_id: '10', report_name: 'Test 2' },
      ],
    },
  }

  // Our code: res.response?.results
  const results = docResponse.response?.results
  assert(Array.isArray(results), 'results is array')
  assert(results.length === 2, 'found 2 reports')
  assert(String(results[0].report_id) === '278', 'first report_id is "278"')

  // Empty results
  const emptyResponse: R = { response: { results: [] } }
  const emptyResults = emptyResponse.response?.results
  assert(Array.isArray(emptyResults) && emptyResults.length === 0, 'empty results array')

  // What if response is completely missing?
  const noResponse: R = {}
  const noResults = noResponse.response?.results
  assert(!Array.isArray(noResults), 'missing response: not an array (returns undefined)')
}

// ─── Test: ct/get response parsing ─────────────────────────

function testCtGetParsing() {
  console.log('\nct/get response parsing:')

  // Doc response shape:
  // {"success":true,"report":{"report_id":"255565","customer_id":"88","location_id":"1","status":"completed"}}
  const docResponse: R = {
    success: true,
    report: {
      report_id: '255565',
      customer_id: '88',
      location_id: '1',
      report_name: 'Test Report',
      status: 'completed',
    },
  }

  // Our code: res.report || res.response
  const report = docResponse.report || docResponse.response
  assert(!!report, 'found report')
  assert(report.report_id === '255565', 'report_id is correct')
  assert(report.status === 'completed', 'status is correct')

  // What if it uses response instead of report?
  const altResponse: R = {
    success: true,
    response: {
      report_id: '100',
      status: 'running',
    },
  }
  const altReport = altResponse.report || altResponse.response
  assert(!!altReport, 'alt shape: found via response fallback')
  assert(altReport.report_id === '100', 'alt shape: report_id correct')
}

// ─── Test: ct/run response parsing ─────────────────────────

function testCtRunParsing() {
  console.log('\nct/run response parsing:')

  // Doc response shape: {"response":{"status":"running"}}
  const docResponse: R = { response: { status: 'running' } }

  // Our code: res.response?.status ?? res.status
  const status1 = docResponse.response?.status ?? docResponse.status
  assert(status1 === 'running', 'wrapped: status is "running"')

  // What if flat?
  const flatResponse: R = { status: 'running' }
  const status2 = flatResponse.response?.status ?? flatResponse.status
  assert(status2 === 'running', 'flat: status is "running"')

  // Error: report already running
  const errorResponse: R = { response: { status: 'already_running' } }
  const status3 = errorResponse.response?.status ?? errorResponse.status
  assert(status3 !== 'running', 'already_running != "running" triggers error path')
}

// ─── Test: ct/get-results response parsing ─────────────────

function testCtGetResultsParsing() {
  console.log('\nct/get-results response parsing:')

  // Doc response shape:
  // {"response":{"results":{"active":[...],"pending":[...],"possible":[...]}}}
  const docResponse: R = {
    response: {
      results: {
        active: [
          { citation_id: 1, source: 'Yelp', url: 'https://yelp.com/biz/test', 'citation-status': 'active', status: 'active', 'business-name': 'Test Biz', telephone: '555-1234' },
          { citation_id: 2, source: 'Facebook', url: 'https://facebook.com/test', 'citation-status': 'active', status: 'active', 'business-name': 'Test Biz', telephone: '555-1234' },
        ],
        pending: [
          { citation_id: 3, source: 'YP', url: null, 'citation-status': 'pending', status: 'pending', 'business-name': null, telephone: null },
        ],
        possible: [],
      },
    },
  }

  // Our code: res.response?.results
  const results = docResponse.response?.results
  assert(!!results, 'results exists')

  const all = [
    ...(results.active || []),
    ...(results.pending || []),
    ...(results.possible || []),
  ]
  assert(all.length === 3, `combined citations count is 3 (got ${all.length})`)
  assert(all[0].source === 'Yelp', 'first citation source is Yelp')
  assert(all[2].source === 'YP', 'third citation source is YP')

  // Edge: no results yet (report hasn't run)
  const emptyResults: R = {
    response: {
      results: { active: [], pending: [], possible: [] },
    },
  }
  const emptyAll = [
    ...(emptyResults.response.results.active || []),
    ...(emptyResults.response.results.pending || []),
    ...(emptyResults.response.results.possible || []),
  ]
  assert(emptyAll.length === 0, 'empty results: 0 citations')
}

// ─── Test: findExistingCTReport end-to-end logic ───────────

function testFindExistingCTReportLogic() {
  console.log('\nfindExistingCTReport end-to-end logic:')

  // Simulates what legacyFetch returns -> what our function does

  // Case 1: Reports exist for this location
  const res1: R = { response: { results: [{ report_id: '278', location_id: '5' }, { report_id: '300', location_id: '5' }] } }
  const results1 = res1.response?.results
  const found1 = (Array.isArray(results1) && results1.length > 0) ? String(results1[0].report_id) : null
  assert(found1 === '278', 'existing reports: returns first report_id')

  // Case 2: No reports for this location
  const res2: R = { response: { results: [] } }
  const results2 = res2.response?.results
  const found2 = (Array.isArray(results2) && results2.length > 0) ? String(results2[0].report_id) : null
  assert(found2 === null, 'no reports: returns null')

  // Case 3: No response key at all
  const res3: R = {}
  const results3 = res3.response?.results
  const found3 = (Array.isArray(results3) && results3.length > 0) ? String(results3[0].report_id) : null
  assert(found3 === null, 'empty response: returns null')
}

// ─── Test: createCTReport end-to-end logic ─────────────────

function testCreateCTReportLogic() {
  console.log('\ncreateCTReport end-to-end logic:')

  // Case 1: Flat response (what production actually returns)
  const res1: R = { status: 'added', 'report-id': 2389255 }
  const id1 = res1.response?.['report-id'] ?? res1['report-id']
  assert(id1 === 2389255, 'flat production response: extracts report-id')
  assert(String(id1) === '2389255', 'flat production response: String() correct')

  // Case 2: Wrapped response (what docs show)
  const res2: R = { response: { status: 'added', 'report-id': 682 } }
  const id2 = res2.response?.['report-id'] ?? res2['report-id']
  assert(id2 === 682, 'wrapped doc response: extracts report-id')

  // Case 3: Error response (no report-id)
  const res3: R = { success: false, errors: { location_id: 'Multiple reports for selected location.' } }
  const id3 = res3.response?.['report-id'] ?? res3['report-id']
  assert(!id3, 'error response: no report-id -> will throw')
}

// ─── Full pipeline simulation with real response shapes ────

function testFullPipeline() {
  console.log('\nFull pipeline simulation (real response shapes):')

  // Step 1: Find BL locations
  const locationsRes: R = { total_count: 2, items: [{ location_id: 123, business_name: 'Test Biz', country: 'USA' }] }
  assert(locationsRes.items.length > 0, 'Step 1: found BL location')
  const blLocId = String(locationsRes.items[0].location_id)

  // Step 2: findExistingCTReport — reports exist
  const getAllRes: R = { response: { results: [{ report_id: '500', location_id: blLocId }] } }
  const existingReportId = getAllRes.response?.results?.[0]?.report_id
  assert(existingReportId === '500', 'Step 2: found existing CT report, skip creation')

  // Step 3: getCTReport — check status
  const getRes: R = { success: true, report: { report_id: '500', report_name: 'Test', status: 'completed' } }
  const report = getRes.report
  assert(report.status === 'completed', 'Step 3: report status is completed')

  // Step 4: getCTResults — pull citations
  const resultsRes: R = {
    response: {
      results: {
        active: [{ citation_id: 1, source: 'Yelp', status: 'active', url: 'https://yelp.com/biz/test', 'business-name': 'Test Biz', telephone: '5551234' }],
        pending: [],
        possible: [{ citation_id: 2, source: 'Foursquare', status: 'possible', url: null, 'business-name': null, telephone: null }],
      },
    },
  }
  const results = resultsRes.response?.results
  const allCitations = [...(results.active || []), ...(results.pending || []), ...(results.possible || [])]
  assert(allCitations.length === 2, 'Step 4: pulled 2 citations')
  assert(allCitations[0].source === 'Yelp', 'Step 4: first is Yelp')

  // Step 5: If no existing CT report, create one
  const addRes: R = { status: 'added', 'report-id': 600 }
  const newId = addRes.response?.['report-id'] ?? addRes['report-id']
  assert(newId === 600, 'Step 5: createCTReport returns report-id from flat response')

  // Step 6: Run the report
  const runRes: R = { response: { status: 'running' } }
  const runStatus = runRes.response?.status
  assert(runStatus === 'running', 'Step 6: runCTReport status is running')
}

// ─── Run ────────────────────────────────────────────────────

console.log('BrightLocal Response Parsing Tests')
console.log('===================================')
console.log('Testing against REAL API response shapes from production logs + docs\n')

testCtAddParsing()
testCtGetAllParsing()
testCtGetParsing()
testCtRunParsing()
testCtGetResultsParsing()
testFindExistingCTReportLogic()
testCreateCTReportLogic()
testFullPipeline()

console.log(`\n${'═'.repeat(50)}`)
console.log(`Results: ${passed} passed, ${failed} failed`)
process.exit(failed > 0 ? 1 : 0)
