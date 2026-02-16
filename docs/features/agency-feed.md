# Feature Spec: Agency Feed

*Grouped, approve-first feed replacing the work queue as the primary operator interface.*

## Problem

The work queue (`/agency/queue`) shows individual items in a flat list. At 600 locations, a Monday morning might surface 50+ items — each requiring a separate click, review, and action. The queue works, but it doesn't scale.

The core inefficiency: items that arrive in batches (AI-generated review replies, weekly posts, profile optimizations) are displayed one at a time. An operator reviewing 8 identical "4-star thank-you" replies across locations for the same brand does 8 approve clicks instead of 1.

## Solution

A grouped feed at `/agency/feed` that:

1. **Groups like items** by org + type + batch into single cards (e.g., "Acme Dental — 3 Review Replies")
2. **Defaults to approve-all** — one button for the 80% case where AI got it right
3. **Expands inline** for the 20% case — edit or reject individual items without leaving the feed
4. **Filters with paginated selectors** — org/location filtering via search-first comboboxes for 600+ org scale

## Design Decisions (Locked)

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Grouped cards | Items grouped by org + type + batch | Reduces 50 items to ~15 cards. Matches how crons produce work. |
| Bulk action model | Type-scoped (not smart dispatch) | Filter tabs already encourage working one type at a time. Simpler to build. |
| Edit flow | Inline expand | Works on desktop and mobile. Keeps you in the feed. |
| New items | "N new items" banner, click to refresh | Prevents disorienting page shifts during active review. |
| Org/location filter | Search-first combobox with paginated results | Flat dropdown unusable at 600+ orgs. |
| Route | `/agency/feed` (coexists with `/agency/queue`) | Build and evaluate before deciding what to delete. |

---

## Card Anatomy

### Collapsed Card (Default)

```
┌─────────────────────────────────────────────────────────┐
│  ● Acme Dental                          3 Review Replies │
│  AI drafts ready for approval                            │
│                                                          │
│  ★★★★★ "Great service..."  ★★★★☆ "Good but..."  +1 more │
│                                                          │
│  [Approve All]                              [Expand ▾]   │
└─────────────────────────────────────────────────────────┘
```

- **Priority dot**: Red (urgent — negative reviews), amber (important), gray (info)
- **Org name**: Bold, always visible
- **Count + type**: "3 Review Replies", "5 Posts for Approval", etc.
- **Preview line**: First 2-3 items summarized inline (rating + snippet for reviews, title for posts)
- **Approve All**: Primary action — approves every item in the group
- **Expand**: Shows individual items for selective action

### Expanded Card

```
┌─────────────────────────────────────────────────────────┐
│  ● Acme Dental                          3 Review Replies │
│  AI drafts ready for approval                [Collapse ▴]│
│                                                          │
│  ┌─────────────────────────────────────────────────────┐ │
│  │ ★★★★★ Jane D. — Miami Beach                        │ │
│  │ "Amazing experience at this location..."            │ │
│  │ AI Reply: "Thank you Jane! We're glad you had..."   │ │
│  │ [Approve] [Edit] [Reject]                           │ │
│  └─────────────────────────────────────────────────────┘ │
│  ┌─────────────────────────────────────────────────────┐ │
│  │ ★★★★☆ Bob T. — Fort Lauderdale                     │ │
│  │ "Good but waited 20 minutes..."                     │ │
│  │ AI Reply: "Hi Bob, thank you for your feedback..."  │ │
│  │ [Approve] [Edit] [Reject]                           │ │
│  └─────────────────────────────────────────────────────┘ │
│  ┌─────────────────────────────────────────────────────┐ │
│  │ ★★★★★ Maria L. — Coral Springs                     │ │
│  │ "Best dental office I've been to..."                │ │
│  │ AI Reply: "Thank you so much Maria!..."             │ │
│  │ [Approve] [Edit] [Reject]                           │ │
│  └─────────────────────────────────────────────────────┘ │
│                                                          │
│  [Approve Remaining (3)]                                 │
└─────────────────────────────────────────────────────────┘
```

- Each sub-item has its own approve/edit/reject
- Approving or rejecting an individual item removes it from the card
- "Approve Remaining" button at bottom for the rest
- Editing opens inline textarea (replaces the AI reply text, save/cancel buttons appear)
- Card auto-collapses when all items are resolved

### Single-Item Card

Same component, just count = 1. No expand button — the card shows the item directly with action buttons. Handles stragglers, manual submissions, one-off reviews.

---

## Grouping Logic

### Group Key

```
groupKey = `${org_id}:${item_type}:${batch_key}`
```

Where `batch_key` is:

| Item Type | Batch Key | Why |
|-----------|-----------|-----|
| `ai_draft_review` | `ai_draft` (constant — all pending drafts group) | AI drafts accumulate, no explicit batch ID |
| `review_reply` | `needs_reply` (constant — all unreplied group) | Same — unreplied reviews accumulate |
| `post_pending` | Status: `draft` / `client_review` / `pending` | Posts at different stages are different actions |
| `profile_optimization` | `pending` (constant — all pending recs group by org) | Recs deduped by field per location, latest batch wins |
| `google_update` | `google_update` (constant) | Usually one per location, group by org |
| `sync_error` | `sync_error` (constant) | Group all errors by org |
| `stale_lander` | `stale_lander` (constant) | Group stale landers by org |

### Sort Order (Within Groups)

- Negative reviews (rating <= 2) float to top within a review group
- Posts sorted by `scheduled_for` ascending (soonest first)
- Profile recs sorted by field (description > categories > attributes > hours)
- Everything else by `created_at` descending

### Sort Order (Between Groups)

Groups sorted by highest-priority item within the group:

1. `urgent` groups first (negative reviews, suspended profiles)
2. `important` groups next (AI drafts, posts, optimizations)
3. `info` groups last (sync errors, stale landers)
4. Within same priority: most recent `created_at` first

---

## Feed Header & Filters

### Layout

```
┌─────────────────────────────────────────────────────────┐
│  Feed                                    Scope: [All ▾]  │
│                                                          │
│  [All (23)] [Reviews (8)] [Posts (5)] [Profiles (4)] ... │
│                                                          │
│  Filters ▾                                               │
└─────────────────────────────────────────────────────────┘
```

### Filter Tabs

Same types as current queue, shown as horizontal pills with count badges:

- **All** — everything
- **Reviews** — combines `review_reply` + `ai_draft_review` (same as current `needs_reply` + `ai_drafts`)
- **Posts** — `post_pending`
- **Profiles** — `profile_optimization` + `google_update`
- **Errors** — `sync_error`
- **Landers** — `stale_lander`

Fewer tabs than current queue (7 → 6) by combining related types.

### Scope Toggle

- **All** — all items across all orgs/locations
- **My Queue** — items from orgs/locations assigned to current user (via `org_account_managers`)

### Expandable Filters Row

"Filters" chevron expands to reveal:

- **Org**: SearchableSelect combobox — type to search, paginated results (20 at a time), clears location filter when changed
- **Location**: SearchableSelect combobox — scoped to selected org (disabled until org selected), paginated results

Both filters are optional. When set, they filter the feed API call server-side.

---

## SearchableSelect Component

New shared component for paginated entity selection. Used by org and location filters.

### Behavior

1. Closed state: shows selected value or placeholder text, click to open
2. Open state: text input at top (autofocused), results list below
3. As user types, debounced search (300ms) queries API
4. Results paginated — scroll to bottom loads next page
5. Click result to select, closes dropdown
6. "Clear" button to remove selection

### API Endpoints

**`GET /api/agency/orgs/search?q=acme&offset=0&limit=20`**

Returns: `{ orgs: [{ id, name, slug }], has_more: boolean }`

Queries: `organizations` table, `name ILIKE '%acme%'`, ordered by name, limited scope to user's accessible orgs.

**`GET /api/agency/locations/search?q=miami&org_id=xxx&offset=0&limit=20`**

Returns: `{ locations: [{ id, name, city, state }], has_more: boolean }`

Queries: `locations` table, `name ILIKE '%miami%' OR city ILIKE '%miami%'`, filtered by `org_id` if provided.

---

## New Items Banner

### Behavior

1. Feed stores `latest_created_at` timestamp from most recent fetch
2. Polling endpoint (every 60s): `GET /api/agency/feed/check?since={latest_created_at}`
3. Returns: `{ new_count: number }`
4. If `new_count > 0`, banner appears at top of feed: **"5 new items"** — click to refresh
5. Clicking the banner calls `fetchData()` (full refresh) and scrolls to top
6. Banner dismisses on refresh

### Why Not Auto-Refresh

Auto-inserting items while an operator is mid-review is disorienting. The operator might be editing a reply in an expanded card — inserting items above shifts everything. The banner pattern (used by Twitter/X, Slack) lets the operator control when new items appear.

---

## Feed API

### `GET /api/agency/feed`

Replaces `/api/agency/work-queue` as the feed data source. Returns grouped items.

**Query Parameters:**

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `filter` | string | `all` | Type filter: `all`, `reviews`, `posts`, `profiles`, `errors`, `landers` |
| `scope` | string | `all` | `all` or `mine` |
| `org_id` | string | — | Filter to specific org |
| `location_id` | string | — | Filter to specific location |
| `offset` | number | `0` | Pagination offset (in groups, not items) |
| `limit` | number | `20` | Groups per page |

**Response:**

```typescript
interface FeedResponse {
  groups: FeedGroup[]
  counts: {
    total: number
    reviews: number
    posts: number
    profiles: number
    errors: number
    landers: number
  }
  total_groups: number
  offset: number
  has_more: boolean
  scope: 'all' | 'mine'
  is_agency_admin: boolean
  latest_created_at: string  // for new-items polling
}

interface FeedGroup {
  group_key: string           // org_id:type:batch_key
  org_id: string
  org_name: string
  org_slug: string
  item_type: FeedItemType     // 'review_reply' | 'ai_draft_review' | 'post_pending' | etc.
  priority: 'urgent' | 'important' | 'info'
  item_count: number
  items: WorkItem[]           // reuse existing WorkItem type
  created_at: string          // most recent item's created_at
}
```

**Implementation:**

The feed API reuses the same underlying queries as the current work queue API. The difference is a grouping + sorting step after fetching:

1. Fetch all items (same parallel queries as current)
2. Apply scope/org/location filters
3. Group items by `groupKey`
4. Sort groups by priority, then recency
5. Paginate groups (not items) — offset/limit applies to groups
6. Return grouped response

This means the current work queue API stays untouched. The feed API is a new route that wraps the same data with grouping logic.

### `GET /api/agency/feed/check`

New items polling endpoint.

**Query Parameters:**

| Param | Type | Description |
|-------|------|-------------|
| `since` | string (ISO timestamp) | Return count of items created after this time |
| `scope` | string | `all` or `mine` |
| `org_id` | string | Optional org filter |

**Response:**

```typescript
{ new_count: number }
```

Lightweight query — just counts, no full item data.

---

## Actions

All action endpoints stay the same. The feed doesn't change how approvals work — it changes how items are *presented*.

### Approve All (Group)

Client-side: iterates through group items, calls the appropriate endpoint for each:

| Item Type | Endpoint | Payload |
|-----------|----------|---------|
| `ai_draft_review` | `POST /api/reviews/{id}/reply` | `{ reply_body: item.review.ai_draft }` |
| `review_reply` | — | No approve-all for unreplied reviews (need reply text) |
| `post_pending` (draft) | `POST /api/posts/{id}/approve` | `{ action: 'agency_approve' }` |
| `post_pending` (client_review) | — | Awaiting client, no agency action |
| `post_pending` (pending) | — | Already approved, in posting queue |
| `profile_optimization` | `POST /api/locations/{id}/recommendations` | `{ action: 'approve_batch', batch_id }` |
| `google_update` | `POST /api/locations/{id}/gbp-profile/google-updates` | `{ action: 'accept' }` |
| `stale_lander` | `POST /api/landers/ai-content` | `{ lander_id }` (regenerate) |
| `sync_error` | — | Dismiss only, no approve |

For approve-all, items without a natural "approve" action (unreplied reviews needing text, client-pending posts, sync errors) are excluded — the button label reflects this: "Approve All (3 of 5)" or the group only shows approvable items.

### Individual Actions (Expanded)

Same as current work queue detail pane actions, but rendered inline within the card:
- **Approve**: Fires the endpoint, removes item from card, updates count
- **Edit**: Shows textarea replacing the AI text, save/cancel buttons
- **Reject/Skip**: Fires status update, removes item from card
- **Regenerate**: Fires AI regeneration, shows loading state, replaces draft text

### Optimistic UI

On approve/reject:
1. Immediately remove item from card (decrement count)
2. If card is now empty, fade out and remove card
3. Fire API call in background
4. On failure: re-insert item, show error toast

---

## Component Structure

```
src/app/agency/feed/
  page.tsx                    — Server component, auth gate, renders FeedView

src/components/feed/
  feed-view.tsx               — Client component, main feed container
  feed-header.tsx             — Title, scope toggle, filter tabs
  feed-filters.tsx            — Expandable org/location filter row
  feed-card.tsx               — Grouped card (collapsed + expanded states)
  feed-card-item.tsx          — Individual item within expanded card
  feed-new-items-banner.tsx   — "N new items" banner
  searchable-select.tsx       — Paginated search combobox (shared)
```

### Why This Structure

- `feed-view.tsx` owns state (data, filters, selection) — single source of truth
- `feed-card.tsx` handles expand/collapse and group-level actions (approve all)
- `feed-card-item.tsx` handles individual item rendering and actions (approve, edit, reject)
- `searchable-select.tsx` is shared — used by org and location filters, reusable elsewhere

**Not creating:** No separate files for item type renderers. The `feed-card-item.tsx` component uses a switch on `item.type` internally — same pattern as current work queue. Splitting into 7 renderer files for a switch statement is over-engineering.

---

## Build Order

### Phase 1: API + Data Layer

**Goal:** Feed API returns grouped data. Verifiable by hitting the endpoint directly.

1. **Create `/api/agency/feed/route.ts`** — Feed endpoint with grouping logic
   - Reuse query helpers from existing work-queue route
   - Add grouping step: group by `org_id:type:batch_key`
   - Add group sorting: priority → recency
   - Paginate by groups
   - Add `org_id` and `location_id` query param filtering
   - Return `FeedResponse` shape

2. **Create `/api/agency/feed/check/route.ts`** — New items polling
   - Lightweight count query
   - Filter by `since` timestamp

3. **Create `/api/agency/orgs/search/route.ts`** — Org search for filter combobox
   - ILIKE search on org name
   - Paginated results
   - Scoped to user's accessible orgs

4. **Create `/api/agency/locations/search/route.ts`** — Location search for filter combobox
   - ILIKE search on name + city
   - Optional `org_id` filter
   - Paginated results

**Verification:** `curl` each endpoint, confirm grouped response shape, confirm counts match current work queue.

### Phase 2: Feed Shell + Cards

**Goal:** Feed page renders grouped cards with correct data. No actions yet.

5. **Create `searchable-select.tsx`** — Paginated search combobox
   - Text input, debounced search, paginated scroll
   - Generic: accepts `fetchFn`, `renderItem`, `getLabel` props

6. **Create `feed-view.tsx`** — Main feed container
   - State: data, filter, scope, org/location filters, expanded cards
   - Fetch on mount, 60s polling, focus refresh
   - Infinite scroll with sentinel

7. **Create `feed-header.tsx`** — Filter tabs + scope toggle
   - Pill tabs with count badges
   - Scope dropdown (All / My Queue)

8. **Create `feed-filters.tsx`** — Expandable filter row
   - Chevron toggle to show/hide
   - Org SearchableSelect + Location SearchableSelect
   - Location disabled until org selected

9. **Create `feed-card.tsx`** — Grouped card component
   - Collapsed: org name, count, type label, preview, approve-all button, expand toggle
   - Expanded: list of feed-card-items, collapse toggle, approve-remaining button

10. **Create `feed-card-item.tsx`** — Individual item renderer
    - Switch on `item.type` for type-specific rendering
    - Action button placeholders (wired in Phase 3)

11. **Create `feed-new-items-banner.tsx`** — New items banner
    - Polls `/api/agency/feed/check` every 60s
    - Shows count, click refreshes feed

12. **Create `page.tsx`** — Server component route
    - `requireAgencyAdmin()` gate
    - Render `<FeedView />`

**Verification:** Navigate to `/agency/feed`, see grouped cards with correct data, filters work, pagination works, new-items banner appears.

### Phase 3: Actions

**Goal:** All approval, edit, reject, and bulk actions work with optimistic UI.

13. **Wire approve-all** — Group-level approve button
    - Iterate items, call appropriate endpoints
    - Optimistic: remove card immediately
    - Error: re-insert, show toast

14. **Wire individual actions** — Per-item approve/edit/reject/regenerate
    - Approve: call endpoint, remove item from card
    - Edit: toggle inline textarea, save calls endpoint
    - Reject/Skip: call status endpoint, remove item
    - Regenerate: call AI endpoint, show loading, replace draft

15. **Wire assignment** — If keeping assignment (optional, evaluate need)
    - Dropdown on card for assigning group to team member

**Verification:** Approve a group, verify items are removed from feed AND source tables updated. Edit a reply inline, approve, verify reply posted. Reject an item, verify status updated.

### Phase 4: Sidebar + Polish

16. **Add `/agency/feed` to sidebar** — Below or replacing "Work Queue"
    - Add nav item with feed icon
    - Keep work queue link during evaluation period

17. **Mobile testing** — Verify feed works on mobile viewport
    - Cards stack correctly
    - Expand/collapse works with touch
    - Filters accessible
    - SearchableSelect works on mobile keyboards

18. **Loading and empty states**
    - Skeleton cards while loading
    - Empty state: "All caught up" when no items

**Verification:** Full end-to-end flow on desktop and mobile. Compare with work queue — same items, grouped presentation, fewer clicks.

---

## Migration Path

1. **Build phase**: `/agency/feed` exists alongside `/agency/queue`. Both in sidebar.
2. **Evaluate**: Use feed for a week. Compare efficiency, catch any missing workflows.
3. **Decide**: If feed covers everything, remove queue from sidebar (keep route alive briefly). If gaps, address them.
4. **Clean up**: Delete `/agency/queue` route + `work-queue.tsx` (1,900 lines). Update sidebar.

The feed API is independent from the work queue API. No shared state, no migration needed. The feed reads from the same source tables with different presentation logic.

---

## What's NOT in This Build

- **Keyboard shortcuts** — Current queue has rapid-review mode. Add to feed later if needed.
- **Assignment system** — Current queue assigns individual items. Grouped cards might change how assignment works. Evaluate during build.
- **Notification integration** — Feed doesn't change how notifications work. Separate concern.
- **Real-time (WebSocket/Supabase Realtime)** — Polling is fine. Real-time adds complexity for minimal gain at current scale.
- **Autopilot bypass** — Items auto-approved by autopilot don't appear in the feed. That's correct — autopilot means "don't show me this." No change needed.
