-- ============================================================
-- lseo.app — Review Funnel Schema
-- Run this in Supabase SQL Editor
-- ============================================================

-- Organizations (clients like Sturdy Health)
create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text unique not null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Review funnel profiles (one per GBP / department)
create table public.review_profiles (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  slug text unique not null,
  heading text not null default 'Thank you for your visit',
  subtext text not null default 'Your feedback helps us provide the best care possible.',
  place_id text not null,
  manager_email text not null,
  manager_name text not null default 'Practice Manager',
  primary_color text not null default '#1B4965',
  accent_color text not null default '#5FA8D3',
  logo_url text,
  logo_text text,
  logo_subtext text,
  positive_threshold integer not null default 4,  -- rating >= this → Google
  active boolean not null default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Event tracking (every interaction)
create table public.review_events (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.review_profiles(id) on delete cascade,
  event_type text not null,  -- page_view | rating_submitted | google_click | email_click
  rating smallint,
  routed_to text,            -- 'google' | 'email'
  metadata jsonb default '{}',
  session_id text,           -- group events from same visit
  created_at timestamptz default now()
);

-- ============================================================
-- Indexes
-- ============================================================

create index idx_review_profiles_slug on public.review_profiles(slug) where active = true;
create index idx_review_profiles_org on public.review_profiles(org_id);
create index idx_review_events_profile on public.review_events(profile_id);
create index idx_review_events_created on public.review_events(created_at desc);
create index idx_review_events_type on public.review_events(profile_id, event_type);

-- ============================================================
-- RLS Policies
-- ============================================================

alter table public.organizations enable row level security;
alter table public.review_profiles enable row level security;
alter table public.review_events enable row level security;

-- Authenticated users (admin) can do everything
create policy "Admin full access to organizations"
  on public.organizations for all
  to authenticated
  using (true)
  with check (true);

create policy "Admin full access to review_profiles"
  on public.review_profiles for all
  to authenticated
  using (true)
  with check (true);

create policy "Admin full access to review_events"
  on public.review_events for all
  to authenticated
  using (true)
  with check (true);

-- Anonymous (public pages) can read active profiles
create policy "Public can read active profiles"
  on public.review_profiles for select
  to anon
  using (active = true);

-- Anonymous can insert events (tracking)
create policy "Public can insert events"
  on public.review_events for insert
  to anon
  with check (true);

-- ============================================================
-- Updated_at trigger
-- ============================================================

create or replace function public.update_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger organizations_updated_at
  before update on public.organizations
  for each row execute function public.update_updated_at();

create trigger review_profiles_updated_at
  before update on public.review_profiles
  for each row execute function public.update_updated_at();

-- ============================================================
-- Analytics view (makes dashboard queries simple)
-- ============================================================

create or replace view public.profile_stats as
select
  rp.id as profile_id,
  rp.name as profile_name,
  rp.slug,
  rp.org_id,
  o.name as org_name,
  count(*) filter (where re.event_type = 'page_view') as total_views,
  count(*) filter (where re.event_type = 'rating_submitted') as total_ratings,
  count(*) filter (where re.event_type = 'google_click') as google_clicks,
  count(*) filter (where re.event_type = 'email_click') as email_clicks,
  round(avg(re.rating) filter (where re.rating is not null), 1) as avg_rating,
  count(*) filter (where re.event_type = 'page_view' and re.created_at > now() - interval '7 days') as views_7d,
  count(*) filter (where re.event_type = 'google_click' and re.created_at > now() - interval '7 days') as google_clicks_7d,
  count(*) filter (where re.event_type = 'email_click' and re.created_at > now() - interval '7 days') as email_clicks_7d
from public.review_profiles rp
left join public.review_events re on re.profile_id = rp.id
left join public.organizations o on o.id = rp.org_id
group by rp.id, rp.name, rp.slug, rp.org_id, o.name;
