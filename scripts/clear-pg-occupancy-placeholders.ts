/**
 * Release beds blocked by admin "mark fully occupied" placeholders.
 *
 * Usage:
 *   npx tsx -r dotenv/config scripts/clear-pg-occupancy-placeholders.ts --names=female
 *   npx tsx -r dotenv/config scripts/clear-pg-occupancy-placeholders.ts --names=central
 */
import 'dotenv/config';

import { closeDb } from '../src/db/client';
import {
  clearPgOccupancyPlaceholders,
  clearPgOccupancyPlaceholdersByPatterns,
  findPgIdsByNamePatterns,
} from '../src/services/occupancyAdmin';
import type { AdminSession } from '../src/lib/auth/session';

function parsePatterns(): string[] {
  const arg = process.argv.find((a) => a.startsWith('--names='));
  if (!arg) {
    console.error('Pass --names=female or --names="Central PG (Female)"');
    process.exit(1);
  }
  return arg
    .slice('--names='.length)
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

function parsePgId(): string | undefined {
  const arg = process.argv.find((a) => a.startsWith('--pg-id='));
  return arg?.slice('--pg-id='.length);
}

const bootstrapSession: AdminSession = {
  kind: 'admin',
  sessionId: 'script',
  adminId: null as unknown as string,
  email: 'script@awesomepg.internal',
  fullName: 'Clear occupancy script',
  role: 'super_admin',
  pgScope: [],
  mustChangePassword: false,
  rememberMe: false,
  expiresAt: new Date(Date.now() + 3600_000),
};

async function main() {
  const pgId = parsePgId();
  if (pgId) {
    const result = await clearPgOccupancyPlaceholders(bootstrapSession, pgId);
    console.log(`Released ${result.bedsReleased} bed(s), cancelled ${result.bookingsCancelled} placeholder booking(s).`);
    await closeDb();
    return;
  }

  const patterns = parsePatterns();
  console.log(`Clearing occupancy placeholders for PGs matching: ${patterns.join(', ')}`);
  const matches = await findPgIdsByNamePatterns(patterns);
  if (matches.length === 0) {
    console.error('No PGs matched.');
    process.exit(1);
  }

  const results = await clearPgOccupancyPlaceholdersByPatterns(bootstrapSession, patterns);
  for (const row of results) {
    console.log(
      `→ ${row.pgName}: released ${row.bedsReleased} bed(s), ${row.bookingsCancelled} booking(s)`,
    );
  }

  await closeDb();
  console.log('\nDone.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
