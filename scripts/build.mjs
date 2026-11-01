#!/usr/bin/env node
// NIGHTRIDE build entry — used by every environment (local sandbox, Vercel,
// Cloudflare, your laptop). Does two things plain `next build` doesn't:
//
//   1. Regenerates the Prisma client EXPLICITLY. CI installs that use bun
//      (Cloudflare Workers Builds) or --ignore-scripts skip @prisma/client's
//      postinstall, leaving the stub package behind → the build dies with
//      "Module '@prisma/client' has no exported member 'PrismaClient'".
//
//   2. Picks the right Prisma schema for DATABASE_URL:
//        file:…           → prisma/schema.prisma           (local SQLite dev)
//        postgres://…     → prisma/schema.postgres.prisma  (hosted Postgres)
//
// After `next build` it packages the standalone server used by the local
// production supervisor (scripts/serve-prod.sh). Hosted platforms ignore that
// output, so the packaging is skipped when running on Vercel.

import { execSync } from 'node:child_process'
import { cpSync, existsSync, readFileSync } from 'node:fs'
import { delimiter, resolve } from 'node:path'

const root = process.cwd()
const at = (p) => resolve(root, p)

// node_modules/.bin on PATH so `prisma` / `next` resolve no matter how this
// script was launched (npm run, bun run, or a bare `node scripts/build.mjs`).
const PATH = [at('node_modules/.bin'), process.env.PATH ?? ''].join(delimiter)
const run = (cmd) => execSync(cmd, { stdio: 'inherit', env: { ...process.env, PATH } })

// ---------------------------------------------------------------- .env (local)
// Minimal .env loader so local builds see DATABASE_URL the same way `next
// dev` does. Hosted platforms (Vercel/Cloudflare) inject real env vars and
// never reach this branch with a .env present.
if (existsSync(at('.env'))) {
  for (const line of readFileSync(at('.env'), 'utf8').split('\n')) {
    const t = line.trim()
    if (!t || t.startsWith('#')) continue
    const i = t.indexOf('=')
    if (i === -1) continue
    const key = t.slice(0, i).trim()
    if (!key || key in process.env) continue
    process.env[key] = t.slice(i + 1).trim().replace(/^["']|["']$/g, '')
  }
}

// ---------------------------------------------------------- database selection
const url = (process.env.DATABASE_URL ?? '').trim()
const onCI =
  process.env.CI === 'true' ||
  process.env.VERCEL === '1' ||
  process.env.CF_PAGES === '1' ||
  process.env.CF === '1'

if (!url) {
  console.error(
    [
      '',
      '[build] ERROR: DATABASE_URL is not set.',
      onCI
        ? '         Add it as an environment variable on this platform.'
        : '         Expected a .env with DATABASE_URL (local dev) — see .env.example.',
      '         local dev:  DATABASE_URL=file:./db/custom.db',
      '         hosting:    DATABASE_URL=postgresql://… (Supabase pooled URI, see DEPLOYMENT.md)',
      '',
    ].join('\n'),
  )
  process.exit(1)
}

const isSqlite = url.startsWith('file:')
const isPostgres = /^(postgres|postgresql|prisma\+postgres):\/\//.test(url)

if (!isSqlite && !isPostgres) {
  console.error(
    `[build] ERROR: unsupported DATABASE_URL scheme (${url.slice(0, 32)}…)\n` +
      '         Expected file:… (local SQLite) or postgres://… (hosted Postgres).\n',
  )
  process.exit(1)
}

// ------------------------------------------------------------------- generate
const schema = isPostgres ? 'prisma/schema.postgres.prisma' : 'prisma/schema.prisma'
console.log(`\n[build] database → ${isPostgres ? 'hosted PostgreSQL' : 'local SQLite'}`)
console.log(`[build] prisma generate --schema=${schema}\n`)
run(`prisma generate --schema=${schema}`)

// ------------------------------------------------------------------ next build
console.log('\n[build] next build\n')
run('next build')

// ------------------------------------------------- standalone packaging (local)
// Vercel builds its own output; skip there. Everywhere else (local sandbox,
// self-hosting) copy static assets + public + .env into the standalone bundle
// so `node .next/standalone/server.js` just works.
if (process.env.VERCEL !== '1' && existsSync(at('.next/standalone/server.js'))) {
  cpSync(at('.next/static'), at('.next/standalone/.next/static'), { recursive: true })
  cpSync(at('public'), at('.next/standalone/public'), { recursive: true })
  if (existsSync(at('.env'))) cpSync(at('.env'), at('.next/standalone/.env'))
  console.log('\n[build] standalone server packaged → .next/standalone')
}
