# Feature Spec: Local Landers

*Revet-hosted location landing pages with auto-generated schema markup.*

## Problem

Multi-location businesses need location-specific landing pages with structured data (LocalBusiness schema, provider schema, FAQ schema, etc.) to rank in traditional search and be recommended by AI search engines.

Today, this requires:
1. IT or a web agency to build pages on the company website ($5K-50K+)
2. Manual schema markup per location (error-prone, never maintained)
3. Months of back-and-forth to update hours, services, or provider info

**Result**: Most multi-location businesses either have no location pages, or have stale ones with broken/missing schema.

## Solution

Revet hosts the pages. The agency configures them. Schema is auto-generated from location data that Revet already manages. Pages update instantly when GBP data changes.

## First Customer

**Gemaire Distributors** (gemaire.com) — 114 locations. Needs location landing pages immediately. This is the validation target.

## How It Works

### Public URL

```
/l/[slug]
```

Each location gets a public landing page. Slugs are auto-generated from the location name (e.g., `gemaire-baton-rouge`). Optionally, customers can CNAME a subdomain (e.g., `locations.gemaire.com`) to Revet.

### Data Flow

```
GBP Profile (synced) ──┐
                        ├──→ Local Lander (rendered page + schema)
Location (Revet DB) ────┘
```

The page renders from two data sources:
1. **Location record** — name, address, phone, email, hours, type, metadata
2. **GBP profile** (if synced) — categories, description, photos, attributes, reviews summary

### Page Sections

Every lander includes these sections, populated automatically:

| Section | Data Source | Schema |
|---------|-----------|--------|
| **Header** | Location name, logo, primary color | Organization |
| **NAP** | Name, address, phone from location record | LocalBusiness (or subtype) |
| **Hours** | From GBP profile or location metadata | OpeningHoursSpecification |
| **About** | GBP description or custom field | description property |
| **Services** | From GBP categories + custom services list | hasOfferCatalog / Service |
| **Reviews Summary** | Aggregate rating + count from synced reviews | AggregateRating |
| **Recent Reviews** | Top 3-5 positive reviews from review_sources | Review |
| **Map** | Embedded map or static map image from place_id | GeoCoordinates |
| **Contact CTA** | Phone, directions, website link | ContactPoint |
| **FAQ** | From GBP Q&A or custom entries | FAQPage |

For **practitioner** locations (e.g., healthcare providers), additional sections:
- Provider credentials, specialties
- Insurance accepted
- Booking link

For **service area** locations:
- Service area description (cities/regions served)
- No physical address displayed

### Schema Markup

Every page outputs JSON-LD structured data in the `<head>`. Schema is **auto-generated** from the location + GBP data — not manually configured.

```json
{
  "@context": "https://schema.org",
  "@type": "Dentist",
  "name": "Sturdy Health Cardiology",
  "address": {
    "@type": "PostalAddress",
    "streetAddress": "211 Park St",
    "addressLocality": "Attleboro",
    "addressRegion": "MA",
    "postalCode": "02703"
  },
  "telephone": "+15085551234",
  "openingHoursSpecification": [...],
  "aggregateRating": {
    "@type": "AggregateRating",
    "ratingValue": "4.7",
    "reviewCount": "142"
  },
  "review": [...],
  "hasOfferCatalog": {...},
  "geo": {
    "@type": "GeoCoordinates",
    "latitude": 41.9445,
    "longitude": -71.2856
  }
}
```

**Schema type mapping** from location type:
- `place` → `LocalBusiness` or more specific subtype from GBP primary category (e.g., `Dentist`, `Plumber`, `Restaurant`)
- `practitioner` → `Physician`, `Dentist`, etc. based on category
- `service_area` → `LocalBusiness` with `areaServed`

### Page Design

Business-neutral, not Revet-branded (same philosophy as review funnels):

- White background
- Standard gray text palette
- Business's `primary_color` for accents, buttons, headers
- Business logo if available
- Clean, modern, mobile-first layout
- Fast — static generation with ISR (revalidate every 5 minutes)
- "Powered by revet.app" in footer (subtle)

### AI Content (Phase 2)

Per-location unique content to avoid duplicate content penalties across 100+ location pages:

- **Local context** — AI generates 2-3 paragraphs about the location using its address, services, and local area
- **Service descriptions** — AI expands terse GBP category names into descriptive service sections
- **FAQ generation** — AI generates relevant FAQs from GBP data + industry knowledge
- **Review highlights** — AI summarizes review themes ("Patients praise Dr. Smith's bedside manner and short wait times")

Content is generated once and cached. Re-generated when GBP data changes significantly.

## Data Model

### New Table: `local_landers`

```sql
CREATE TABLE local_landers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  location_id uuid NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
  slug text NOT NULL UNIQUE,

  -- Display config
  heading text,                    -- Override heading (default: location name)
  description text,                -- Override description (default: GBP description)
  primary_color text DEFAULT '#1B4965',
  logo_url text,

  -- Content overrides (null = auto-generate from GBP/location data)
  custom_about text,
  custom_services jsonb,           -- [{name, description}] — overrides GBP categories
  custom_faq jsonb,                -- [{question, answer}]
  custom_hours jsonb,              -- Override GBP hours

  -- AI-generated content (cached)
  ai_content jsonb,                -- {local_context, service_descriptions, faq, review_highlights}
  ai_content_generated_at timestamptz,

  -- Settings
  show_reviews boolean DEFAULT true,
  show_map boolean DEFAULT true,
  show_faq boolean DEFAULT true,
  active boolean DEFAULT true,

  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX idx_local_landers_slug ON local_landers(slug);
CREATE INDEX idx_local_landers_location ON local_landers(location_id);
```

### RLS Policies

```sql
-- SELECT: org members can view their landers
CREATE POLICY "Members can view org landers" ON local_landers
  FOR SELECT TO authenticated
  USING (org_id IN (SELECT get_user_org_ids()));

-- INSERT/UPDATE/DELETE: via SECURITY DEFINER RPC (agency admin only)
```

## Routes

### Public

| Route | Purpose |
|-------|---------|
| `/l/[slug]` | Public location landing page (ISR, 5min revalidate) |

### Admin (customer-facing dashboard)

| Route | Purpose |
|-------|---------|
| `/admin/[orgSlug]/locations/[locationId]/lander` | Lander dashboard — page URL, traffic stats, schema health |

### Admin (agency-only config)

| Route | Purpose |
|-------|---------|
| `/admin/[orgSlug]/locations/[locationId]/lander/settings` | Edit lander config — overrides, toggles, AI regeneration |

## Implementation Plan

### Phase 1: Core Page Rendering (Week 1)

1. Create `local_landers` table + RLS + migration
2. Build `/l/[slug]` public page with ISR
   - Fetch lander config + location data + GBP profile
   - Render all sections from real data
   - Generate JSON-LD schema in `<head>`
   - Business-neutral design, mobile-first
3. Build lander creation UI (agency admin only)
   - Auto-create from location data (one click)
   - Auto-generate slug from location name
   - Pull defaults from GBP profile (logo, description, hours)

### Phase 2: Dashboard + Schema Health (Week 2)

4. Build `/admin/.../lander` dashboard
   - Show page URL (copy button)
   - Track page views (add event tracking)
   - Schema validation status
   - Last updated timestamp
5. Build agency settings page
   - Content overrides (about, services, FAQ, hours)
   - Display toggles (reviews, map, FAQ)
   - Preview link

### Phase 3: AI Content (Week 3)

6. Add AI content generation
   - Local context paragraphs
   - Service descriptions
   - FAQ generation
   - Review theme highlights
7. Cache AI content in `ai_content` jsonb column
8. Re-generation trigger when GBP data changes

### Phase 4: Bulk Operations (Week 4)

9. Bulk lander creation from location list
   - "Create landers for all locations" button in agency UI
   - Progress tracking
10. Bulk AI content generation
11. Custom domain / CNAME support

## Success Metrics

- **For Gemaire**: 114 location pages live with valid schema within 1 week of Phase 1
- **Page speed**: < 1s LCP on mobile (static generation + ISR makes this easy)
- **Schema coverage**: 100% of pages pass Google Rich Results Test
- **Conversion**: Track clicks to phone, directions, website from each page

## Competitive Context

| Competitor | Local Pages | Schema Depth | Price |
|-----------|------------|-------------|-------|
| Yext Pages | Strong (JAMstack) | Strong (auto from Knowledge Graph) | $199-999/loc/yr |
| Uberall | Good (embed on brand domain) | Good (by business type) | $1-5K/mo enterprise |
| Milestone | Best schema (800+ types) | Best-in-class | Custom enterprise |
| SOCi | Decent | Moderate | $23-62K/yr |
| **Revet** | **TBD — build quality pages** | **Auto from GBP + location** | **~$100/loc (bundled)** |

Revet's advantage: pages are part of a $100/loc bundle, not a $200-999/loc standalone product. Schema is auto-generated from data we already sync. No IT bottleneck.
