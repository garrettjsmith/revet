# Falcon — AI-Powered Service Delivery System

*The system that turns Revet from a SaaS dashboard into an AI-led, human-approved service delivery engine.*

## What Falcon Is

Falcon is the internal system that automates the service fulfillment loop for multi-location GBP management. The AI agent does the work — audits profiles, generates content, optimizes listings, drafts customer communications. Mike reviews, approves, and handles edge cases. Customers see results and a great service experience without knowing (or caring) what's behind it.

Today, Mike checks SPP, Asana, and Gmail three times a day. He manually moves work orders between stages, writes emails, schedules posts, runs audits. This loop works for 30-50 locations but breaks at 100+.

Falcon replaces the loop with a single inbox. The AI agent generates work, executes routine tasks, and surfaces only what needs human judgment. Mike's job shifts from "doing the work" to "running the product."

## Why Now

Speed wins in the AI era. The old 30-day onboarding cadence existed because humans were doing 100+ manual steps per profile. With AI, a profile can be audited and optimized in 15-30 minutes. Customers who sign up today should see results this week, not next month.

The manual process also caps revenue. Mike can't manage 200 locations alone with the current tooling. Falcon removes that ceiling.

## The Loop

Every service engagement follows this cycle:

```
Customer signs up / location added
        ↓
AI generates work orders (audit, optimize, create posts, etc.)
        ↓
AI executes tasks autonomously
        ↓
Items needing human judgment → Mike's inbox
        ↓
Mike reviews / approves / adjusts
        ↓
AI publishes approved work
        ↓
Monthly report auto-generated → customer dashboard
        ↓
Repeat (ongoing management cycle)
```

The key insight: most steps don't need Mike. The AI can audit a GBP profile against best practices, generate an optimization plan, write post copy, draft customer emails, and detect anomalies. Mike's value is in quality control, relationship management, and handling the 10% of situations that require expert judgment.

---

## Mike's Inbox

The inbox is the entire product for Mike. It replaces SPP + Asana + Email with a single prioritized feed.

### What Shows Up in the Inbox

| Item Type | Source | Mike's Action |
|-----------|--------|---------------|
| **Post batch for approval** | AI-generated weekly/monthly posts | Review, edit, approve, or reject per-location |
| **Profile optimization plan** | AI audit of new/existing profile | Review recommendations, approve execution |
| **Customer message** | Customer question or request via dashboard | Review AI-drafted response, edit, send |
| **Anomaly alert** | Profile change detected, ranking drop, review spike | Investigate, take action or dismiss |
| **Work order status** | Onboarding milestone, enhancement complete | Acknowledge, advance to next stage |
| **Monthly report draft** | AI-generated performance summary | Review, add narrative notes, approve send |

### What Does NOT Show Up

Routine tasks the AI handles silently:
- Posting approved content on schedule
- Syncing GBP data
- Sending standard onboarding emails (welcome, access instructions)
- Generating rank tracking reports
- Responding to positive reviews (when autopilot is on)
- Updating entity health scores
- Monitoring competitor profiles

### Inbox Prioritization

Items sorted by urgency:
1. **Customer messages** awaiting response (SLA: 2-4 hours)
2. **Anomalies** (suspended profile, bulk negative reviews)
3. **Approvals due today** (posts, optimization plans, reports)
4. **Upcoming work** (this week's deliverables)
5. **FYI items** (completed tasks, status updates — dismissable)

### Approval Mechanics

**Posts**: Mike sees a batch of posts with copy + image for each location. Options: approve all, approve individually, edit inline, reject with note. Approved posts auto-schedule. Auto-approve toggle available per org ("just post my weekly content without asking").

**Optimization plans**: AI presents a checklist of changes to make (update categories, add services, fix hours, etc.). Mike reviews and approves. AI executes approved items.

**Customer messages**: AI drafts a response based on context (account status, recent work, common questions). Mike can send as-is, edit, or write from scratch. Goal: most responses are one-click sends.

---

## Customer Experience

Customers interact with Revet, not Falcon. They don't see the AI; they see a well-managed service with fast turnaround and clear communication.

### What Customers See

**Dashboard** (existing Revet admin UI):
- Location performance (rankings, reviews, traffic)
- Entity health scores
- Recent activity feed ("Profile optimized", "4 posts published", "3 reviews responded to")
- Review funnel stats

**Monthly digest** (email + dashboard):
- "Here's what we did this month" — work completed, posts published, reviews responded to
- Performance trends — ranking changes, review velocity, GBP engagement
- Next month's plan — upcoming work, recommendations

**Approval page** (when applicable):
- Some orgs want to approve posts before they go live
- Link to a page showing all items needing approval
- Scoped by org, but awareness that one org might have 1 location and another might have 20
- Simple approve/reject per item, bulk approve option

### Customer Communication Flow

```
Customer sends message (dashboard chat or email)
        ↓
AI categorizes: question, request, complaint, update
        ↓
AI drafts response using account context
        ↓
Mike reviews in inbox → send / edit / escalate
        ↓
Customer receives response from "their account manager"
```

For common questions (billing, timeline, how-to), the AI response is likely perfect and Mike just clicks send. For nuanced situations (unhappy customer, complex request), Mike writes or heavily edits.

---

## Service Model

### Pricing Direction

Moving away from per-service pricing (Setup $350, Optimization $350, Management $350/mo). Toward:

| Scale | Price/Location/Month | Notes |
|-------|---------------------|-------|
| Single location | $100-200 | All-inclusive |
| 10+ locations | Sliding scale | Volume discount |
| 100+ locations | $35-50 | Floor price |

All-inclusive means: profile setup, optimization, ongoing management, posts, review management, reporting. No tiers, no upsells. The AI makes fulfillment cheap enough to bundle everything.

### Onboarding — Fast, Not Phased

Old model: 30-day onboarding with milestones at Day 1, 7, 14, 21, 28.

New model: Do everything possible in the first 48-72 hours.

```
Hour 0:    Customer signs up, intake form submitted
Hour 1:    AI claims/verifies listing (or requests verification)
Hour 2-4:  AI audits profile against best practices
Hour 4-8:  AI generates optimization plan → Mike's inbox
Hour 8-24: Mike approves plan, AI executes optimization
Hour 24-48: AI generates first month of posts → Mike's inbox
Hour 48-72: Mike approves posts, AI schedules
Day 7:     First posts live, first weekly report
Day 30:    First monthly report, full performance baseline
```

Verification is the only bottleneck that can't be compressed (Google controls the timeline). Everything else should happen as fast as the AI can execute and Mike can approve.

### Ongoing Management Cycle

Monthly recurring, AI-driven:

| Task | Frequency | Who |
|------|-----------|-----|
| GBP post creation + scheduling | Weekly | AI generates, Mike approves (or auto-approve) |
| Review monitoring + response | Daily | AI responds (autopilot for positive), Mike reviews negative |
| Profile monitoring | Daily | AI detects changes, alerts Mike on anomalies |
| Competitor monitoring | Weekly | AI tracks, surfaces meaningful changes |
| Rank tracking | Weekly | AI pulls data, surfaces trends |
| Monthly performance report | Monthly | AI generates, Mike adds narrative, auto-sends |
| Spam reporting | As needed | AI detects, Mike confirms and reports |
| Q&A curation | As needed | AI drafts answers, Mike approves |

---

## Content & Posts

### Generation

AI generates all post content. No separate copywriter. Inputs:
- Business context (industry, services, tone, location details)
- Seasonal/calendar events
- Recent reviews or customer feedback (content inspiration)
- Historical post performance (what worked before)

### Image Approach

Current images are too "social media" — they look good in approval view but not great on the actual GBP profile. Direction:

- Simple, clean images that follow GBP placement rules
- Basic CTAs over photos vs. elaborate graphic design
- Business photos > stock illustrations
- Prioritize how it looks on the profile, not in a design tool

### Approval Flow

Three modes per org:
1. **Mike approves everything** — default for new customers
2. **Customer approves** — customer gets a link, reviews and approves posts before scheduling
3. **Auto-approve** — AI generates and schedules without human review (for established, trusted accounts)

### Scoping

Posts can be scoped multiple ways:
- One unique post per location (most work, best results)
- One post across all locations in an org (least work, good for single-brand)
- One post to a subset of locations (e.g., 10 of 20 locations in a region)

The system should support all three. Default: one post per location with AI generating unique variations from the same theme.

---

## Profile Optimization

### AI Audit

When a new location is added, the AI runs a comprehensive audit:
- GBP completeness (all fields populated?)
- Category accuracy (primary + secondary categories match the business?)
- NAP consistency (name, address, phone match across sources?)
- Hours accuracy
- Service list completeness
- Photo quantity and quality assessment
- Review response rate
- Q&A coverage
- Post history and frequency

The audit produces a scored checklist and an action plan. Mike reviews and approves. AI executes approved changes.

### Optimization Execution

AI makes approved changes directly via GBP API:
- Update business description
- Add/modify service lists with descriptions
- Correct categories
- Update hours
- Add photos (from customer-provided assets or AI-generated)
- Populate Q&A

### Populate All Services Upfront

Old model: add 4-5 services per month to spread work across billing periods.

New model: populate ALL services in the first 30 days. It's cheap and fast with AI. No reason to artificially slow down the value delivery.

---

## Work Orders

Work orders replace the manual SPP stage-tracking system. They're generated automatically and advance automatically.

### Work Order Types

| Type | Trigger | Auto-advances when |
|------|---------|-------------------|
| **Onboarding** | New location added | All onboarding tasks complete |
| **Audit** | Onboarding complete, or quarterly schedule | Audit reviewed by Mike |
| **Optimization** | Audit approved | All optimization changes applied |
| **Post batch** | Weekly/monthly schedule | Posts approved and scheduled |
| **Report** | Monthly schedule | Report approved and sent |
| **Support** | Customer request or anomaly | Issue resolved |

### Status Flow

```
generated → in_progress → awaiting_approval → approved → executing → completed
                                    ↓
                               rejected (with notes → regenerate)
```

Mike doesn't move work orders between stages. The system does. Mike's only interaction is approve/reject at the `awaiting_approval` gate.

---

## Technical Architecture

Falcon lives inside the existing Revet codebase. It's not a separate service — it's a set of background jobs, an AI agent loop, and an inbox UI.

### Components

```
src/
├── app/
│   ├── agency/
│   │   ├── inbox/              # Mike's inbox UI
│   │   ├── work-orders/        # Work order management
│   │   └── customers/          # Customer communication
│   └── api/
│       ├── falcon/
│       │   ├── agent/          # AI agent execution endpoint
│       │   ├── generate/       # Content generation endpoints
│       │   └── webhooks/       # GBP change webhooks
│       └── cron/
│           ├── daily/          # Daily agent tasks
│           ├── weekly/         # Weekly content generation
│           └── monthly/        # Monthly report generation
├── lib/
│   ├── falcon/
│   │   ├── agent.ts            # Core AI agent logic
│   │   ├── audit.ts            # Profile audit engine
│   │   ├── content.ts          # Post content generation
│   │   ├── inbox.ts            # Inbox item management
│   │   ├── optimizer.ts        # Profile optimization execution
│   │   ├── reporter.ts         # Report generation
│   │   └── work-orders.ts      # Work order lifecycle
│   └── ai/                     # Existing Anthropic SDK utilities
└── components/
    └── inbox/                  # Inbox UI components
```

### New Database Tables

```sql
-- AI agent work orders
work_orders (
  id, location_id, org_id,
  type,           -- onboarding | audit | optimization | post_batch | report | support
  status,         -- generated | in_progress | awaiting_approval | approved | executing | completed | rejected
  payload,        -- JSONB: task-specific data (audit results, post content, etc.)
  ai_notes,       -- AI's reasoning/explanation for Mike
  mike_notes,     -- Mike's feedback/edits
  created_at, updated_at, completed_at
)

-- Mike's inbox
inbox_items (
  id, work_order_id,
  type,           -- approval | message | alert | info
  priority,       -- urgent | high | normal | low
  title, summary,
  status,         -- unread | read | actioned | dismissed
  action_taken,   -- approved | rejected | responded | escalated
  created_at, actioned_at
)

-- Customer messages (replaces SPP tickets)
customer_messages (
  id, org_id, location_id,
  direction,      -- inbound | outbound
  channel,        -- dashboard | email
  content,
  ai_draft,       -- AI-generated response draft
  sent_by,        -- user_id or 'ai'
  created_at
)

-- Content approval queue
content_approvals (
  id, org_id, location_id,
  content_type,   -- post | report | optimization_plan
  content,        -- JSONB: the actual content
  status,         -- pending | approved | rejected | auto_approved
  approver,       -- 'mike' | 'customer' | 'auto'
  approved_at, created_at
)
```

### AI Agent Execution

The agent runs on a schedule (cron) and on triggers (new location, customer message, GBP change):

```
Trigger → Agent picks up task → Executes autonomously → Creates inbox item if approval needed
```

Uses Anthropic Claude API (already integrated via `@anthropic-ai/sdk`). The agent has access to:
- GBP API (read/write via existing OAuth integration)
- Location data (Supabase)
- Customer context (org details, past interactions, preferences)
- Best practice knowledge (embedded in prompts)

### Environment Variables

Falcon uses the existing Revet environment plus:

```bash
# Existing (already in .env.example)
NEXT_PUBLIC_SUPABASE_URL=           # Supabase project URL
NEXT_PUBLIC_SUPABASE_ANON_KEY=      # Supabase anon key (client-side)
SUPABASE_SERVICE_ROLE_KEY=          # Supabase service role (server-side, no RLS)
NEXT_PUBLIC_APP_URL=                # App base URL
ANTHROPIC_API_KEY=                  # Claude API for AI agent

# Existing (in use, needs adding to .env.example)
RESEND_API_KEY=                     # Transactional email via Resend
LOCALFALCON_API_KEY=                # LocalFalcon rank tracking API

# New for Falcon
FALCON_AGENT_MODEL=                 # Claude model for agent tasks (default: claude-sonnet-4-5-20250929)
FALCON_CRON_SECRET=                 # Secret to authenticate cron job endpoints
```

No new external services required. Falcon runs on the existing stack: Supabase for data, Anthropic for AI, Resend for email, Vercel for compute, LocalFalcon for rank data.

---

## Success Criteria — 90 Days

| Metric | Target |
|--------|--------|
| Customer churn | No increase from current rate |
| Customer results | Same or better (rankings, review velocity, engagement) |
| Customer experience | Measurably better (faster onboarding, faster responses, more proactive communication) |
| Mike's capacity | Managing full book solo, with time for sales/growth |
| Mike's income | Higher than current (revenue per hour up) |
| Operational model | First AI-lead, human-approved, productized service loop running in production |

The ultimate test: Mike opens the inbox in the morning, spends 1-2 hours reviewing and approving, and the rest of his day is spent on growth — not task execution.

---

## Implementation Phases

### Phase 1: The Inbox + Work Orders (Weeks 1-3)

Build the foundation Mike lives in every day.

- Inbox UI in `/agency/inbox/`
- Work order model and lifecycle
- Manual work order creation (migration from current process)
- Inbox item prioritization and filtering

**Verification**: Mike can see all pending work in one place instead of checking three platforms.

### Phase 2: AI Audit + Optimization (Weeks 4-6)

Automate the most time-consuming onboarding tasks.

- AI profile audit engine (runs against GBP data)
- Audit → optimization plan generation
- Optimization execution via GBP API
- Inbox integration (audit results → approval → execution)

**Verification**: New location goes from "added" to "optimized" in 48-72 hours with Mike only approving the plan.

### Phase 3: AI Content Generation (Weeks 7-9)

Replace the copywriter + designer workflow.

- Post content generation (copy + image direction)
- Post approval flow (Mike and/or customer)
- Auto-scheduling of approved posts
- Batch generation (weekly/monthly cadence)

**Verification**: Mike approves a month of posts for 50 locations in under 30 minutes.

### Phase 4: Customer Communication (Weeks 10-12)

Close the loop on the customer experience.

- Customer message ingestion (dashboard chat, email)
- AI response drafting
- Mike review + send flow
- Monthly report generation + delivery
- "Here's what we did" monthly digest

**Verification**: Customer asks a question, gets an accurate response within 2 hours, and Mike spent 30 seconds on it.

---

## What This Is NOT

- **Not a chatbot.** Customers don't talk to AI. They talk to "their account manager" (Mike), who happens to have an AI doing 90% of the drafting.
- **Not autonomous.** Mike approves everything meaningful. The AI doesn't publish posts, send customer emails, or change profiles without human sign-off (unless auto-approve is explicitly enabled).
- **Not a new product.** Falcon is internal infrastructure. Customers see Revet. The service gets better; the branding doesn't change.
- **Not replacing Mike.** Mike's job changes from task executor to quality controller and relationship manager. His capacity goes up 5-10x, which means more revenue per hour, not fewer hours.
