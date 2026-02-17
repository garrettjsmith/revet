# Revet Sprint Plan — Full Platform Audit + Build

Based on a full-codebase audit by two reviewers: a senior UX designer (8+ years, B2B SaaS) and a veteran GBP manager (6 years, 600 locations, used BrightLocal/Yext/SOCi/Uberall).

---

## Audit Summary

### What's Working

- **Work queue** — Good multi-type prioritization, batch actions, rapid review mode with keyboard shortcuts. This is the core operator interface and it's solid.
- **Sidebar scope switching** — Clean mental model (Agency > Org > Location). Location selector is intuitive.
- **Review reply AI drafting** — AI drafts in the work queue with edit + send is practical and saves real time.
- **Profile optimization recommendations** — AI-generated description/category/hours suggestions are a differentiator.
- **Location detail page** — Good hub: stats, recent reviews, forms, funnels, GBP status all on one page.
- **Stale content alerts** — Flagging outdated lander content relative to GBP profile is clever.

### What's Broken

Two major themes emerged from both reviewers:

1. **Duplicate/redundant views** — The same data appears in 2-3 places with slightly different UI. Agency reviews vs org reviews. Two work queues. Orgs table on agency overview AND on the orgs page. Forms at org level AND location level. This creates confusion about which is the "real" view.

2. **Missing operational workflows** — The tool has good individual features but lacks the connective tissue for daily operations at scale: no bulk actions, no CSV export, no location health explanations, no client approval flows, no citation management.

---

## ELIMINATE

These should be removed or merged. They add complexity without proportional value.

### 1. Delete duplicate work queue (v1 or v2)

**Files:** `src/app/agency/queue/page.tsx` (v1), `src/app/agency/queue/v2/page.tsx` (v2)

Two 70KB+ components doing the same thing. Only v1 is linked in sidebar. Pick one, delete the other. The GBP manager preferred v2 (better org grouping and batch actions).

**Action:** Delete the unused version and its component. Update sidebar if needed.

### 2. Delete agency-level reviews page

**File:** `src/app/agency/reviews/page.tsx`

Duplicates the org-level reviews page with identical stat cards and filter pills. The work queue already surfaces urgent reviews. Operators never need a cross-org review list — they work org-by-org.

**Action:** Delete the page. Remove from sidebar. If cross-org visibility is needed, add a "recent urgent reviews" section to the agency overview action items.

### 3. Remove organizations table from agency overview

**File:** `src/app/agency/page.tsx` (bottom ~60 lines)

The agency overview shows sync health, action items, and metrics — all useful for a quick morning scan. The orgs table at the bottom duplicates `/agency/organizations` and enables no actions. It makes the overview less scannable.

**Action:** Replace with a one-line summary ("12 organizations, 8 active, 4 needing attention") + link to full list.

### 4. Consolidate post topics into posts workflow

**File:** `src/app/admin/[orgSlug]/locations/[locationId]/posts/topics/page.tsx`

Topic/template management is theoretically useful but operationally dead. Nobody managing 600 locations sits down to curate topic inventories. Topics should be inline context during post generation, not a separate management page.

**Action:** Remove standalone topics page. Fold topic selection into the post generation workflow where it's contextually relevant.

### 5. Merge org-level and location-level forms views

**Files:** `src/app/admin/[orgSlug]/forms/page.tsx`, `src/app/admin/[orgSlug]/locations/[locationId]/forms/page.tsx`

Org view shows forms across all locations but with no bulk actions. Location view shows forms for one location with fewer columns. Inconsistent and redundant.

**Action:** Keep org-level as the canonical view with location filter, submission counts, status toggles, and bulk enable/disable. Location detail page shows a mini preview + link to filtered org view.

---

## MISSING

These workflows don't exist but should, based on daily operator needs.

### 6. Bulk review reply workflow

The work queue handles reviews one at a time. At 600 locations, an operator might have 30+ reviews needing replies on a Monday morning. Every competitor (Yext, SOCi) has batch processing.

**Need:** Select multiple reviews of the same type (e.g., all 4-5 star reviews), apply a single AI-generated reply template with per-location personalization, approve all at once.

### 7. Multi-location filtering and sorting on reports

The reports page aggregates data but can't answer "which of my 600 locations has <50% response rate?" or "sort by most at-risk first." This is the #1 question an operator asks every morning.

**Need:** Sortable/filterable location table on reports page. Sort by: response rate, avg rating, days since last review, health status. Filter by: health status, location type, date range.

### 8. CSV export of review data

No export function anywhere. Operators need to pull data for client reporting and team coordination. Every competitor has this.

**Need:** Export button on reviews and reports pages. CSV with: location, rating, platform, review text, reply status, days since published, date.

### 9. Location health explanations

The reports page computes health scores (healthy/attention/at_risk) but doesn't explain why. The location detail page doesn't show the health score at all.

**Need:** Health card on location detail page showing: current status, why (low rating? stale reviews? no replies? GBP incomplete?), and recommended next action with a direct link to fix it.

### 10. Client approval flow for profile edits

Profile optimization recommendations can be "sent to client" but there's no:
- Client-facing approval page
- Notification when client approves/rejects
- Expiration of pending requests
- Dashboard showing pending approvals

**Need:** Complete the approval loop. This is in the Falcon system design but not yet built.

### 11. Citation management

Mentioned in CLAUDE.md as a planned module. The GBP manager says citations are 30% of operational work. This is the biggest missing feature for competitive parity.

**Need:** Not sprint-scoped, but flagged as the #1 missing module.

---

## SIMPLIFY

These exist but are overcomplicated.

### 12. Reports page — too data-heavy for customers

**File:** `src/app/admin/[orgSlug]/reports/page.tsx`

Currently shows 300+ data points, requires horizontal scrolling, and violates the mobile-first principle. Columns like `days_since_last_review` are useful for agency, not customer.

**Action:** Restructure into 3 scannable sections:
1. **Health Snapshot** — 1 row per location, 5 columns (Location, Avg Rating, New Reviews 7d, Response Rate, Health Status), color-coded
2. **30-Day Trends** — 4 cards with sparklines (Reviews, Rating, Responses, GBP Impressions)
3. **Call to Action** — "2 locations need attention" with specific issues and fix buttons

Move advanced metrics to an export/PDF.

### 13. GBP profile editor — too many save points

**File:** `src/app/admin/[orgSlug]/locations/[locationId]/gbp-profile/page.tsx`

Each section (info, address, hours, categories, description) has its own edit/save cycle. Updating 5 fields = 5 saves. No "save all" or "discard all."

**Action:** Switch to full-page edit mode: one "Edit Profile" button, all fields editable at once, single "Save Changes" at bottom. Reduces clicks from 15 to 3.

### 14. Sidebar — too many items when location is selected

**File:** `src/components/sidebar.tsx`

When a location is selected, the sidebar shows 8+ items in the "Manage" group. On collapsed sidebar (when chat is open), it's icons-only and impossible to navigate.

**Action:** When location is selected, show only location-relevant items (Dashboard, Reviews, Funnels, Lander). Access other tabs from the location detail page instead.

### 15. Notifications page — confusing bulk action UI

**File:** `src/app/agency/notifications/page.tsx`

Current: checkboxes per org + click cells for subscriber popovers + floating action bar. Unclear what clicking a cell does vs. what the checkbox does.

**Action:** Simplify to ON/OFF toggles per alert type per org in a clean table. Click toggle to configure subscribers. Bulk select orgs for batch toggle.

---

## Sprint Priorities

Ranked by operator impact and effort:

### Must Do (This Sprint)

| # | Task | Effort | Why |
|---|------|--------|-----|
| 1 | Delete duplicate work queue | S | Removes confusion, cleans up 70KB dead code |
| 2 | Delete agency reviews page | S | Eliminates redundant navigation path |
| 3 | Clean up agency overview (remove orgs table) | S | Makes morning scan faster |
| 7 | Add sorting/filtering to reports location table | M | Answers "which locations need attention?" — the daily question |
| 9 | Add health explanation card to location detail | M | Operators need to know WHY a location is at risk |
| 8 | Add CSV export to reviews and reports | M | Unblocks client reporting workflow |

### Should Do (This Sprint If Time)

| # | Task | Effort | Why |
|---|------|--------|-----|
| 12 | Simplify reports page layout | L | Customer-facing page needs mobile-first redesign |
| 5 | Consolidate forms views | M | Reduces navigation confusion |
| 4 | Remove post topics standalone page | S | Dead weight |
| 14 | Simplify sidebar when location selected | M | Reduces cognitive load |

### Next Sprint

| # | Task | Effort | Why |
|---|------|--------|-----|
| 6 | Bulk review reply workflow | L | Saves 30+ min/day at scale |
| 10 | Client approval flow | L | Completes Falcon loop |
| 13 | GBP editor single-save mode | M | Quality of life improvement |
| 15 | Notifications UI simplification | M | Confusing but functional |
| 11 | Citation management | XL | Biggest missing module, separate project |

---

## GBP Manager's Top 5 Screens

If the tool could only have 5 views, these are what an operator managing 600 locations needs:

1. **Work Queue** — 60% of daily time. Reviews, posts, approvals, errors, all prioritized.
2. **Location Dashboard** — The hub for each location. Health, reviews, forms, GBP status.
3. **Reviews by Location** — Filter by status, platform, rating. Bulk mark/archive.
4. **Org Reports** — Aggregate metrics, trends, health per location. Client-facing.
5. **GBP Profile Management** — View/edit profile, see optimization recommendations.

Everything else is supporting infrastructure. If a feature doesn't serve one of these 5 views, question whether it needs to exist.
