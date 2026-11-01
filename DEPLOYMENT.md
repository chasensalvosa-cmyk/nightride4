# Deploying NIGHTRIDE

The app runs on **local SQLite in development** and needs **hosted Postgres
in production** (serverless platforms have no filesystem, so the `db/custom.db`
file simply doesn't exist there — every DB call fails with a 500).

The build (`npm run build` → `scripts/build.mjs`) auto-detects which one to use:

| `DATABASE_URL`                     | Prisma schema                 | Where                |
| ---------------------------------- | ----------------------------- | -------------------- |
| `file:…`                           | `prisma/schema.prisma`        | local dev / sandbox  |
| `postgresql://…`                   | `prisma/schema.postgres.prisma` | Vercel / any host  |

It also regenerates the Prisma client explicitly, which fixes CI builds that
skip Prisma's postinstall (Cloudflare's bun-based builds →
`Module '@prisma/client' has no exported member 'PrismaClient'`).

---

## Vercel + Supabase (recommended, ~5 minutes)

**1. Create the database**

1. Go to [supabase.com](https://supabase.com) → **New project** (free tier is
   fine). Pick a region near you and save the database password.
2. Open **SQL Editor** → **New query**.
3. Paste the entire contents of
   [`supabase/migrations/002_app_auth_init.sql`](supabase/migrations/002_app_auth_init.sql)
   → **Run**. It creates all 11 tables (profiles, sessions, rides, …).

> ⚠ Use **002**, not 001. `001_init.sql` is a different architecture based on
> Supabase Auth; the app ships its own username/password auth and needs the
> tables in 002.

**2. Get the connection string**

Supabase dashboard → **Connect** (top bar) → **ORMs** tab → Prisma.
It looks like:

```
postgresql://postgres.<project-ref>:<password>@aws-0-<region>.pooler.supabase.com:6543/postgres?pgbouncer=true&connection_limit=1
```

Use the **pooled** URI (port `6543`, includes `pgbouncer=true`) — serverless
functions open many short-lived connections and direct connections are
IPv6-only, which Vercel doesn't support.

**3. Set it on Vercel**

Vercel → your project → **Settings → Environment Variables**:

- Name: `DATABASE_URL`
- Value: the pooled connection string from step 2
- Environments: Production **and** Preview

**4. Redeploy** (Deployments → ⋯ → Redeploy, or push a commit).

Account creation, login, rides, community reports — everything backed by the
DB — now works.

---

## Local development (unchanged)

`npm run dev` / `bun run dev` keeps using `db/custom.db` via `.env`
(see `.env.example`). No Postgres needed locally. On a fresh clone, run
`npm run db:push` once to create the SQLite file (it is not committed).

---

## Cloudflare Workers / Pages — status

The original build error (`PrismaClient` not exported) is fixed for any CI by
the new build script. **However**, this app cannot run on Cloudflare Workers
yet, for two reasons unrelated to the build:

1. The stock Prisma client ships a native Rust query engine binary that cannot
   execute on workerd (the Workers runtime). Prisma needs either
   [driver adapters](https://www.prisma.io/docs/adapter) or Accelerate there.
2. Full Next.js apps must be adapted with
   [`@opennextjs/cloudflare`](https://opennext.js.org/cloudflare), and this
   app additionally uses Node APIs (`node:crypto` scrypt) that need
   `nodejs_compat` flag review.

If you want Cloudflare specifically, that's a follow-up migration (swap Prisma
to the pg driver adapter + OpenNext config). Vercel runs the app as-is.

---

## Troubleshooting

| Symptom | Cause / fix |
| --- | --- |
| `Request failed (500)` on register | `DATABASE_URL` missing on the platform → set it (step 3 above) |
| Build fails with `PrismaClient` export error | You're on an old commit; the new `scripts/build.mjs` fixes it |
| `[build] ERROR: DATABASE_URL is not set` during build | Env var missing on the platform, or no `.env` locally |
| `Can't reach database server` / P1001 | Wrong host — use the **pooler** URI (`…pooler.supabase.com:6543`), not `db.<ref>.supabase.com` |
| `User already exists` in a fresh DB | Migration ran twice — it's idempotent to re-run *per table only if unchanged*; otherwise just register a different username |
