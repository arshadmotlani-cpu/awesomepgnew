/**
 * Mark all vacant beds in named PGs as occupied (dashboard + public availability).
 *
 * Usage:
 *   npx tsx scripts/mark-pg-fully-occupied.ts
 *   npx tsx scripts/mark-pg-fully-occupied.ts --names "Central,Trimurti"
 */
import 'dotenv/config';

import { closeDb } from '../src/db/client';
import {
  FULLY_OCCUPIED_PG_NAME_PATTERNS,
  findPgIdsByNamePatterns,
  markPgFullyOccupied,
} from '../src/services/occupancyAdmin';
import type { AdminSession } from '../src/lib/auth/session';

const DEFAULT_PATTERNS = [...FULLY_OCCUPIED_PG_NAME_PATTERNS];

function parsePatterns(): string[] {
  const arg = process.argv.find((a) => a.startsWith('--names='));
  if (!arg) return DEFAULT_PATTERNS;
  return arg
    .slice('--names='.length)
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

const bootstrapSession: AdminSession = {
  kind: 'admin',
  sessionId: 'script',
  adminId: null as unknown as string,
  email: 'script@awesomepg.internal',
  fullName: 'Occupancy script',
  role: 'super_admin',
  pgScope: [],
  mustChangePassword: false,
  expiresAt: new Date(Date.now() + 3600_000),
};

async function main() {
  const patterns = parsePatterns();
  console.log(`Looking for PGs matching: ${patterns.join(', ')}`);

  const matches = await findPgIdsByNamePatterns(patterns);
  if (matches.length === 0) {
    console.error('No PGs matched. List all PGs in admin and adjust --names=.');
    process.exit(1);
  }

  for (const pg of matches) {
    console.log(`\n→ ${pg.name} (${pg.id})`);
    const result = await markPgFullyOccupied(bootstrapSession, pg.id);
    if (result.bedsMarked === 0) {
      console.log('  Already fully occupied (no vacant beds).');
    } else {
      console.log(
        `  Marked ${result.bedsMarked} bed(s) occupied · booking ${result.bookingCode}`,
      );
    }
  }

  await closeDb();
  console.log('\nDone.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
