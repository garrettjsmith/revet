# Feature Spec: Settings Consolidation

*Separate agency configuration from customer portal. Customers observe — agency operates.*

## Problem

Settings and configuration pages are scattered across `/admin/[orgSlug]/` alongside customer-facing dashboards. Some pages are agency-only gated (`checkAgencyAdmin()`), some are dual-mode (different UI for admins vs members), and some have no access control at all. The result:

- **Brand config** lives at `/admin/[orgSlug]/brand` — agency-only, but in the customer namespace
- **Org settings** (name, slug, logo) at `/admin/[orgSlug]/settings` — no access check, any member can edit
- **Team management** at `/admin/[orgSlug]/team` — no access check on mutation actions
- **Autopilot**, **lander settings** — properly gated but confusingly located in customer routes
- **Notifications** — dual-mode (read-only for members, config for admins) in the same page

This creates confusion about who can do what, security gaps on unprotected pages, and a customer experience where they might stumble into config they can't use.

## Solution

Three clear namespaces:

| Namespace | Who | Purpose |
|-----------|-----|---------|
| `/agency/settings/` | Agency admins | Agency-global config (integrations, defaults) |
| `/agency/[orgSlug]/` | Agency admins | Agency configuring a specific org's settings |
| `/admin/[orgSlug]/` | Customers + agency | Customer portal — read-only dashboards + limited self-service |

### Customer Roles

Two roles within the customer org, independent from agency admin:

| Role | Who | How Set |
|------|-----|---------|
| **Customer admin** | Client's point person (Director, C-level) | Agency admin designates. One per org. |
| **Member** | Client's managers, staff | Default role for all org members |

Stored as `is_org_admin` boolean on `org_members`. Independent from `is_agency_admin` — they are separate concerns. Constraint: only one `is_org_admin = true` per org (excluding agency admins).

### Customer Capabilities by Role

The principle: **Customers don't operate. But they approve what the agency sends them — and customer admins manage their own team.**

**All customers (admin + member):**

*View (read-only):*
- All dashboards, stats, trends
- Reviews (individual reviews, ratings, review text)
- GBP profile details
- Lander content
- Form submissions
- Review funnels

*Approve (agency-initiated, sent for client review):*
- **Posts** — approve/reject/request edits on posts the agency sends for review
- **Profile recommendations** — approve/reject profile changes that require client sign-off

*Self-service:*
- **Reports** — view, change date ranges, download
- **Notifications** — update their own notification preferences
- **Display name** — update their own name

**Customer admin only:**

*Request (creates work queue item for agency):*
- **Request a post** — submit a post request that appears in the agency work queue/feed. Assigned agent gets notified.
- **Request profile changes** — submit a change request for profile fields (hours, description, photos, etc.). Appears in agency work queue/feed.

*Team management:*
- Add new members to the org
- Remove members from the org (non-agency members only)
- Agency admins are **not visible** on the customer team roster

*Notifications:*
- Configure notification preferences for **all** non-agency members in their org (not just their own)

**Cannot (agency-only, regardless of customer role):**
- Reply to reviews, write or approve AI drafts
- Directly edit profiles or landers (can only *request* changes)
- Directly create posts (can only *request* posts)
- Configure autopilot, lander settings, brand config
- Edit org settings (name, slug, logo)
- Designate or change the customer admin (agency sets this)

## Design Decisions (Locked)

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Three namespaces | `/agency/settings/`, `/agency/[orgSlug]/`, `/admin/[orgSlug]/` | Clean separation: global config, per-org config, customer portal |
| Customer roles | Customer admin (one per org) + member | Admin manages team & notifications, can request posts/changes. Member views & approves. |
| `is_org_admin` boolean | Separate from `is_agency_admin` | Independent concerns. Agency admin = platform operator. Customer admin = org point person. |
| One admin per org | Constraint on `is_org_admin` | Single point of contact. Agency designates. Keeps it simple. |
| Request workflow | Work queue items + notification to assigned agent | Formal, trackable. Customers request, agency acts. |
| Customer self-service | Approve agency-sent items + notifications + display name + requests (admin) | Customers don't operate — they observe, approve, and request. |
| Dual-mode pages | Split into separate routes | Cleaner than conditional rendering. Agency version has full config. Customer version has limited controls. |
| Sidebar context switching | Scope selector already supports agency vs org | Existing pattern works. Agency org config uses agency scope with org sub-nav. |

---

## Route Mapping

### `/agency/settings/` — Agency Global Config

Agency-wide settings that aren't scoped to any org.

| New Route | Current Route | What It Does |
|-----------|---------------|-------------|
| `/agency/settings` | — | Settings hub / landing page |
| `/agency/settings/integrations` | `/agency/integrations` | Google, Local Falcon, Yelp, Facebook connections |
| `/agency/settings/integrations/google/setup` | `/agency/integrations/google/setup` | Google OAuth resource mapping |
| `/agency/settings/notifications` | `/agency/notifications` | Agency-level notification subscriptions |

**New pages (not yet built):**

None required for initial consolidation. Future candidates: default templates, billing, API keys.

### `/agency/[orgSlug]/` — Agency Configuring Specific Org

Agency admins configuring a specific organization. All pages require `requireAgencyAdmin()`.

| New Route | Current Route | What It Does |
|-----------|---------------|-------------|
| `/agency/[orgSlug]` | — | Org config hub (links to sub-pages below) |
| `/agency/[orgSlug]/settings` | `/admin/[orgSlug]/settings` | Org name, slug, website, logo |
| `/agency/[orgSlug]/brand` | `/admin/[orgSlug]/brand` | Brand voice, colors, design style, fonts |
| `/agency/[orgSlug]/team` | `/admin/[orgSlug]/team` | Add/remove members, manage roles |
| `/agency/[orgSlug]/notifications` | `/admin/[orgSlug]/notifications` | Org-wide notification config (all subscriber types) |
| `/agency/[orgSlug]/locations/[locationId]/settings` | `/admin/[orgSlug]/locations/[locationId]/settings` | Location details, move location between orgs |
| `/agency/[orgSlug]/locations/[locationId]/notifications` | `/admin/[orgSlug]/locations/[locationId]/notifications` | Location-specific notification config |
| `/agency/[orgSlug]/locations/[locationId]/autopilot` | `/admin/[orgSlug]/locations/[locationId]/reviews/autopilot` | Review autopilot config |
| `/agency/[orgSlug]/locations/[locationId]/lander/settings` | `/admin/[orgSlug]/locations/[locationId]/lander/settings` | Lander creation + template setup |

### `/admin/[orgSlug]/` — Customer Portal

Dashboards and data. Customers can view everything, edit only their own notifications and display name.

| Route | Change | Notes |
|-------|--------|-------|
| `/admin/[orgSlug]` | Keep | Org dashboard |
| `/admin/[orgSlug]/locations` | Keep | Location list |
| `/admin/[orgSlug]/locations/[locationId]` | Keep | Location dashboard |
| `/admin/[orgSlug]/reviews` | Keep | View reviews, ratings, text. No reply actions. |
| `/admin/[orgSlug]/locations/[locationId]/reviews` | Keep | View location reviews. No reply actions. |
| `/admin/[orgSlug]/locations/[locationId]/gbp-profile` | Keep | View GBP profile details. No direct edits. |
| `/admin/[orgSlug]/locations/[locationId]/recommendations` | New | Client approval UI for profile recommendations sent for review. Approve/reject. |
| `/admin/[orgSlug]/locations/[locationId]/lander` | Keep | View lander content. No edit/configure. |
| `/admin/[orgSlug]/posts/review` | Keep | Client approval of posts. Approve/reject/request edits. Already implemented. |
| `/admin/[orgSlug]/forms` | Keep | View form submissions |
| `/admin/[orgSlug]/reports` | Keep | View + change date ranges + download |
| `/admin/[orgSlug]/locations/[locationId]/reports` | Keep | View + change date ranges + download |
| `/admin/[orgSlug]/notifications` | Modify | Member: own preferences only. Customer admin: all non-agency members' preferences. |
| `/admin/[orgSlug]/locations/[locationId]/notifications` | Modify | Member: own preferences only. Customer admin: all non-agency members' preferences. |
| `/admin/[orgSlug]/profile` | New | Display name edit |
| `/admin/[orgSlug]/team` | Modify | Customer admin: add/remove members, view roster. Member: read-only roster. Agency admins hidden. |
| `/admin/[orgSlug]/settings` | Remove | Redirect to org dashboard. Org config moves to `/agency/[orgSlug]/settings`. |
| `/admin/[orgSlug]/brand` | Remove | Redirect to org dashboard. Already agency-gated. |
| `/admin/[orgSlug]/review-funnels/*` | Keep | View existing funnels |
| `/admin/[orgSlug]/locations/[locationId]/review-funnels/*` | Keep | View existing funnels |
| `/admin/[orgSlug]/locations/[locationId]/forms/*` | Keep | View forms/submissions |
| `/admin/[orgSlug]/locations/[locationId]/posts/topics` | Keep | View post topics |

### Routes to Remove from Customer Namespace

These routes move entirely to `/agency/[orgSlug]/` and should redirect:

| Old Route | Redirects To | Why |
|-----------|-------------|-----|
| `/admin/[orgSlug]/settings` | `/admin/[orgSlug]` | Org config is agency-only |
| `/admin/[orgSlug]/brand` | `/admin/[orgSlug]` | Brand config is agency-only |
| `/admin/[orgSlug]/locations/[locationId]/reviews/autopilot` | `/admin/[orgSlug]/locations/[locationId]/reviews` | Autopilot config is agency-only |
| `/admin/[orgSlug]/locations/[locationId]/lander/settings` | `/admin/[orgSlug]/locations/[locationId]/lander` | Lander config is agency-only |

---

## Sidebar Changes

### Agency Scope (when `isAgencyAdmin` and scope = agency)

```
Agency                    ← scope selector
├── Overview
├── Feed
├── Work Queue
├── Organizations
├── All Locations
├── Landers
└── Settings              ← replaces separate Integrations + Notifications links
    ├── Integrations
    └── Notifications
```

**Change:** Collapse "Integrations" and "Notifications" under a single "Settings" link. The `/agency/settings` page is a hub with links to sub-pages.

### Agency Org Config (when navigating to `/agency/[orgSlug]/`)

This is a new sidebar context — agency admin configuring a specific org. Uses the agency scope with org-specific sub-navigation.

```
Acme Dental (config)      ← scope selector shows org name + "(config)" label
├── Overview              ← config hub: summary of org settings state
├── Settings              ← org name, slug, website, logo
├── Brand                 ← brand voice, colors
├── Team                  ← members, roles
├── Notifications         ← org-wide notification config
└── Locations             ← list locations, each links to location config
    └── [location]
        ├── Settings
        ├── Notifications
        ├── Autopilot
        └── Lander Setup
```

### Customer Scope (when org member, scope = org)

```
Acme Dental               ← scope selector
├── Dashboard
├── Locations
├── Reviews
├── Post Review
├── Requests              ← customer admin only: view submitted requests + submit new
├── Forms
├── Reports
├── [Location selected]
│   ├── Overview
│   ├── Reviews
│   ├── GBP Profile       ← customer admin sees "Request Change" button
│   ├── Reports
│   └── More ▾
│       ├── Review Funnels
│       ├── Forms
│       ├── Lander
│       └── Post Topics
└── [Footer]
    ├── Notifications     ← member: own preferences. Admin: team-wide.
    ├── Team              ← member: read-only roster. Admin: add/remove members.
    ├── Profile           ← display name edit
    └── [user email] Sign out
```

**Changes from current:**
- Remove "Brand Config" from main nav
- Remove "Settings" from footer (org settings → agency only)
- Add "Profile" to footer (display name)
- Add "Requests" to main nav (customer admin only)
- "Team" becomes read-only roster for members, add/remove for customer admin
- "Notifications" — own preferences for members, team-wide for customer admin
- "Request Change" button on GBP Profile page (customer admin only)
- "Request a Post" accessible from Requests page or Post Review (customer admin only)

---

## Customer Notification Self-Service

The existing notifications page already has a dual-mode pattern. For the customer version, two views based on role:

### What Members See

A personal notification preferences page:

```
┌─────────────────────────────────────────────────────────┐
│  Your Notifications                                      │
│                                                          │
│  Choose which alerts you receive by email.               │
│                                                          │
│  ☑ New reviews                                           │
│  ☑ Negative reviews (1-2 stars)                          │
│  ☐ Review replies posted                                 │
│  ☑ Weekly summary report                                 │
│  ☐ New form submissions                                  │
│                                                          │
│  Location: All locations  [Change ▾]                     │
│                                                          │
│  [Save Preferences]                                      │
└─────────────────────────────────────────────────────────┘
```

- Only manages subscriptions for the current user's email
- Cannot add subscriptions for other team members
- Cannot configure org-wide "all members" alerts
- Simple checkbox list, not the full subscriber management table

### What Customer Admins See

The same personal preferences section PLUS a team notification management section:

```
┌─────────────────────────────────────────────────────────┐
│  Your Notifications                                      │
│  [Same personal preferences as above]                    │
│                                                          │
│  ─────────────────────────────────────────────────────── │
│                                                          │
│  Team Notifications                                      │
│                                                          │
│  Manage which alerts your team members receive.          │
│                                                          │
│  [Jane Smith ▾]                                          │
│  ☑ New reviews                                           │
│  ☑ Negative reviews (1-2 stars)                          │
│  ☐ Review replies posted                                 │
│  ☑ Weekly summary report                                 │
│  ☐ New form submissions                                  │
│                                                          │
│  [Save Team Preferences]                                 │
└─────────────────────────────────────────────────────────┘
```

- Can manage subscriptions for any non-agency member in their org
- Cannot see or configure agency admin subscriptions
- Same checkbox UI, with a member selector dropdown

### What Agency Admins See (at `/agency/[orgSlug]/notifications`)

Full notification config — the current admin view:
- Add/remove subscriptions for any subscriber type (all_members, user, email)
- Scope to specific locations
- Full subscriber management table

---

## Customer Profile Page

New simple page at `/admin/[orgSlug]/profile`:

```
┌─────────────────────────────────────────────────────────┐
│  Your Profile                                            │
│                                                          │
│  Display Name  [Jane Smith          ]                    │
│  Email         jane@acmedental.com  (read-only)          │
│                                                          │
│  [Save]                                                  │
└─────────────────────────────────────────────────────────┘
```

- Updates `org_members.display_name` or user metadata (depending on where display name is stored)
- Email shown read-only (auth change is a different flow)
- Minimal page — no over-building

---

## Customer Request Workflow

Customer admins can request posts and profile changes. These create formal work queue items that the agency sees in their feed.

### Request Types

| Type | Created By | What It Contains | Where It Appears |
|------|-----------|-----------------|------------------|
| Post request | Customer admin | Free-text description of desired post (topic, key points, timing) | Agency work queue + feed |
| Profile change request | Customer admin | Field(s) to change + desired value(s) or description of change | Agency work queue + feed |

### Flow

1. Customer admin submits request via form in customer portal
2. System creates a work queue item (new `type: 'client_request'` or similar)
3. Assigned agent gets notified (email/in-app, based on notification config)
4. Agency sees request in work queue / feed with context (who requested, what org/location, details)
5. Agency acts on request (creates the post, makes the profile change)
6. Request marked as completed

### Data Model

New table or extend existing `work_queue_items`:

```
client_requests
  id             uuid
  org_id         uuid (FK → organizations)
  location_id    uuid (FK → locations, nullable — post requests may be org-level)
  request_type   'post' | 'profile_change'
  details        text (free-text description from customer)
  status         'pending' | 'in_progress' | 'completed' | 'dismissed'
  requested_by   uuid (FK → auth.users)
  assigned_to    uuid (FK → auth.users, nullable)
  created_at     timestamptz
  completed_at   timestamptz
```

### Customer UI

**Request a Post** — accessible from customer sidebar or posts page (customer admin only):

```
┌─────────────────────────────────────────────────────────┐
│  Request a Post                                          │
│                                                          │
│  Location   [All locations ▾]                            │
│                                                          │
│  What should this post be about?                         │
│  ┌───────────────────────────────────────────────────┐   │
│  │ We're running a spring cleaning special...        │   │
│  │                                                   │   │
│  └───────────────────────────────────────────────────┘   │
│                                                          │
│  [Submit Request]                                        │
└─────────────────────────────────────────────────────────┘
```

**Request Profile Change** — accessible from GBP profile page (customer admin only):

```
┌─────────────────────────────────────────────────────────┐
│  Request a Change                                        │
│                                                          │
│  What would you like changed?                            │
│  ┌───────────────────────────────────────────────────┐   │
│  │ Please update our holiday hours for Memorial Day  │   │
│  │ — we'll be closed May 26.                         │   │
│  └───────────────────────────────────────────────────┘   │
│                                                          │
│  [Submit Request]                                        │
└─────────────────────────────────────────────────────────┘
```

Minimal forms. Free-text. No field pickers or structured data — the agency interprets and acts.

---

## Auth & Access Control

### New Pattern

Every page explicitly checks access. No more relying on "it's behind `/admin/` so it must be fine."

| Namespace | Gate | Helper |
|-----------|------|--------|
| `/agency/settings/*` | `requireAgencyAdmin()` | Redirect to `/admin/login` if not admin |
| `/agency/[orgSlug]/*` | `requireAgencyAdmin()` | Redirect to `/admin/login` if not admin |
| `/admin/[orgSlug]/*` | `requireOrgMember(orgSlug)` | Redirect to `/admin/login` if not member |

### Mutation Protection

For customer-facing pages that allow self-service, client approval, or customer admin actions:

**All customers (admin + member):**
- **Post approval API** (`/api/posts/[postId]/approve`): Already works — `client_approve` and `client_reject` actions. Verify non-admins can only act on `client_review` posts in their org.
- **Recommendations API** (`/api/locations/[locationId]/recommendations`): `client_approve` and `client_reject` actions already exist in backend. Verify non-admins can only act on `client_review` recs in their org's locations.
- **Notifications API (own)**: Members can only create/delete subscriptions where `subscriber_type = 'user'` AND `subscriber_value = currentUser.id`
- **Profile API**: Members can only update their own `org_members` record

**Customer admin only (`is_org_admin`):**
- **Team API**: Can add/remove non-agency members in their org. Cannot see or modify agency admin records.
- **Notifications API (team)**: Can create/delete subscriptions for any non-agency member in their org (`subscriber_type = 'user'` AND user is a non-agency member of the same org)
- **Request API** (new): Can create client requests (post requests, profile change requests) for their org/locations

**Agency-only (`is_agency_admin`):**
- All other mutations — reply to reviews, create posts, edit profiles, configure settings, etc.

---

## Build Order

### Phase 1: Agency Global Settings Hub

1. Create `/agency/settings/page.tsx` — settings hub with links to integrations + notifications
2. Move `/agency/integrations` → `/agency/settings/integrations` (keep old route as redirect)
3. Move `/agency/notifications` → `/agency/settings/notifications` (keep old route as redirect)
4. Update sidebar: replace separate Integrations/Notifications links with single Settings link

**Verification:** Navigate to `/agency/settings`, see hub page. Links work. Old URLs redirect.

### Phase 2: Agency Org Config Namespace

5. Create `/agency/[orgSlug]/page.tsx` — org config hub
6. Create `/agency/[orgSlug]/settings/page.tsx` — move org settings form from `/admin/[orgSlug]/settings`
7. Create `/agency/[orgSlug]/brand/page.tsx` — move brand config from `/admin/[orgSlug]/brand`
8. Create `/agency/[orgSlug]/team/page.tsx` — move team management from `/admin/[orgSlug]/team`
9. Create `/agency/[orgSlug]/notifications/page.tsx` — full notification config (extracted from dual-mode page)
10. Create `/agency/[orgSlug]/locations/[locationId]/settings/page.tsx` — move location settings
11. Create `/agency/[orgSlug]/locations/[locationId]/notifications/page.tsx` — full location notification config
12. Create `/agency/[orgSlug]/locations/[locationId]/autopilot/page.tsx` — move autopilot config
13. Create `/agency/[orgSlug]/locations/[locationId]/lander/settings/page.tsx` — move lander settings
14. Create sidebar context for agency org config view
15. Add entry points: "Configure" link on org cards in `/agency/organizations`, link in org dashboard

**Verification:** Navigate to `/agency/acme-dental`, see config hub. All config pages load with correct data. Forms save successfully. All pages require agency admin.

### Phase 3: Customer Roles & Data Model

16. Add `is_org_admin` boolean to `org_members` table (migration)
17. Add unique constraint: one `is_org_admin = true` per org (excluding agency admins)
18. Add `is_org_admin` to `checkOrgAdmin()` helper (new) in `src/lib/locations.ts` or similar
19. Create `client_requests` table (migration) — see data model above
20. Create `/api/client-requests/route.ts` — POST (create request), GET (list requests)
21. Add `is_org_admin` check to team mutation APIs (add/remove members)
22. Update agency team page (`/agency/[orgSlug]/team`) — add ability to designate customer admin

**Verification:** Migration runs cleanly. Can set `is_org_admin` on one member per org. Client requests table exists. API creates/lists requests.

### Phase 4: Lock Down Customer Portal

23. Replace `/admin/[orgSlug]/settings/page.tsx` with redirect to org dashboard
24. Replace `/admin/[orgSlug]/brand/page.tsx` with redirect to org dashboard
25. Simplify `/admin/[orgSlug]/notifications/page.tsx` — member: own preferences. Customer admin: team-wide.
26. Simplify `/admin/[orgSlug]/team/page.tsx` — member: read-only roster. Customer admin: add/remove members. Agency admins hidden.
27. Create `/admin/[orgSlug]/profile/page.tsx` — display name edit
28. Create `/admin/[orgSlug]/locations/[locationId]/recommendations/page.tsx` — client approval UI for profile recommendations
29. Create `/admin/[orgSlug]/requests/page.tsx` — customer admin: view + submit requests. Members: not visible.
30. Add "Request Change" button to `/admin/[orgSlug]/locations/[locationId]/gbp-profile` (customer admin only)
31. Replace `/admin/[orgSlug]/locations/[locationId]/reviews/autopilot` with redirect
32. Replace `/admin/[orgSlug]/locations/[locationId]/lander/settings` with redirect
33. Simplify `/admin/[orgSlug]/locations/[locationId]/notifications/page.tsx` — member: own only. Customer admin: team-wide.
34. Hide action buttons (reply, approve AI draft, edit) on review/post/profile pages for non-agency users
35. Update customer sidebar: remove Brand Config, remove Settings, add Profile, add Requests (admin only)
36. Add `is_agency_admin` checks to mutation APIs that currently lack them

**Verification:** Log in as member — read-only roster, own notifications, no config, no requests page. Log in as customer admin — team management works, notifications for all members, requests submit and appear in agency feed. Client approval works for posts and recommendations. Old config URLs redirect.

### Phase 5: Agency-Side Request Handling

37. Surface `client_requests` in agency work queue / feed as a new item type
38. Add notification to assigned agent when request is created
39. Add request status updates (in_progress, completed, dismissed) from agency UI
40. Customer admin can see request status on their Requests page

**Verification:** Customer admin submits request → appears in agency feed → assigned agent gets notified → agency marks complete → customer sees updated status.

### Phase 6: Polish & Cleanup

41. Add redirects for all old routes (keep for 30 days, then remove)
42. Remove duplicated components (if any config forms were copied vs moved)
43. Update CLAUDE.md route documentation
44. Test full flow: agency admin configures org → customer admin manages team → member sees result

---

## Migration Path

1. **Build phases 1-2** — New agency config routes created. Both old and new routes work.
2. **Build phase 3** — Customer roles and request data model. Migration runs.
3. **Build phase 4** — Customer portal locked down. Old config routes redirect. Customer admin features live.
4. **Build phase 5** — Request workflow end-to-end.
5. **Evaluate** — Run for a week. Check no workflows are broken.
6. **Clean up** — Remove redirect stubs, delete orphaned components.

Old routes redirect to dashboard (not to the new agency routes) because customers hitting a bookmarked config URL shouldn't land in an access-denied page.

---

## What's NOT in This Build

- **Multiple customer admins per org** — One admin per org. Agency designates. Keep it simple.
- **Customer self-service for org settings** — Customers can't edit org name/logo. Agency handles that.
- **Review reply pre-approval** — No `client_review` flow for AI-drafted review replies. Agency approves directly. Could add later.
- **Lander approval flow** — No client sign-off on lander content yet. Agency publishes directly. Could add later.
- **Structured request forms** — Requests are free-text. No field pickers, structured data, or request templates. Agency interprets.
- **Review funnel creation gating** — Currently any member can create funnels. Evaluate separately whether to restrict.
- **Form creation gating** — Same as above.
- **Post topic management gating** — Same as above.
- **Billing/subscription pages** — Future `/agency/settings/billing`. Not in scope.
- **`post_approval_mode` enforcement** — `brand_config.post_approval_mode` (`approve_first` vs `auto_post`) exists but isn't used to branch approval logic. Evaluate separately.
