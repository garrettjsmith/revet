# Revet

Search everywhere optimization platform for multi-location businesses. Manage profiles, local landing pages, reviews, citations, and reporting across all search surfaces — Google, Bing, Apple Maps, ChatGPT, Gemini, Perplexity, and beyond.

## Stack

- **Next.js 14** (App Router) on Vercel
- **Supabase** (Postgres + Auth + RLS)
- **Tailwind CSS 3.4**
- **TypeScript**

## Architecture

### Data Model (3-tier hierarchy)

```
Agency (single tenant, agency admin)
  └── Organization (client account)
       └── Location (physical place, practitioner, or service area)
            ├── Review Profiles (review collection funnels)
            ├── Local Landers (hosted location pages)
            ├── GBP Profiles (synced from Google)
            ├── Review Sources (Google, Yelp, etc.)
            └── Citations (directory listings)
```

### Route Structure

| Path | Purpose | Auth |
|------|---------|------|
| `/admin/[orgSlug]/*` | Org-scoped pages (customer-facing dashboards) | Authenticated org member |
| `/admin/[orgSlug]/locations/[locationId]/*` | Location-scoped pages | Authenticated, location access |
| `/agency/*` | Agency admin tools (config, integrations, mappings) | `is_agency_admin` only |
| `/r/[slug]` | Public review funnel | Public |
| `/l/[slug]` | Public local lander | Public |
| `/api/*` | API routes | Varies |

### Key Principles

- **Customers see data, not knobs.** Org members see dashboards, stats, reports. They don't configure, create, or edit. That's the agency's job.
- **Agency admins see everything.** Config, creation, integrations, mappings — gated behind `is_agency_admin`.
- **Location is the atomic unit.** Every tool (reviews, landers, citations, profiles) is scoped to a location.
- **Mobile-first.** C-level customers check dashboards on their phones. Design for glanceability.

## Setup

### 1. Supabase

1. Create a Supabase project
2. Run migrations in `supabase/migrations/` in order
3. Create your admin user in Authentication > Users

### 2. Environment Variables

Copy `.env.example` to `.env.local` and fill in values:

```
# Required
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
NEXT_PUBLIC_APP_URL=https://use.revet.app
ANTHROPIC_API_KEY=your-anthropic-api-key
RESEND_API_KEY=your-resend-key

# Optional
LOCALFALCON_API_KEY=your-localfalcon-api-key        # Rank tracking via LocalFalcon
IDEOGRAM_API_KEY=your-ideogram-api-key              # GBP post image generation (text-only without)
FALCON_AGENT_MODEL=claude-sonnet-4-5-20250929       # Claude model for Ask Rev agent
CRON_SECRET=your-cron-secret                        # Cron job auth (required in production)
```

### 3. Run

```bash
npm install
npm run dev
```

## Product Modules

| Module | Status | Description |
|--------|--------|-------------|
| **Reviews** | Built | Collection funnels, feedback triage, event tracking, email alerts |
| **GBP Integration** | Built | OAuth, account discovery, location sync, review sync |
| **Local Landers** | Next | Hosted location landing pages with auto-schema |
| **Profile Management** | Planned | GBP field editing, suggested edit queue, bulk operations |
| **Citations** | Planned | Directory listing sync and monitoring |
| **Reporting** | Planned | Automated reports, digests, executive dashboards |
| **AI Visibility** | Planned | Entity health scoring, AI search monitoring |

## License

Proprietary — Revet
