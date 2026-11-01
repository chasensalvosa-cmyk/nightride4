// NIGHTRIDE — reset local test data for a clean delivery.
// Deletes every profile (cascades to sessions, rides, saved locations,
// reports, comments, confirmations, flags, settings). Keeps the official
// NWS public_safety_events feed (real data, re-synced automatically).
// Usage: bun scripts/reset-local-data.ts

import { PrismaClient } from '@prisma/client'

const db = new PrismaClient()

async function main() {
  const before = {
    profiles: await db.profile.count(),
    rides: await db.ride.count(),
    reports: await db.communityReport.count(),
    comments: await db.reportComment.count(),
    locations: await db.savedLocation.count(),
    safetyEvents: await db.publicSafetyEvent.count(),
  }
  await db.profile.deleteMany({})
  const after = {
    profiles: await db.profile.count(),
    rides: await db.ride.count(),
    reports: await db.communityReport.count(),
    comments: await db.reportComment.count(),
    locations: await db.savedLocation.count(),
    safetyEvents: await db.publicSafetyEvent.count(),
  }
  console.log('Before:', before)
  console.log('After: ', after)
  console.log(
    after.profiles === 0 && after.rides === 0 && after.reports === 0
      ? '✓ Local rider data cleared (official NWS safety feed preserved).'
      : '✗ Something survived — check cascade configuration.',
  )
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => db.$disconnect())
