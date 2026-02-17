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

### Customer Self-Service (What Customers CAN Do)

Customers can view everything — but can't act on it. Specifically:

**View (read-only):**
- All dashboards, stats, trends
- Reviews (individual reviews, ratings, review text) — but not reply, edit replies, or approve AI drafts
- GBP profile details — but not edit fields or approve optimizations
- Lander content — but not edit or configure
- Post content — but not approve, reject, or edit
- Form submissions
- Review funnels
- Team roster (who's on the team, roles)

**Interact:**
- **Reports** — view, change date ranges, download
- **Notifications** — update their own notification preferences (what alerts they receive)
- **Display name** — update their own name

**Cannot:**
- Reply to reviews, approve/reject AI drafts
- Edit or approve GBP profile optimizations
- Approve/reject/edit posts
- Configure autopilot, lander settings, brand config
- Edit org settings (name, slug, logo)
- Add/remove team members
- Configure notifications for other users

## Design Decisions (Locked)

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Three namespaces | `/agency/settings/`, `/agency/[orgSlug]/`, `/admin/[orgSlug]/` | Clean separation: global config, per-org config, customer portal |
| Customer self-service | Notifications + display name only | Customers observe data, agency operates. Minimal self-service reduces support burden. |
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
| `/admin/[orgSlug]/reviews` | Keep | View reviews, ratings, text. No reply/approve actions. |
| `/admin/[orgSlug]/locations/[locationId]/reviews` | Keep | View location reviews. No reply/approve actions. |
| `/admin/[orgSlug]/locations/[locationId]/gbp-profile` | Keep | View GBP profile details. No edit/approve optimizations. |
| `/admin/[orgSlug]/locations/[locationId]/lander` | Keep | View lander content. No edit/configure. |
| `/admin/[orgSlug]/posts/review` | Keep | View posts. No approve/reject/edit. |
| `/admin/[orgSlug]/forms` | Keep | View form submissions |
| `/admin/[orgSlug]/reports` | Keep | View + change date ranges + download |
| `/admin/[orgSlug]/locations/[locationId]/reports` | Keep | View + change date ranges + download |
| `/admin/[orgSlug]/notifications` | Modify | Self-service: user manages their OWN notification preferences only |
| `/admin/[orgSlug]/locations/[locationId]/notifications` | Modify | Self-service: user manages their OWN location notification preferences |
| `/admin/[orgSlug]/profile` | New | Display name edit |
| `/admin/[orgSlug]/team` | Modify | Read-only roster view (who's on the team, roles). No add/remove/toggle. |
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
├── Forms
├── Reports
├── [Location selected]
│   ├── Overview
│   ├── Reviews
│   ├── GBP Profile
│   ├── Reports
│   └── More ▾
│       ├── Review Funnels
│       ├── Forms
│       ├── Lander
│       └── Post Topics
└── [Footer]
    ├── Notifications     ← self-service: own preferences
    ├── Team              ← read-only roster
    ├── Profile           ← display name edit
    └── [user email] Sign out
```

**Changes from current:**
- Remove "Brand Config" from main nav
- Remove "Settings" from footer (org settings → agency only)
- Add "Profile" to footer (display name)
- "Team" becomes read-only roster
- "Notifications" shows only the user's own preferences

---

## Customer Notification Self-Service

The existing notifications page already has a dual-mode pattern. For the customer version, simplify:

### What Customers See

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

## Auth & Access Control

### New Pattern

Every page explicitly checks access. No more relying on "it's behind `/admin/` so it must be fine."

| Namespace | Gate | Helper |
|-----------|------|--------|
| `/agency/settings/*` | `requireAgencyAdmin()` | Redirect to `/admin/login` if not admin |
| `/agency/[orgSlug]/*` | `requireAgencyAdmin()` | Redirect to `/admin/login` if not admin |
| `/admin/[orgSlug]/*` | `requireOrgMember(orgSlug)` | Redirect to `/admin/login` if not member |

### Mutation Protection

For customer-facing pages that allow limited self-service:

- **Notifications API**: Add check — members can only create/delete subscriptions where `subscriber_type = 'user'` AND `subscriber_value = currentUser.id` (their own)
- **Profile API**: Add check — members can only update their own `org_members` record
- **All other mutations**: Require `is_agency_admin` at the API level, not just the page level

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

### Phase 3: Lock Down Customer Portal

16. Replace `/admin/[orgSlug]/settings/page.tsx` with redirect to org dashboard
17. Replace `/admin/[orgSlug]/brand/page.tsx` with redirect to org dashboard
18. Simplify `/admin/[orgSlug]/notifications/page.tsx` — self-service only (own preferences)
19. Simplify `/admin/[orgSlug]/team/page.tsx` — read-only roster view
20. Create `/admin/[orgSlug]/profile/page.tsx` — display name edit
21. Replace `/admin/[orgSlug]/locations/[locationId]/reviews/autopilot` with redirect
22. Replace `/admin/[orgSlug]/locations/[locationId]/lander/settings` with redirect
23. Simplify `/admin/[orgSlug]/locations/[locationId]/notifications/page.tsx` — self-service only
24. Update customer sidebar: remove Brand Config, remove Settings, add Profile
25. Add `is_agency_admin` checks to mutation APIs that currently lack them

**Verification:** Log in as a non-admin org member. Verify no config pages are accessible. Verify notification self-service works. Verify profile edit works. Verify old config URLs redirect gracefully.

### Phase 4: Polish & Cleanup

26. Add redirects for all old routes (keep for 30 days, then remove)
27. Remove duplicated components (if any config forms were copied vs moved)
28. Update CLAUDE.md route documentation
29. Test full flow: agency admin configures org → customer sees result

---

## Migration Path

1. **Build phases 1-2** — New agency config routes created. Both old and new routes work.
2. **Build phase 3** — Customer portal locked down. Old config routes redirect.
3. **Evaluate** — Run for a week. Check no workflows are broken.
4. **Clean up** — Remove redirect stubs, delete orphaned components.

Old routes redirect to dashboard (not to the new agency routes) because customers hitting a bookmarked config URL shouldn't land in an access-denied page.

---

## What's NOT in This Build

- **Role-based permissions beyond agency/member** — No "org admin" role. Binary: agency admin or member.
- **Customer self-service for org settings** — Customers can't edit org name/logo. Agency handles that.
- **Review funnel creation gating** — Currently any member can create funnels. Evaluate separately whether to restrict.
- **Form creation gating** — Same as above.
- **Post topic management gating** — Same as above.
- **Billing/subscription pages** — Future `/agency/settings/billing`. Not in scope.
