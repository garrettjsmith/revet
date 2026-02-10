# Revet — Agent Guidelines

This file is read by AI agents working on the codebase. Follow these rules strictly.

## What Revet Is

A search everywhere optimization platform for multi-location mid-market businesses. Not a review tool — reviews are one module of many. The platform manages profiles, local landing pages, reviews, citations, and reporting across all search surfaces.

## Product Philosophy

- **"Fake SaaS"** — Customers (C-levels, Directors) log in to see data, not to do work. The agency operates the platform on their behalf. Customer-facing pages are dashboards and reports. Config, creation, and editing are agency-only.
- **Agency admins configure. Customers observe.** Gate all creation/edit/config UI behind `is_agency_admin`. Customer org members see read-only dashboards with stats, trends, and alerts.
- **Mobile-first design.** Assume customers check on their phone. Design for glanceability — big numbers, clear trends, green/red signals. Minimize text.
- **Location is the atomic unit.** Every feature (reviews, landers, citations, profiles, reports) is scoped to a location. Locations belong to orgs. Orgs belong to the agency.

## Tech Stack

- **Next.js 14** App Router + TypeScript
- **Supabase** — Postgres, Auth, RLS
- **Tailwind CSS 3.4** — utility-first, no CSS modules
- **Resend** — transactional email
- **Vercel** — deployment, serverless functions

## Design System

### Admin UI (internal — `/admin/*`, `/agency/*`)

The "warm editorial blueprint" design:

- **Colors**: cream (`#F2EDE4`) background, ink (`#1A1A1A`) text, warm-gray (`#9A9488`) secondary, warm-border (`#D5CFC5`) borders
- **Typography**: Instrument Serif for headings (`font-serif`), Inter for body (`font-sans`), DM Mono for code (`font-mono`)
- **Components**: Rounded cards with `border border-warm-border rounded-xl`, pill buttons with `rounded-full`, subtle hover transitions
- **Blueprint grid**: Used sparingly on marketing/landing pages only, never on dashboards

### Public Pages (customer-facing — `/r/*`, `/l/*`, `/f/*`)

**Business-neutral.** These pages represent the customer's business, NOT Revet's brand:

- **Background**: White (`bg-white`), no cream, no blueprint grid
- **Text**: Standard Tailwind grays (`text-gray-900`, `text-gray-500`, `text-gray-400`)
- **Typography**: System sans-serif only (`font-semibold`), never Instrument Serif
- **Accents**: Use the business's `primary_color` from their profile for buttons, icons, and highlights
- **Footer**: Minimal "Powered by revet.app" in `text-gray-300`
- **No Revet branding** in the main content area

### Emails

- Simple, plain-text style. No heavy HTML cards or colored headers.
- From address: `noreply@use.revet.app`
- Minimal formatting: profile name, content, subtle footer
- Use `buildXxxEmail()` functions in `src/lib/email.ts`

## Architecture Rules

### Data Model

```
Agency (is_agency_admin flag on org_members)
  └── Organization (organizations table)
       └── Location (locations table, type: place | practitioner | service_area)
            ├── Review Profiles (review_profiles)
            ├── Local Landers (local_landers — planned)
            ├── GBP Profiles (gbp_profiles)
            ├── Review Sources (review_sources)
            └── Citations (planned)
```

### Routes

- `/admin/[orgSlug]/*` — org-scoped, customer-visible dashboards
- `/admin/[orgSlug]/locations/[locationId]/*` — location-scoped pages
- `/agency/*` — agency admin only (integrations, bulk ops, config)
- `/r/[slug]` — public review funnels
- `/l/[slug]` — public local landers
- `/api/*` — API routes

### Supabase / RLS

- **NEVER** write RLS policies that query the same table they protect — causes infinite recursion
- Use SECURITY DEFINER helper functions for membership lookups: `get_user_org_ids()`, `get_user_admin_org_ids()`, `get_user_location_ids()`, `is_agency_admin()`
- For mutations, prefer SECURITY DEFINER RPC functions over INSERT/UPDATE policies
- Always `DROP POLICY IF EXISTS` before `CREATE POLICY` (no `IF NOT EXISTS` syntax)
- Use `ON CONFLICT DO NOTHING` in trigger functions

### Server Components vs Client

- Default to server components. Only use `'use client'` when you need interactivity (forms, state, event handlers).
- Server components use `createServerSupabase()` for user-scoped queries
- Admin/bypass queries use `createAdminClient()` (service role, no RLS)
- Agency admin checks: use `checkAgencyAdmin()` from `src/lib/locations.ts`

### API Routes

- Set `maxDuration` for long-running operations (Google discovery, batch mapping)
- Use `createAdminClient()` for public-facing endpoints (no user session)
- Use `createServerSupabase()` for authenticated endpoints

## Coding Standards

- **TypeScript strict.** No `any` unless interfacing with Supabase's generic responses.
- **Tailwind only.** No inline styles except for dynamic values (user-configured colors).
- **No over-engineering.** Simple is better. Three similar lines > premature abstraction.
- **No unnecessary files.** Don't create utilities, helpers, or abstractions for one-time operations.
- **No emoji in code or UI** unless the user explicitly requests it.
- **Commit messages**: Start with what changed (verb), explain why in the body if non-obvious.

## Agent Principles

These four principles govern how you approach ALL work. See `docs/agent-coding-principles.md` for detailed examples.

### 1. Think Before Coding

Don't assume. Don't hide confusion. Surface tradeoffs.

- State your assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them — don't pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear, stop. Name what's confusing. Ask.

### 2. Simplicity First

Minimum code that solves the problem. Nothing speculative.

- No features beyond what was asked.
- No abstractions for single-use code.
- No "flexibility" or "configurability" that wasn't requested.
- No error handling for impossible scenarios.
- If you write 200 lines and it could be 50, rewrite it.

### 3. Surgical Changes

Touch only what you must. Clean up only your own mess.

- Don't "improve" adjacent code, comments, or formatting.
- Don't refactor things that aren't broken.
- Match existing style, even if you'd do it differently.
- Remove imports/variables/functions that YOUR changes made unused.
- Don't remove pre-existing dead code unless asked.
- **The test**: Every changed line should trace directly to the user's request.

### 4. Goal-Driven Execution

Define success criteria. Loop until verified.

- Transform vague tasks into verifiable goals.
- For multi-step tasks, state a brief plan with verification for each step.
- Write tests that reproduce bugs BEFORE fixing them.
- Strong success criteria let you loop independently. Weak criteria require clarification — ask for it.

## Key Files

| File | Purpose |
|------|---------|
| `src/lib/supabase/server.ts` | Server-side Supabase client (user session) |
| `src/lib/supabase/admin.ts` | Admin Supabase client (service role, no RLS) |
| `src/lib/supabase/client.ts` | Client-side Supabase client |
| `src/lib/org.ts` | Org lookup helpers |
| `src/lib/locations.ts` | Location helpers + `checkAgencyAdmin()` |
| `src/lib/types.ts` | Shared TypeScript types |
| `src/lib/email.ts` | Resend email sending + template builders |
| `src/lib/google/auth.ts` | Google OAuth token management |
| `src/lib/google/accounts.ts` | GBP account/location discovery |
| `src/components/sidebar.tsx` | Main admin sidebar navigation |
| `tailwind.config.ts` | Design tokens (colors, fonts) |
| `src/app/globals.css` | CSS variables, blueprint grid, animations |

## Pricing Context

Revet targets $100/location for mid-market (10-500 locations). This includes citations, review management, profile monitoring, local landers, and reports. Competitors charge $300-900/location. Flat-tier pricing, not per-location billing.
