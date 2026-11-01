-- ============================================================================
-- NIGHTRIDE — PostgreSQL migration 002 (self-contained auth mode)
--
-- This is the schema for DEPLOYING the Next.js app with its OWN auth
-- (username + password in profiles, opaque session tokens in sessions).
-- Use it when hosting the app on Vercel / Railway / Fly etc. with a hosted
-- Postgres (Supabase, Neon, …).
--
--   1. Create a Postgres database (e.g. a free Supabase project).
--   2. Run this file once:  Supabase → SQL Editor → paste → Run
--      (or:  psql "$DATABASE_URL" -f supabase/migrations/002_app_auth_init.sql)
--   3. Set DATABASE_URL on your hosting platform to the pooled connection
--      string (see DEPLOYMENT.md).
--
-- It matches prisma/schema.postgres.prisma exactly. Table/column names are
-- snake_case because the Prisma schema @maps them that way.
--
-- NOTE — 001_init.sql is a DIFFERENT architecture (Supabase Auth as the
-- identity provider, RLS policies, no password_hash/sessions tables). The
-- Next.js app as built does NOT use Supabase Auth; 002 is the one it needs.
--
-- No RLS is enabled here: the app connects with the database owner role over
-- a credential-protected pooled connection and enforces per-user ownership
-- in the API layer — exactly like the local SQLite mode.
-- ============================================================================

-- ---------------------------------------------------------------- profiles
create table profiles (
  id            text primary key,
  username      text not null unique,
  password_hash text not null,
  avatar_url    text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- ---------------------------------------------------------------- sessions
create table sessions (
  id         text primary key,
  token      text not null unique,
  user_id    text not null references profiles (id) on delete cascade,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);
create index sessions_user_idx on sessions (user_id);

-- ---------------------------------------------------------------- rides
create table rides (
  id               text primary key,
  user_id          text not null references profiles (id) on delete cascade,
  title            text,
  started_at       timestamptz not null,
  ended_at         timestamptz,
  duration_seconds integer not null default 0,
  distance_meters  double precision not null default 0,
  average_speed    double precision not null default 0,
  maximum_speed    double precision not null default 0,
  route_data       text not null default '[]',          -- JSON: [{lat,lng,t,spd}]
  status           text not null default 'active',
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index rides_user_status_idx  on rides (user_id, status);
create index rides_user_started_idx on rides (user_id, started_at);

-- ---------------------------------------------------------------- saved_locations
create table saved_locations (
  id          text primary key,
  user_id     text not null references profiles (id) on delete cascade,
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
  id                  text primary key,
  user_id             text not null references profiles (id) on delete cascade,
  title               text not null,
  description         text not null,
  category            text not null,
  latitude            double precision not null,
  longitude           double precision not null,
  location_label      text,
  status              text not null default 'open',
  verification_status text not null default 'unverified',
  hidden              boolean not null default false,
  expires_at          timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
create index community_reports_category_idx on community_reports (category, status, created_at);
create index community_reports_geo_idx      on community_reports (latitude, longitude);

-- ---------------------------------------------------------------- report_comments
create table report_comments (
  id         text primary key,
  report_id  text not null references community_reports (id) on delete cascade,
  user_id    text not null references profiles (id) on delete cascade,
  content    text not null,
  hidden     boolean not null default false,
  created_at timestamptz not null default now()
);
create index report_comments_report_idx on report_comments (report_id, created_at);

-- ---------------------------------------------------------------- report_confirmations
create table report_confirmations (
  id         text primary key,
  report_id  text not null references community_reports (id) on delete cascade,
  user_id    text not null references profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (report_id, user_id)
);

-- ---------------------------------------------------------------- abuse_flags
create table abuse_flags (
  id         text primary key,
  item_type  text not null,
  item_id    text not null,
  user_id    text not null references profiles (id) on delete cascade,
  reason     text not null,
  created_at timestamptz not null default now(),
  unique (item_type, item_id, user_id)
);
create index abuse_flags_item_idx on abuse_flags (item_type, item_id);

-- ------------------------------------------- public (reference) datasets
create table public_camera_locations (
  id               text primary key,
  external_key     text not null unique,
  name             text not null,
  brand            text,
  latitude         double precision not null,
  longitude        double precision not null,
  camera_type      text not null default 'traffic',
  source_url       text not null,
  source_name      text not null default '',
  last_verified_at timestamptz not null default now()
);
create index public_camera_geo_idx  on public_camera_locations (latitude, longitude);
create index public_camera_type_idx on public_camera_locations (camera_type);

create table public_safety_events (
  id          text primary key,
  external_id text not null unique,
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
create index public_safety_events_time_idx on public_safety_events (occurred_at);

-- ---------------------------------------------------------------- user_settings
create table user_settings (
  user_id                text primary key references profiles (id) on delete cascade,
  share_ride_presence    boolean not null default false,
  public_profile         boolean not null default true,
  notify_nearby_reports  boolean not null default true,
  notify_safety_alerts   boolean not null default true,
  notify_report_replies  boolean not null default true,
  notify_ride_summaries  boolean not null default true,
  default_map_style      text not null default 'auto',
  show_layer_labels      boolean not null default true,
  keep_map_center_state  boolean not null default true
);
