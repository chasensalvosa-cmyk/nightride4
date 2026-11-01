# NIGHTRIDE — Supabase deployment

NIGHTRIDE ships with local persistence (Prisma + SQLite) so the application is fully functional
without external accounts. For production, deploy the same data model to **Supabase PostgreSQL**:

## 1. Create a project

1. Sign in at https://supabase.com/dashboard and create a project.
2. Project Settings → API: copy `Project URL`, `anon public` key and `service_role` key.

## 2. Apply the schema + Row Level Security

```bash
supabase link --project-ref <ref>
supabase db push          # applies supabase/migrations/001_init.sql
```

or with psql directly:

```bash
psql "$SUPABASE_DATABASE_URL" -f supabase/migrations/001_init.sql
```

The migration creates all tables **and enables RLS** with these guarantees:

- `rides`, `saved_locations`, `user_settings` — visible/writable **only by their owner** (rider GPS
  history is private by default).
- `community_reports`, `report_comments` — publicly readable (unless moderated/hidden), writable
  only by the author.
- `report_confirmations` — public read, one per user per report (unique constraint).
- `abuse_flags` — users can only insert their own flags (moderation queue is service-side).
- `public_camera_locations`, `public_safety_events` — **read-only** for ordinary users.

## 3. Verify policies

Run `supabase/tests/rls-test.sql` in the SQL editor — it documents the expected access matrix for
anon / user A / user B sessions.

## 4. Environment variables

Set in `.env` (never commit):

```
SUPABASE_URL=https://<ref>.supabase.co
SUPABASE_ANON_KEY=<anon key>            # public, used with anon auth
SUPABASE_SERVICE_ROLE_KEY=<service key> # SERVER-SIDE ONLY — never expose
```

The NIGHTRIDE API layer reads/writes Supabase in production; the Settings → API status page then
reports Supabase as *Connected* after a real connectivity test.
