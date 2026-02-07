# SEO Platform Organization/Account Models: Structured Comparison

> **Research Date:** 2026-02-07
> **Platforms Covered:** BrightLocal, Yext, Ahrefs, SEMrush, Moz Local, Whitespark

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [BrightLocal](#1-brightlocal)
3. [Yext](#2-yext)
4. [Ahrefs](#3-ahrefs)
5. [SEMrush](#4-semrush)
6. [Moz Local](#5-moz-local)
7. [Whitespark](#6-whitespark)
8. [Cross-Platform Comparison Matrix](#cross-platform-comparison-matrix)
9. [Notable UX Patterns for Managing 5-50+ Organizations](#notable-ux-patterns)
10. [Sources](#sources)

---

## Executive Summary

There are two distinct archetypes among these platforms:

- **Local SEO / Listings Platforms** (BrightLocal, Yext, Moz Local, Whitespark): These organize around **physical locations** as the atomic unit. The hierarchy is typically Account -> Client/Organization -> Location(s). Fields center on NAP (Name, Address, Phone), categories, hours, and directory sync.

- **General SEO Platforms** (Ahrefs, SEMrush): These organize around **domains/websites** as the atomic unit. The hierarchy is Workspace/Account -> Project (domain) with optional client CRM layers. Fields center on tracked keywords, backlink profiles, and site audit configurations.

Yext stands apart with the most sophisticated entity model (500+ built-in fields, custom fields, entity relationships, typed entities), while BrightLocal offers the most agency-oriented Client -> Location grouping model. SEMrush has the richest client CRM overlay on top of its project system.

---

## 1. BrightLocal

### Hierarchy Model

```
Account (Agency)
  └── Client (grouping construct)
        └── Location (atomic unit — the business location)
              └── Reports (Local Search Grid, Citation Tracker, etc.)
```

### How Clients Work

A **Client** in BrightLocal is a lightweight grouping entity used to associate one or more Locations. Client fields are minimal:

| Field | Required | Description |
|-------|----------|-------------|
| Company Name | Yes | The client's company name |
| Company URL | No | Client's website |
| Unique Client Reference | No | Custom internal reference (for cross-referencing with external CRM/DB) |
| Status | No | "Existing Client" or "Lead" |

Clients exist primarily so agencies can **group and filter locations** belonging to the same business or engagement.

### How Locations Work

A **Location** is the core entity. It represents a single physical business presence. Locations can be added manually, imported from Google Business Profile, or bulk-imported via CSV.

**Location fields include:**

| Field | Required | Source |
|-------|----------|--------|
| Business Name | Yes | Manual or GBP import |
| Street Address (Line 1, Line 2) | Yes* | Manual or GBP |
| City / Locality | Yes | Manual or GBP |
| Region / State | Yes | Manual or GBP |
| Postcode / ZIP | Yes | Manual or GBP |
| Country | Yes | Manual or GBP |
| Contact Telephone | Yes | Manual or GBP |
| Website URL | No | Manual or GBP |
| Business Categories | No | Manual or GBP |
| Contact Name | No | Manual |
| Contact Email | No | Manual |
| Unique Location Reference | Auto | Auto-generated as `BUSINESSNAME-ZIPCODE`, editable |
| GBP Connection | No | OAuth link to Google Business Profile |

*Service-area businesses use a verified physical address that is not displayed publicly.

**Location types:**
- **Active Location**: For ongoing management and scheduled recurring reports. Consumes plan allowance.
- **Ad-hoc Location**: For one-off audits and prospect analysis. Does not consume active allowance.

### UI Navigation / Switching Between Clients & Locations

- **Top-level view**: "All Locations" page accessible from the top menu, showing all locations across all clients.
- **Clients tab**: Within "All Locations", a "Clients" tab lists all clients. Clicking a client filters to its locations.
- **Location Dashboard**: Each location has its own dashboard with all associated reports. A **dropdown** within the dashboard allows switching between locations belonging to the same client.
- **Search**: Locations can be searched by name, city, or Unique Location Reference.
- **Client Access**: White-labeled external dashboard URLs can be shared with clients (password-protected), giving them read access to their own data + ability to respond to reviews.

### Tool/Feature Scoping

- **Reports are scoped per-location**: Local Search Grid, Citation Tracker, Reputation Manager, GBP Audit, Rank Tracker all run per-location.
- **Client is a filter/group only**: No reports run at the "client" level; clients simply group locations.
- **White-label settings** operate at the account level (branding) but dashboards are per-location.
- **Agency Lead Generator** is a global (account-level) widget.

### Notable Patterns

- Navigation is criticized as "clunky" when managing dozens/hundreds of locations.
- The Client -> Location relationship is a simple assignment (one client has many locations).
- Pricing scales by number of active locations (not clients).

---

## 2. Yext

### Hierarchy Model

```
Parent Account (Corporate / Agency / Reseller)
  └── Sub-Account (Customer / Franchise)   [optional tier for resellers]
        └── Entity Folder Structure (organizational grouping)
              └── Entity (typed: Location, Restaurant, Healthcare Professional, etc.)
                    └── Fields (500+ built-in + unlimited custom fields)
                    └── Entity Relationships (parent-child, linked entities)
```

### Entity Model (Core Concept)

Yext's fundamental unit is the **Entity**, not a "location." An entity is a typed object stored in the **Knowledge Graph**. This is significantly more flexible than other platforms.

**Built-in Entity Types:**
- Location (generic)
- Restaurant
- Hotel
- Healthcare Facility
- Healthcare Professional
- Financial Professional
- ATM
- Event
- FAQ
- Job
- Product
- (and more)

Each entity type determines which fields are available. Fields that are universal across types include Name and Photos; others are type-specific (e.g., NPI for Healthcare Professional, Menu for Restaurant).

### Fields Per Location Entity

Yext has **500+ built-in fields** plus the ability to create unlimited **custom fields**. Key location fields include:

| Field | Type | Notes |
|-------|------|-------|
| Name | Text | Required |
| Address (line1, line2, city, region, postalCode, countryCode) | Structured | Required for location types |
| Main Phone | Phone | Required |
| Category IDs | Multi-select | Maps to publisher taxonomies |
| Hours | Structured (hours object) | Regular + holiday hours |
| Website URL | URL | |
| Description | Long text | Publisher-specific character limits enforced |
| Photo Gallery | Media | At least one photo recommended |
| Logo | Media | |
| Payment Methods | Multi-select | |
| Languages | Multi-select | |
| Year Established | Integer | |
| Associations | Text | |
| Brands | Text | |
| Products/Services (ECLs) | Structured lists | Menus, Products & Services, Bios |
| Social profiles | URLs | Facebook, Twitter, Instagram, etc. |
| Custom Fields | Any type | Text, number, boolean, date, rich text, photo, URL, entity relationship, etc. |

**Custom Field Types:** Single-line text, multi-line text, number, date, boolean, rich text, photo, gallery, URL, CTA, hours, address, entity relationship, and more.

### Entity Relationships

Yext supports structured relationships between entities:

- **Independent-Establishment-In**: Distinct business within another (e.g., Starbucks inside a Target).
- **Department In**: Department of parent entity (e.g., Pharmacy within Albertsons).
- **Works At**: Practitioner at a location (e.g., Dr. Smith at XYZ Clinic).
- **Custom Relationships**: Via Relationship custom field type, supporting one-way and two-way links.

The **Linked Entities Module** in the UI sidebar shows all relationships for any entity being viewed.

### Entity Organization (Folders)

Two folder structure options:
1. **Universal Folder Structure**: One hierarchy for all entity types (e.g., by region).
2. **Entity Type-Specific Folder Structure**: Separate folder hierarchies per entity type (e.g., Locations by region, Professionals by office).

### Multi-Account / Franchise Management

- **Parent Account / Sub-Account model**: The parent account is the "management" layer; sub-accounts are individual "customer" accounts.
- Sub-accounts can be created programmatically via the **Agreements API**.
- Dashboards created in the parent account can be **shared down** to sub-accounts.
- **Reseller accounts** let agencies/partners white-label and manage sub-accounts.

### UI Navigation

- **Left navigation bar**: Knowledge Graph > Entities lands on the Entity Search screen.
- **Entity Search**: Filter, search, and bulk-action on entities. Left sidebar shows entity counts by type and folder.
- **Entity Edit**: Click into any entity to view/edit its fields. Right sidebar shows linked entities, scheduled updates, language profiles.
- **Entity History tab**: View past data updates for any entity.
- **Home Screen / Custom Dashboard**: Drag-and-drop modules (analytics, reviews, quick links) filtered to the user's access scope.
- **Account switching**: For parent/sub-account setups, users switch via account selector in the dashboard header.

### Tool/Feature Scoping

- **Listings sync**: Per-entity. Each entity syncs to 200+ directories.
- **Reviews**: Per-entity.
- **Analytics**: Per-entity, per-folder, or account-wide.
- **Pages**: Per-entity (each entity can have its own landing page).
- **Search**: Account-wide (AI search across all entities).
- **User permissions**: Scoped to specific entities or folders (e.g., a franchisee can only see their own locations).

### Notable Patterns

- Most data-rich entity model of any platform studied (500+ fields + custom).
- Role-based access with per-entity/per-folder scoping is ideal for franchise governance.
- Entity Relationships are unique and powerful for modeling real-world org structures.
- Connectors allow ingesting entity data from external systems (spreadsheets, APIs, GBP).

---

## 3. Ahrefs

### Hierarchy Model

```
Workspace (owned by account holder)
  └── Folder (organizational grouping — Advanced plan+)
        └── Project (a verified website/domain/subfolder/URL)
              └── Tools: Site Audit, Rank Tracker, Site Explorer, etc.
  └── Portfolio (cross-project aggregation view)
```

### How Projects Work

A **Project** in Ahrefs represents a single website (domain, subdomain, subfolder, or specific URL). Projects are the atomic unit. There is no built-in "client" or "organization" entity.

**Project setup fields:**

| Field | Required | Description |
|-------|----------|-------------|
| URL / Domain | Yes | The target domain, subdomain, subfolder, or exact URL |
| Scope | Yes | "Domain" (all subdomains), "Subdomain" (specific), "Path" (subfolder), "URL" (exact page) |
| Verification | Yes (for unlimited projects) | Via DNS, HTML file, meta tag, or Google Search Console import |
| Site Audit schedule | No | Day, time, timezone, frequency |
| Crawl settings | No | Speed, JS execution, HTTP auth, URL include/exclude filters |
| Seed URLs | No | Website root, sitemaps, custom URL lists, backlink sources |
| Rank Tracker keywords | No | Keywords to track with location targeting |
| Competitors | No | Competitor domains to track alongside |

**Dashboard metrics per project:**
- Organic traffic (estimated monthly)
- Organic keywords (count)
- Backlinks (count)
- Referring domains (count)
- Traffic value (PPC equivalent cost)
- Health Score (from Site Audit)
- Rank Tracker position changes

### Organization Methods

1. **Starring / Pinning**: Mark projects as "Priority" (starred). Toggle "Pin starred" to surface them at the top of the dashboard.
2. **Folders**: Group projects into folders (available on Advanced plan+). Can share specific folders with specific team members. Sub-folders supported with inherited sharing.
3. **Tags**: Apply multiple tags to a single project for flexible filtering and sorting.
4. **Portfolios**: Aggregate metrics across up to 10 domains. Useful for client reporting (e.g., "Client X Portfolio" showing all their properties) or author performance tracking.
5. **Saved Filter Presets**: Save frequently-used filter configurations per user and per project; shareable across projects.

### Workspaces & Access

- Each account has one **Workspace**.
- Invited members can access both their own workspace and workspaces they are invited to.
- **Roles**: Owner, Admin, Member, Guest. Guest can only access explicitly shared objects.
- Folder sharing inherits down to sub-folders and projects.
- Enterprise plans offer more granular access controls.

### UI Navigation

- **Dashboard**: Flat list or folder-based view of all projects. Trend graphs for each project. Toggle between "All" and "Starred" views.
- **Project switching**: Click any project in the dashboard list to enter its detail view. No dropdown switcher; you return to the dashboard to switch.
- **Search**: Search bar on the dashboard to find projects by name.
- **Folder navigation**: Click into folders to see nested projects.

### Tool/Feature Scoping

- **Site Explorer**: Can be used ad-hoc on any domain (not project-scoped). Uses global crawl data.
- **Keywords Explorer**: Global tool, not project-scoped.
- **Site Audit**: Project-scoped. Crawls only the project's domain.
- **Rank Tracker**: Project-scoped. Tracks keywords for the project's domain.
- **Content Explorer**: Global tool.
- **Dashboard metrics**: Project-scoped aggregations.
- **Portfolios**: Cross-project aggregation.

### Notable Patterns

- No built-in "client" concept. Agencies use folders or portfolios to simulate client groupings.
- The distinction between project-scoped tools (Site Audit, Rank Tracker) and global tools (Site Explorer, Keywords Explorer) is important.
- Verification requirement limits who can add projects (must prove ownership or GSC access).
- Community has requested client-specific workspace access features (not yet implemented).

---

## 4. SEMrush

### Hierarchy Model

```
Account (Agency / Individual)
  └── CRM: Client Card (client metadata + linked resources)
        └── Linked Folder(s)/Project(s) (one domain per folder)
              └── Tools: Position Tracking, Site Audit, Backlink Audit, etc.
        └── Linked Reports
        └── Files (50GB storage)
        └── Tasks
  └── Folder (formerly "Project") — domain-locked monitoring container
        └── Tool configurations (Position Tracking, Site Audit, etc.)
```

### The Dual Model: Folders (Projects) + CRM Client Cards

SEMrush has two organizational layers:

**1. Folders (formerly "Projects"):**
Each folder is associated with a single domain and contains tool configurations.

| Field | Required | Description |
|-------|----------|-------------|
| Folder Name | Yes | Descriptive label |
| Domain | Yes (once attached, locked) | The target website domain |
| Tags | No | For filtering and organization |
| Sharing | No | Share with team members |

Tools within a folder: Position Tracking, Site Audit, Backlink Audit, On-Page SEO Checker, Social Media Tracker, Social Media Poster, Brand Monitoring, Content Analyzer, PPC Keyword Tool, Ad Builder.

**Folder limits by plan:**
- Pro: 5
- Guru: 15
- Business: 40
- Enterprise: Unlimited

**2. CRM Client Cards:**
The CRM is a separate overlay for managing client relationships. Client cards are richer than BrightLocal's client entity.

| Field | Required | Description |
|-------|----------|-------------|
| Client Name | Yes | Company or individual name |
| Website / Domain | No | Client's primary website |
| Contact Type | No | Type of contact/relationship |
| Status | No | Custom status (Active, Lead, etc.) |
| Budget | No | Monthly/project budget |
| Industry | No | Client's industry vertical |
| Country | No | Client's country |
| City | No | Client's city |
| Contact Person Details | No | Name, email, phone, Skype, social profiles |
| Notes | No | Free-text notes |
| Related Links | No | Links to proposals, SOWs, terms, etc. |
| Tags | No | For filtering and grouping |

**Enriched data (auto-populated via Wappalyzer):**
- Contact information (emails, phone numbers, office addresses, employee names)
- Connected analytics tools, trackers, CRMs, ad platforms, tag managers
- IP address, supported languages
- Social media profile links

**CRM features:**
- Link client cards to SEMrush folders/projects and reports
- Assign teammates to specific clients
- Task management with priority, type, status, time estimates
- File storage per client (from 50GB pool)
- Client Portal for white-labeled read access
- First 50 client cards are free; more via Agency Growth Kit add-on

### UI Navigation

- **Left sidebar**: Management section lists Folders, CRM, My Reports, Lead Finder.
- **Folder list view**: Shows all folders with key metric blocks (organic traffic, backlinks, etc.). Filterable by tags.
- **CRM dashboard**: Card/list view of all clients with status, metrics, and quick links to linked projects.
- **Switching**: Click a folder or client card to drill in. No global dropdown switcher.
- **Client Portal**: White-labeled external URL for clients to view their own data. Agencies can screen-share showing only one client's data.

### Tool/Feature Scoping

- **Folders**: Per-domain. All tools within a folder operate on that domain.
- **CRM**: Per-client. Links to one or more folders.
- **Reports**: Can be scoped to any domain (not limited to projects).
- **Competitive research tools** (Domain Overview, Keyword Gap, etc.): Global, ad-hoc.
- **Position Tracking**: Per-folder (per-domain), with keyword and location targeting.
- **API**: Projects API for programmatic management (Business plan+).

### Notable Patterns

- The CRM layer is uniquely rich for an SEO platform (budget, industry, contact details, file storage, tasks).
- Auto-enrichment of client data via Wappalyzer is a differentiator.
- Domain lock-in per folder means new folder needed for each domain.
- Agency Growth Kit add-on unlocks CRM power features.
- White-label is deeply integrated (reports, client portal, PDF exports).

---

## 5. Moz Local

### Hierarchy Model

```
Account
  └── Location (the atomic unit — one per physical business location)
        └── Listings (synced to 90+ directories)
        └── Reviews
        └── Social Posts
        └── Analytics / Visibility Score
```

### How Locations Work

Moz Local uses a flat model: the account contains locations, and each location is a physical business. There is **no client or organization grouping layer** in the standard product. For agencies managing multiple businesses, each location is a standalone entity within the account.

**Location fields:**

| Field | Category | Description |
|-------|----------|-------------|
| Business Name | NAP | Required. Must match GBP/Facebook exactly. |
| Address (Street, City, State, ZIP) | NAP | Required. Physical address. |
| Phone Number | NAP | Required. Primary contact number. |
| Business Categories | Discovery | Primary + secondary categories |
| Hours of Operation | Operations | Regular hours + special hours |
| Website URL | Digital | Business website |
| Description | Content | Plain text description of business |
| Photos / Logo | Media | Images for listings |
| Services | Content | Services offered |
| Attributes | Content | Business attributes (wheelchair accessible, etc.) |
| Social Profiles | Digital | Facebook, Twitter, etc. |
| Payment Methods | Operations | Accepted payment types |

**Verification requirement:** Each location must have a verified Google Business Profile or Facebook Business page to confirm ownership.

### Organization & Navigation

- **Locations tab**: Primary navigation to see all locations. If managing multiple locations, the list view shows all with status indicators.
- **Per-location dashboard**: Each location has its own view showing listing sync status, reviews, social posts, and analytics.
- **Networks view**: Centralized view of all directories/platforms with connection status per location.
- **No folder/client grouping**: Agencies managing multiple businesses see a flat list. Multi-user capabilities are available for accounts managed by Moz's Account Management team.

### Listing Sync Model

Each location's data is distributed to partner directories:
- **Listings in Sync**: Data matches across all directories.
- **Listings Requiring Attention**: Discrepancies detected (wrong category, old phone number, etc.).
- **Listings That Cannot Be Updated**: Directories that don't support automated updates.

Changes made in the Moz Local dashboard propagate to all connected directories automatically.

### Tool/Feature Scoping

- **Everything is per-location**: Listing sync, review monitoring, social posting, analytics, visibility score.
- **No cross-location aggregation** in the standard product (no "portfolio" or "client overview" view).
- **Visibility Index**: Per-location score based on listing accuracy and presence.
- **Profile Completeness**: Per-location metric.

### Pricing Model

Per-location pricing:
- Lite: ~$14-16/month per location (listings, monitoring, alerts)
- Preferred: ~$20/month per location (+ reviews, competitors, social)
- Elite: ~$33/month per location (+ AI, advanced social, detailed reporting)

### Notable Patterns

- Simplest model of all platforms studied. No hierarchy beyond account -> location.
- Strength is in ease of setup (50 locations in ~15 minutes reported).
- Weakness for agencies: no way to group locations by client/business.
- Cancellation may revert listings to pre-Moz-Local state.
- Best suited for US, UK, and Canada.

---

## 6. Whitespark

### Hierarchy Model

```
Account
  └── Tool-specific Campaigns (not unified across tools)
        ├── Local Citation Finder Campaign (per business location)
        │     └── Keywords (up to 5), Competitors (auto-discovered)
        ├── Local Rank Tracker Campaign (per business + location)
        │     └── Keywords, Tracking Locations (geo-points), Competitors
        ├── Reputation Builder Campaign
        │     └── Review requests, monitoring
        └── GBP Management
```

### Key Difference: Tool-Centric, Not Client-Centric

Whitespark is a **collection of independent tools**, each with its own campaign structure. There is no unified "client" or "organization" entity that spans tools. You purchase and configure each tool separately.

### Local Citation Finder Campaign Fields

| Field | Description |
|-------|-------------|
| Business Name | The business being tracked |
| Business Address | Physical location |
| Business Phone | Contact number |
| Website URL | Business website |
| Keywords (up to 5) | Target search terms for citation discovery |
| Competitors | Auto-discovered from keyword rankings (top 10 per keyword) |

**Campaign features:**
- Automatic weekly re-scan for new citations and competitors.
- Citation workflow management: tag opportunities as "useless," "to do," "submitted," or "got it."
- Notes per citation opportunity (e.g., pricing details).
- Results sorted by "submittability."
- My Citations tab for confirmed citations.

### Local Rank Tracker Campaign Fields

| Field | Description |
|-------|-------------|
| Business Name | The business being tracked |
| Business Location(s) | One or more physical locations |
| Keywords | Target keywords per tracking location |
| Tracking Locations | Up to 225 geo-points (geo-coordinates, ZIP codes, city centers) |
| Competitors | Manually added competitor businesses |
| Google CID | Auto-tracked Google Customer ID for each location |
| Search Engines | Google, Bing |
| Devices | Desktop, Mobile |

**Tracked data points:**
- Local Pack rankings
- Google Maps rankings
- Organic rankings
- Visibility Score (weighted CTR metric)
- Competitor comparisons

### Organization & Navigation

- **Per-tool dashboards**: Each tool has its own interface. No unified client view.
- **Campaign list**: Within each tool, campaigns are listed and filterable.
- **Keyword Groups**: Within Rank Tracker, filter by keyword groups and locations.
- **Shared report URLs**: Create password-protected URLs to share campaign results with clients.
- **Email alerts**: Daily, weekly, or monthly campaign performance updates.

### Tool/Feature Scoping

- **Each tool is independently scoped** to its own campaign.
- **No cross-tool linking**: A Citation Finder campaign and Rank Tracker campaign for the same business are not linked.
- **No client grouping**: Multiple campaigns for the same client are only associated by naming convention.

### Pricing (Per Tool)

Tiers based on number of campaigns/locations:
- Small Business: 1 location
- Specialist: Up to 10 locations
- Agency: Up to 20 locations
- Enterprise: Up to 100 locations

### Notable Patterns

- Best-in-class citation discovery (scours entire internet, not just known directories).
- Geo-grid rank tracking with 225 geo-points is uniquely granular.
- Tool independence is both a strength (buy only what you need) and weakness (no unified client view).
- Workflow management features (tagging, notes, status) are strong within Citation Finder.
- Setup can be challenging for new users.

---

## Cross-Platform Comparison Matrix

| Dimension | BrightLocal | Yext | Ahrefs | SEMrush | Moz Local | Whitespark |
|-----------|-------------|------|--------|---------|-----------|------------|
| **Atomic Unit** | Location | Entity (typed) | Project (domain) | Folder (domain) | Location | Campaign (per tool) |
| **Client/Org Layer** | Client (grouping) | Sub-Account or Entity Folder | Folder (grouping) | CRM Client Card | None | None |
| **Top-Level Hierarchy** | Account -> Client -> Location | Parent Account -> Sub-Account -> Folder -> Entity | Workspace -> Folder -> Project | Account -> CRM Client -> Folder | Account -> Location | Account -> Tool -> Campaign |
| **Entity Fields Richness** | ~15 location fields | 500+ built-in + custom | ~10 project fields | ~15 CRM fields + domain tools | ~12 location fields | ~6-8 per campaign |
| **Custom Fields** | No | Yes (unlimited) | No | No (but notes/links) | No | Notes only |
| **Entity Relationships** | Client -> Location (simple) | Typed relationships (parent-child, works-at, custom) | None | Client -> Folder (link) | None | None |
| **Multi-Location Model** | 1 Client : N Locations | Entity folders + relationships + sub-accounts | Folders + Portfolios | 1 CRM Card : N Folders | Flat list | Separate campaigns |
| **UI: Switching Orgs** | Dropdown within dashboard + Clients tab filter | Left nav Entity Search + account selector for sub-accounts | Dashboard list + folder navigation + search | Sidebar folders + CRM card list | Locations tab (flat list) | Per-tool campaign lists |
| **UI: Search** | By name, city, unique ref | Entity Search with filters | Dashboard search bar | Folder/CRM search + tags | Location list | Campaign list filter |
| **Tool Scoping** | Per-location | Per-entity, per-folder, or account-wide | Per-project or global (depends on tool) | Per-folder (domain) or global | Per-location | Per-campaign (per-tool) |
| **White-Label** | Yes (dashboards, reports, emails) | Yes (sub-accounts, pages) | No | Yes (reports, client portal, PDFs) | No | Shared report URLs |
| **API** | Yes | Yes (comprehensive) | Yes | Yes (Business plan+) | Limited | Limited |
| **Pricing Model** | Per active location | Per entity/location | Per workspace (plan tiers) | Per account (plan tiers + add-ons) | Per location | Per tool, per location tier |

---

## Notable UX Patterns for Managing 5-50+ Organizations

### Pattern 1: Filter + Search on Flat Lists (Most Common)
**Used by:** BrightLocal, Moz Local, Whitespark

All locations/campaigns shown in a single list with search and filter controls. Simple but breaks down at scale. BrightLocal adds a "Clients" tab filter overlay. Moz Local and Whitespark have no grouping beyond the list.

**Verdict:** Works for 5-20 entities. Becomes painful at 50+.

### Pattern 2: Folder/Tag Hierarchy (Power User)
**Used by:** Ahrefs, SEMrush, Yext

Folders provide explicit grouping (by client, region, product line). Tags/labels add cross-cutting categorization. Ahrefs also has "star/pin" for quick-access favorites.

**Verdict:** Scales well to 50+. Folders map naturally to client relationships. Tags handle edge cases.

### Pattern 3: CRM Overlay (Agency-Oriented)
**Used by:** SEMrush

Dedicated CRM client cards with rich metadata (budget, industry, contacts) linked to project folders. Provides a "client-first" view alongside the "project-first" view.

**Verdict:** Best for agencies who think in terms of clients, not domains. But adds complexity.

### Pattern 4: Sub-Account Isolation (Enterprise/Franchise)
**Used by:** Yext

Completely separate sub-accounts per customer/franchisee, governed by a parent account. Each sub-account has its own entities, users, and permissions. Dashboards can be shared downward.

**Verdict:** Most robust for 50+ organizations with separate governance needs. Overkill for small agencies.

### Pattern 5: Portfolio Aggregation (Cross-Entity Views)
**Used by:** Ahrefs

Group multiple projects into a portfolio for aggregated metric views without merging the underlying data. Useful for agencies presenting combined performance to clients.

**Verdict:** Nice complement to folder organization. Does not replace client grouping.

### Pattern 6: Tool-Specific Campaign Silos
**Used by:** Whitespark

Each tool independently manages its own campaigns. No unified view. Users rely on naming conventions and mental mapping.

**Verdict:** Fine for specialists using one tool. Frustrating for agencies needing holistic client views.

### Key Takeaways for Building a Multi-Org System

1. **The "Client" or "Organization" as a first-class entity is table stakes for agencies.** BrightLocal and SEMrush get this right. Ahrefs and Whitespark lack it.

2. **Location as a sub-entity of Organization is essential for local SEO.** BrightLocal and Yext model this explicitly. Moz Local skips the org layer.

3. **Flexible grouping (folders + tags + search)** is needed for 20+ orgs. A flat list with search alone is insufficient.

4. **Scoped permissions** become critical at scale. Yext's per-entity/per-folder role system is the gold standard.

5. **Cross-entity aggregation** (portfolios, client dashboards) provides the "zoom out" view agencies need.

6. **White-label / client access** should be scoped to the org/client level, not individual entities.

---

## Sources

### BrightLocal
- [Getting Started with BrightLocal](https://help.brightlocal.com/hc/en-us/articles/12625981312402-Getting-Started-with-BrightLocal)
- [How do I assign Locations to a Client?](https://help.brightlocal.com/hc/en-us/articles/360036448974-How-do-I-assign-Locations-to-a-Client)
- [How do I add or edit a Client within BrightLocal?](https://help.brightlocal.com/hc/en-us/articles/360026223373-How-do-I-add-or-edit-a-Client-within-BrightLocal)
- [How do I switch between my Client's Locations?](https://help.brightlocal.com/hc/en-us/articles/220733267--How-do-I-switch-between-my-Client-s-Locations)
- [How do I add a Location?](https://help.brightlocal.com/hc/en-us/articles/220371428-How-do-I-add-a-Location-)
- [What is a Location Dashboard?](https://help.brightlocal.com/hc/en-us/articles/220709467-What-is-a-Location-Dashboard)
- [BrightLocal API Reference](https://apidocs.brightlocal.com/)
- [BrightLocal Review 2026 - Research.com](https://research.com/software/reviews/brightlocal)

### Yext
- [Entity Schema Overview - Hitchhikers](https://hitchhikers.yext.com/modules/kg123-data-modeling-basic/01-entity-schema/)
- [Entities and Entity Types - Hitchhikers](https://hitchhikers.yext.com/tracks/product-basics/kg121-entity-types-intro/01-what-is-an-entity)
- [Fields - Yext Platform](https://www.yext.com/platform/features/fields)
- [Entity Relationships - Yext](https://www.yext.com/platform/entity-relationships)
- [Create an Entity Folder Structure - Yext Help](https://help.yext.com/hc/en-us/articles/360000789566-Create-an-Entity-Folder-Structure)
- [Navigate the Knowledge Graph - Hitchhikers](https://hitchhikers.yext.com/modules/kg110-navigating-knowledge-graph/01-navigating-the-platform/)
- [Set Up Parent Account - Hitchhikers](https://hitchhikers.yext.com/guides/fleet-management-reseller/01-parent-account-setup/)
- [Set Up Sub-Accounts - Hitchhikers](https://hitchhikers.yext.com/guides/fleet-management-reseller/02-subaccount-website-deployment/)
- [Overview of Users, Roles, and Permissions - Hitchhikers](https://hitchhikers.yext.com/modules/pl126-users/01-overview-users-permissions/)
- [Share Custom Dashboards with Sub-Accounts - Yext Help](https://help.yext.com/hc/en-us/articles/19867176986395-Share-Custom-Dashboards-with-Sub-Accounts)
- [Reseller Accounts - Hitchhikers](https://hitchhikers.yext.com/docs/platform/reseller-accounts/)

### Ahrefs
- [How to Organize Projects in Your Dashboard](https://help.ahrefs.com/en/articles/647189-how-to-organize-projects-in-your-ahrefs-dashboard)
- [About Shared Workspaces](https://help.ahrefs.com/en/articles/3945807-about-shared-workspaces)
- [Access Control Features](https://help.ahrefs.com/en/articles/6791295-access-control-features)
- [Dashboard Overview](https://ahrefs.com/academy/how-to-use-ahrefs/dashboard/overview)
- [How to Add Your First Project](https://ahrefs.com/academy/how-to-use-ahrefs/account/add-first-project)
- [Understanding Dashboard Metrics](https://help.ahrefs.com/en/articles/5373022-understanding-the-metrics-in-the-dashboard-overview)
- [Site Audit Settings](https://help.ahrefs.com/en/articles/9082329-how-should-i-configure-my-site-audit-settings)

### SEMrush
- [What is Semrush CRM and How Does It Work?](https://www.semrush.com/kb/1093-crm)
- [How to Manage a Project/Folder in Semrush](https://www.semrush.com/kb/243-managing-a-folder)
- [How to Onboard a New Client with Semrush](https://www.semrush.com/kb/908-onboard-new-client)
- [What is Client Portal in the Agency Growth Kit?](https://www.semrush.com/kb/1167-client-portal)
- [Agency Growth Kit](https://www.semrush.com/agencies/growth-kit/)
- [Semrush Pricing Guide - Backlinko](https://backlinko.com/semrush-pricing)

### Moz Local
- [Moz Local - Martech Zone](https://martech.zone/moz-local-listings-reputation-offer-management/)
- [Moz Local Reviews - G2](https://www.g2.com/products/moz-local/reviews)
- [Moz Local User Manual (PDF)](https://moz-static.s3.amazonaws.com/products/landing-pages/Moz-Local-User-Manual.pdf)
- [Moz Local Reviews - Software Advice](https://www.softwareadvice.com/local-seo-tools/moz-local-profile/)
- [Moz Local Alternatives - Search Atlas](https://searchatlas.com/blog/moz-local-alternatives/)
- [Moz Local Listing Description Guide](https://plaintextconverter.com/moz-local-listing-plain-text-description-of-business/)

### Whitespark
- [Local Citation Finder](https://whitespark.ca/local-citation-finder/)
- [Local Rank Tracker](https://whitespark.ca/local-rank-tracker/)
- [Local Ranking Grids](https://whitespark.ca/local-ranking-grids/)
- [Multi-Location Rankings - Whitespark Blog](https://whitespark.ca/blog/local-rank-tracker-multi-location-rankings/)
- [Whitespark Review - MADX](https://www.madx.digital/learn/whitespark-reviews)
- [Whitespark Review - Search Atlas](https://searchatlas.com/blog/whitespark-review/)
- [Enterprise Services - Whitespark](https://whitespark.ca/enterprise-services/)
- [Complete Guide to Small Business Local SEO - Whitespark](https://whitespark.ca/guides/how-to-develop-a-local-seo-strategy-the-complete-guide-for-small-businesses/)
