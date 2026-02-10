# Revet — Product Strategy & Prioritized Roadmap

*Synthesized from competitive research, AI search trend analysis, and mid-market buyer needs study. February 2026.*

---

## SWOT Analysis

### Strengths (What Revet has today)
- **Modern stack, mobile-first architecture** — Next.js App Router, built for speed. Competitors (Yext, SOCi, BrightLocal) are legacy web apps with bolted-on mobile experiences
- **Agency + direct model flexibility** — The org → location hierarchy works for both agency-managed and self-serve customers
- **GBP OAuth integration already built** — Account discovery, location sync, review sync pipeline exists
- **Review funnel with analytics** — End-to-end review collection, triage, and event tracking
- **Clean data model** — Location-scoped architecture maps naturally to per-location modules (reviews, profiles, rankings, citations, etc.)
- **No technical debt from legacy** — Building new means no Yext-style listing lock-in baggage, no SOCi stability problems
- **Warm editorial design system** — Distinct brand identity vs. the generic SaaS look of competitors

### Weaknesses (Gaps to close)
- **Reviews only** — One module built out of ~20 needed. No GBP profile management, no citation sync, no rank tracking, no reporting
- **No AI search visibility tracking** — The defining opportunity of 2026 and nothing built yet
- **No listing/citation management** — Table stakes for the category; needed before anyone takes the platform seriously
- **No multi-platform review support** — Only Google reviews. Yelp, Healthgrades, Facebook, etc. not integrated
- **No reporting engine** — Customers need automated reports at different cadences for different roles
- **Small customer base** — One primary guinea pig (Sturdy Health). No market validation at scale yet
- **No structured data / schema automation** — Major gap given AI search relies heavily on entity clarity

### Opportunities (Market white space)
1. **AI Visibility Tracking** — No tool provides a unified view of how each location appears across Google AI Overviews, ChatGPT, Gemini, Perplexity, and Apple/Siri. This is the #1 white space in the market
2. **AI Hallucination Detection** — AI systems fabricate business hours, services, and attributes. Nobody monitors this at scale. A 500-location brand losing revenue from "closed on Sundays" hallucinations has no tool to catch it
3. **Entity Consistency Scoring** — AI systems lose confidence with inconsistent data. Current citation tools sync listings but don't score entity health across the data sources AI actually uses (Foursquare, Bing Places, MapQuest — not just the usual directories)
4. **Tiered pricing that doesn't punish growth** — Per-location pricing ($30-449/loc/mo) is universally hated. Flat tiers would be a massive competitive advantage
5. **Structured Data as a Service** — LocalBusiness schema + Content Knowledge Graphs improve LLM accuracy 300%. Nobody automates this for multi-location businesses
6. **Vertical specialization** — Healthcare (DSOs, vet groups), home services, and legal are underserved. Vertical-specific features (provider-level profiles, insurance directories, HIPAA compliance) create moats
7. **ChatGPT optimization** — ChatGPT uses Bing Places + Foursquare (not Google!) for 60-70% of local results. Most businesses don't know this. A tool that manages presence on ChatGPT's actual data sources is differentiated
8. **Zero lock-in positioning** — Yext's "listing hostage" problem is a well-known pain point. Permanent citation ownership as a selling point

### Threats
- **Semrush Local** — Well-funded, recognized brand, aggressive pricing ($30/loc/mo), expanding AI features. Could capture mid-market before Revet scales
- **Google tightening API access** — GBP API changes could limit what third-party tools can do
- **AI search volatility** — Google AI Overviews fluctuate between 16-40% of queries. Building a product around AI visibility tracking requires the trend to continue
- **Incumbent catch-up** — Yext, SOCi, and BrightLocal are all adding AI features. Their distribution advantage (existing customer bases of thousands) means they can ship a "good enough" AI module and retain customers
- **Market education cost** — "Search everywhere optimization" is still an emerging concept. Selling it requires educating buyers, which is expensive
- **PE roll-up risk** — The local SEO space is consolidating. A well-funded competitor could acquire 2-3 point solutions and assemble a platform faster

---

## The Strategic Insight

The local search market is splitting into two eras:

**Old era (2015-2025)**: "Do I rank on Google?" → Listings sync, keyword tracking, review management. Dominated by Yext, BrightLocal, SOCi.

**New era (2025+)**: "Does AI recommend my business?" → Entity health across all data sources, AI visibility monitoring, structured data, cross-platform optimization. **Nobody owns this yet.**

Every incumbent is trying to bolt AI features onto their legacy platform. Revet can build for the new era natively.

The key data points:
- **93% of Google AI Mode searches end without a click** — visibility IS the conversion
- **ChatGPT has 400M weekly active users** and pulls from Bing Places + Foursquare, not Google
- **Gemini recommends only 11% of locations** (vs. 35.9% in traditional local pack) — AI is selective
- **Reddit is the #1 LLM citation source** (40.1%) — not Wikipedia, not business websites
- **Distance doesn't matter in AI Overviews** (correlation: 0.001) — entity consistency and review consensus do
- **Knowledge graph grounding improves LLM accuracy 300%** — structured data is infrastructure, not optimization

---

## Prioritized Feature Roadmap

### Phase 1: Foundation (Weeks 1-4)
*Goal: Make Revet credible as a multi-location platform, not just a review tool*

**1.1 GBP Profile Management**
- View/edit all GBP fields (hours, description, categories, attributes, photos, services)
- Bulk editing across locations
- Suggested edit queue (accept/reject Google's suggested changes)
- Change history / audit trail
- *Why first*: This is what most of your current customers need daily. It's table stakes for the category.

**1.2 Role-Based Dashboards**
- Location manager view: their location's reviews, rating, GBP stats, listing accuracy
- Org-level view: all locations compared, top-level KPIs
- Agency view: all orgs, cross-org reporting
- *Why now*: The "fake SaaS" insight — customers want to log in and see data. The dashboard IS the product for them.

**1.3 Review Alerts & Digests**
- Negative review alert (instant email)
- New review digest (daily/weekly, configurable per role)
- Review response suggestions (AI-generated drafts)
- *Why now*: Fastest to build (email infra exists), highest perceived value per effort. Every competitor has this; you can't not have it.

### Phase 2: Differentiation (Weeks 5-10)
*Goal: Build the features that make Revet the "new era" platform*

**2.1 AI Visibility Tracker**
- Per-location monitoring across Google AI Overviews, ChatGPT, Gemini, Perplexity
- "Is your business recommended?" — binary tracking per AI surface per location
- Accuracy check: does the AI say the right hours, address, services?
- Hallucination alerts: flag when AI fabricates incorrect info
- *Why this is the moat*: Nobody does this. It's the headline feature that positions Revet as forward-looking vs. every incumbent.

**2.2 Entity Health Score**
- Per-location score: how consistently your business appears across all data sources AI pulls from
- Cover the actual AI data pipeline: GBP, Bing Places, Foursquare, Apple Maps, Yelp, MapQuest, industry directories
- Flag inconsistencies (different hours, wrong phone, mismatched name)
- Prioritized fix list
- *Why now*: This reframes citation management from "list sync" to "AI readiness" — a positioning win.

**2.3 Multi-Platform Review Monitoring**
- Pull reviews from Google, Yelp, Facebook, and 1-2 vertical-specific sources (Healthgrades for healthcare, etc.)
- Unified review feed per location
- Sentiment analysis (what themes does AI extract from your reviews?)
- *Why now*: Expands from Google-only. Review sentiment across platforms directly affects AI recommendations.

### Phase 3: Intelligence (Weeks 11-16)
*Goal: Automated insights and reporting — the client deliverable*

**3.1 Automated Reports**
- Monthly executive report: AI visibility, review performance, GBP engagement, entity health
- Weekly regional digest: location comparison, anomaly detection
- Real-time location dashboard: mobile-first, push notifications
- PDF export + scheduled email delivery
- *Why this phase*: Reports need data from Phases 1-2 to be meaningful.

**3.2 AI Review Response**
- AI-generated response drafts for all incoming reviews
- Tone/brand voice configuration per org
- Agency approval workflow → auto-publish via GBP API
- Autopilot mode: auto-publish positive review responses, queue negative for human review
- *Why this phase*: Biggest agency time-saver. One person managing 50 locations' review responses.

**3.3 Structured Data Automation**
- Auto-generate LocalBusiness schema per location from GBP data
- Maintain entity relationships (location → org → parent brand)
- Monitor schema deployment on customer websites
- *Why this phase*: Infrastructure play. Makes everything in Phase 2 work better over time.

### Phase 4: Scale (Weeks 17+)
*Goal: Platform completeness and competitive catch-up features*

- **Citation Management** — Sync listings to top directories (push model, not Yext-style lock-in)
- **Local Rank Tracking** — Geo-grid rank tracking (à la LocalFalcon) including AI Overview presence
- **Location Landing Pages** — Templated, SEO-optimized pages per location with auto-generated local content
- **Google Ads / LSA Integration** — Performance data alongside organic
- **Competitive Intelligence** — Compare entity health, review velocity, and AI visibility vs. local competitors
- **Voice Search Optimization** — As Apple/Siri launches in 2026

### Deferred (Build when someone asks)
- White-label / admin → agency → org hierarchy
- Multi-language support
- Social media management
- Google Posts scheduling (low-impact feature, high maintenance)
- Yelp / TripAdvisor review response (API access is limited/expensive)

---

## Pricing Model Recommendation

Based on market research, the winning model for mid-market:

| Tier | Locations | Price | Includes |
|------|-----------|-------|----------|
| Growth | 1-25 | $299/mo | All modules, 1 user per location |
| Scale | 26-100 | $799/mo | All modules, unlimited users |
| Enterprise | 101-500 | $1,999/mo | All modules, API access, dedicated support |

**Key principles:**
- **Flat tiers, not per-location** — the single biggest competitive advantage vs. Yext ($40-83/loc/mo), Birdeye ($299/loc/mo), and Semrush Local ($30/loc/mo)
- **All modules included** — no feature paywalls (SOCi and Uberall frustrate users with upsells)
- **No data lock-in** — permanent citation ownership, full data export anytime
- **Monthly billing** — no forced annual commitments

At 100 locations, Revet at $799/mo vs. Yext at $4,000-8,300/mo vs. Birdeye at $29,900/mo. The price-to-value gap is enormous.

---

## Key Market Data

- Local SEO software market: **$8.66B (2024) → $23.72B (2032)**, 13.42% CAGR
- 69% of searches are zero-click (up from 56% in 2024)
- Google AI Overviews appear in 40% of queries overall, 7.9% of local
- ChatGPT: 400M weekly active users, 30% higher conversion rate than traditional search
- Gemini: 750M active users, recommends only 11% of locations
- 40% of Gen Z prefers TikTok/Instagram over Google for local search
- Average mid-market business uses 4-6 local search tools totaling $200+/mo per location
- Tools combining listings + predictive analytics see 46% higher valuations
- Per-location pricing is the #1 complaint across every G2/Capterra review thread

---

*Sources: Local Falcon, BrightLocal, Semrush, iPullRank, Seer Interactive, Bain & Company, Search Engine Land, G2, Capterra, Market Research Future, Sterling Sky, Schema App, and others. Full source URLs available in research documents.*
