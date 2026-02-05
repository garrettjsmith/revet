# lseo.app — Review Funnel Manager

Review funnel landing pages with sentiment routing. Patients rate their visit → positive ratings route to Google Review → negative ratings route to practice manager email.

Built for Notable integration at Sturdy Health. Extensible platform for additional local SEO tools.

## Stack

- **Next.js 14** (App Router) on Vercel
- **Supabase** (Postgres + Auth + RLS)
- **Tailwind CSS**

## Setup

### 1. Supabase

1. Create a new Supabase project (or use existing)
2. Go to **SQL Editor** and run the contents of `supabase/migrations/001_initial.sql`
3. Go to **Authentication > Users** and create your admin user (email/password)
4. Copy your project URL, anon key, and service role key

### 2. Environment Variables

Copy `.env.example` to `.env.local` and fill in:

```
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
NEXT_PUBLIC_APP_URL=https://lseo.app
```

### 3. Seed Data

Create your first organization in Supabase SQL Editor:

```sql
INSERT INTO organizations (name, slug) VALUES ('Sturdy Health', 'sturdy-health');
```

### 4. Run

```bash
npm install
npm run dev
```

- **Admin:** http://localhost:3000/admin
- **Patient page:** http://localhost:3000/r/{slug}

### 5. Deploy to Vercel

```bash
npx vercel
```

Add the same env vars in Vercel dashboard. Point `lseo.app` domain.

## URL Structure

| Path | Purpose | Auth |
|------|---------|------|
| `/` | Marketing / home | Public |
| `/r/{slug}` | Patient review funnel | Public |
| `/admin` | Dashboard | Admin |
| `/admin/profiles` | Manage review funnels | Admin |
| `/admin/profiles/new` | Create profile | Admin |
| `/admin/profiles/{id}` | Edit profile | Admin |
| `/admin/login` | Sign in | Public |
| `/api/events` | Event tracking endpoint | Public (write-only) |

## Notable Integration

Configure Notable to push this URL in the post-appointment SMS:

```
https://lseo.app/r/{profile-slug}
```

Patient flow:
1. Receives SMS from Notable after appointment
2. Taps link → sees star rating
3. Rates 4-5★ → routed to Google Review page
4. Rates 1-3★ → shown feedback form + manager email link

The threshold (default 4★) is configurable per profile.

## Adding More Tools

The platform is structured for additional tools:

```
/r/{slug}  → Review funnels (tool 1)
/l/{slug}  → Local landers (tool 2)
/t/{slug}  → Future tool 3
```

Each tool gets its own:
- Public-facing route namespace
- Admin section under `/admin`
- Supabase tables
- Shared auth and organization model

## License

Proprietary — GMB Gorilla
