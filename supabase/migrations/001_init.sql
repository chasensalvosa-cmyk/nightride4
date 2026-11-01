-- ============================================================================
-- NIGHTRIDE — Supabase PostgreSQL migration 001 (init)
-- Mirrors prisma/schema.prisma. Apply with:
--   supabase db push   (or psql $DATABASE_URL -f 001_init.sql)
-- Assumes Supabase Auth is enabled: auth.users is the identity provider and
-- profiles.id references auth.users.id.
-- ============================================================================

create extension if not exists "uuid-ossp";

-- ---------------------------------------------------------------- profiles
create table profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  username    text unique not null,
  avatar_url  text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------- rides
create table rides (
  id               uuid primary key default uuid_generate_v4(),
  user_id          uuid not null references profiles (id) on delete cascade,
  title            text,
  started_at       timestamptz not null,
  ended_at         timestamptz,
  duration_seconds integer not null default 0,
  distance_meters  double precision not null default 0,
  average_speed    double precision not null default 0,
  maximum_speed    double precision not null default 0,
  route_data       jsonb not null default '[]'::jsonb,
  status           text not null default 'active'
                   check (status in ('active', 'paused', 'completed')),
  created_at       timestamptz not null default now()
);
create index rides_user_idx on rides (user_id, started_at desc);

-- ---------------------------------------------------------------- saved_locations
create table saved_locations (
  id          uuid primary key default uuid_generate_v4(),
  user_id     uuid not null references profiles (id) on delete cascade,
  name        text not null,
  description text,
  latitude    double precision not null,
  longitude   double precision not null,
  category    text not null default 'custom',
  created_at  timestamptz not null default now()
);
create index saved_locations_user_idx on saved_locations (user_id);

-- ---------------------------------------------------------------- community_reports
create table community_reports (
  id                  uuid primary key default uuid_generate_v4(),
  user_id             uuid not null references profiles (id) on delete cascade,
  title               text not null,
  description         text not null,
  category            text not null check (category in
                        ('road_hazard','damaged_road','construction','road_closure',
                         'charging_station','riding_location','general_safety')),
  latitude            double precision not null,
  longitude           double precision not null,
  location_label      text,
  status              text not null default 'open' check (status in ('open','resolved','closed')),
  verification_status text not null default 'unverified'
                      check (verification_status in ('unverified','confirmed','disputed')),
  hidden              boolean not null default false,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
create index community_reports_feed_idx on community_reports (created_at desc);
create index community_reports_geo_idx on community_reports (latitude, longitude);

-- ---------------------------------------------------------------- report_comments
create table report_comments (
  id         uuid primary key default uuid_generate_v4(),
  report_id  uuid not null references community_reports (id) on delete cascade,
  user_id    uuid not null references profiles (id) on delete cascade,
  content    text not null,
  hidden     boolean not null default false,
  created_at timestamptz not null default now()
);
create index report_comments_report_idx on report_comments (report_id, created_at);

-- ---------------------------------------------------------------- report_confirmations
create table report_confirmations (
  id         uuid primary key default uuid_generate_v4(),
  report_id  uuid not null references community_reports (id) on delete cascade,
  user_id    uuid not null references profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (report_id, user_id)
);

-- ---------------------------------------------------------------- abuse_flags
create table abuse_flags (
  id         uuid primary key default uuid_generate_v4(),
  item_type  text not null check (item_type in ('report','comment')),
  item_id    uuid not null,
  user_id    uuid not null references profiles (id) on delete cascade,
  reason     text not null,
  created_at timestamptz not null default now(),
  unique (item_type, item_id, user_id)
);

-- ------------------------------------------- public (reference) datasets
-- Read-only for ordinary users. Only service role (or an admin-staged
-- verified import with source_url + last_verified_at) may write.
create table public_camera_locations (
  id               uuid primary key default uuid_generate_v4(),
  name             text not null,
  latitude         double precision not null,
  longitude        double precision not null,
  camera_type      text not null default 'traffic',
  source_url       text not null,
  last_verified_at timestamptz not null default now()
);

create table public_safety_events (
  id          uuid primary key default uuid_generate_v4(),
  external_id text unique not null,
  title       text not null,
  description text not null,
  category    text not null,
  severity    text,
  latitude    double precision,
  longitude   double precision,
  area_desc   text,
  source_url  text not null,
  source_name text not null default 'NWS',
  occurred_at timestamptz not null,
  updated_at  timestamptz not null default now()
);
create index public_safety_events_time_idx on public_safety_events (occurred_at desc);

-- ---------------------------------------------------------------- user_settings
create table user_settings (
  user_id               uuid primary key references profiles (id) on delete cascade,
  share_ride_presence   boolean not null default false,
  public_profile        boolean not null default true,
  notify_nearby_reports boolean not null default true,
  notify_safety_alerts  boolean not null default true,
  notify_report_replies boolean not null default true,
  notify_ride_summaries boolean not null default true,
  default_map_style     text not null default 'auto',
  show_layer_labels     boolean not null default true,
  keep_map_center_state boolean not null default true
);

-- ---------------------------------------------------------------- updated_at trigger
create or replace function set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

create trigger trg_profiles_updated before update on profiles
  for each row execute function set_updated_at();
create trigger trg_reports_updated before update on community_reports
  for each row execute function set_updated_at();
create trigger trg_safety_updated before update on public_safety_events
  for each row execute function set_updated_at();

-- ============================================================================
-- ROW LEVEL SECURITY
-- ============================================================================

alter table profiles             enable row level security;
alter table rides                enable row level security;
alter table saved_locations      enable row level security;
alter table community_reports    enable row level security;
alter table report_comments      enable row level security;
alter table report_confirmations enable row level security;
alter table abuse_flags          enable row level security;
alter table public_camera_locations enable row level security;
alter table public_safety_events    enable row level security;
alter table user_settings        enable row level security;

-- helper: is the calling user authenticated?
create or replace function auth_uid() returns uuid
language sql stable as $$ select auth.uid() $$;

-- ---------------------------------------------------------------- profiles
-- Public profiles are readable (community attribution); only the owner writes.
create policy "profiles readable" on profiles
  for select using (true);
create policy "insert own profile" on profiles
  for insert with check (id = auth_uid());
create policy "update own profile" on profiles
  for update using (id = auth_uid());

-- ---------------------------------------------------------------- rides
-- Rides are PRIVATE: only the owner may read or write.
-- (Route data contains rider GPS history — never exposed without explicit
-- sharing consent; a future "shared rides" flag can relax the select policy.)
create policy "own rides read" on rides
  for select using (user_id = auth_uid());
create policy "own rides insert" on rides
  for insert with check (user_id = auth_uid());
create policy "own rides update" on rides
  for update using (user_id = auth_uid());
create policy "own rides delete" on rides
  for delete using (user_id = auth_uid());

-- ---------------------------------------------------------------- saved_locations
create policy "own locations read" on saved_locations
  for select using (user_id = auth_uid());
create policy "own locations insert" on saved_locations
  for insert with check (user_id = auth_uid());
create policy "own locations update" on saved_locations
  for update using (user_id = auth_uid());
create policy "own locations delete" on saved_locations
  for delete using (user_id = auth_uid());

-- ---------------------------------------------------------------- community_reports
-- Non-hidden reports are public read; writes restricted to owner.
create policy "public reports read" on community_reports
  for select using (hidden = false or user_id = auth_uid());
create policy "own reports insert" on community_reports
  for insert with check (user_id = auth_uid());
create policy "own reports update" on community_reports
  for update using (user_id = auth_uid());
create policy "own reports delete" on community_reports
  for delete using (user_id = auth_uid());

-- ---------------------------------------------------------------- comments
create policy "comments read" on report_comments
  for select using (hidden = false or user_id = auth_uid());
create policy "own comments insert" on report_comments
  for insert with check (user_id = auth_uid());
create policy "own comments delete" on report_comments
  for delete using (user_id = auth_uid());

-- ---------------------------------------------------------------- confirmations
create policy "confirmations read" on report_confirmations
  for select using (true);
create policy "own confirmations insert" on report_confirmations
  for insert with check (user_id = auth_uid());
create policy "own confirmations delete" on report_confirmations
  for delete using (user_id = auth_uid());

-- ---------------------------------------------------------------- abuse_flags
-- Flags are write-only for users (moderation queue is service-role).
create policy "own flags insert" on abuse_flags
  for insert with check (user_id = auth_uid());
create policy "own flags read" on abuse_flags
  for select using (user_id = auth_uid());

-- ---------------------------------------------------------------- public datasets
-- Ordinary users get read-only access; writes are service-role only.
create policy "cameras public read" on public_camera_locations
  for select using (true);
create policy "safety events public read" on public_safety_events
  for select using (true);

-- ---------------------------------------------------------------- user_settings
create policy "own settings read" on user_settings
  for select using (user_id = auth_uid());
create policy "own settings insert" on user_settings
  for insert with check (user_id = auth_uid());
create policy "own settings update" on user_settings
  for update using (user_id = auth_uid());
