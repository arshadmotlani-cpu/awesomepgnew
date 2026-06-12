/**
 * Benchmark Operations Center load time at current DB scale.
 * Extrapolates query complexity for larger resident counts.
 *
 * Usage: npx tsx scripts/benchmark-operations-center.ts
 */
import 'dotenv/config';

import { sql } from 'drizzle-orm';
import { db, closeDb } from '../src/db/client';
import { bookings } from '../src/db/schema';
import type { AdminSession } from '../src/lib/auth/session';
import { getOperationsCenterData } from '../src/services/operationsCenter';

function mockSuperAdmin(): AdminSession {
  return {
    kind: 'admin',
    sessionId: 'bench',
    adminId: 'bench',
    email: 'bench@local',
    fullName: 'Bench',
    role: 'super_admin',
    pgScope: [],
    mustChangePassword: false,
    rememberMe: false,
    expiresAt: new Date(Date.now() + 86_400_000),
  };
}

async function residentCount(): Promise<number> {
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(bookings)
    .where(sql`${bookings.status} IN ('confirmed', 'completed')`);
  return row?.count ?? 0;
}

async function main() {
  const residents = await residentCount();
  const session = mockSuperAdmin();
  const runs = 5;
  const times: number[] = [];

  for (let i = 0; i < runs; i++) {
    const t0 = performance.now();
    await getOperationsCenterData(session);
    times.push(performance.now() - t0);
  }

  times.sort((a, b) => a - b);
  const median = times[Math.floor(times.length / 2)]!;
  const p95 = times[Math.ceil(times.length * 0.95) - 1]!;

  console.log('Operations Center benchmark');
  console.log(`Current confirmed/completed bookings: ${residents}`);
  console.log(`Runs: ${runs}`);
  console.log(`Median: ${median.toFixed(0)}ms`);
  console.log(`P95: ${p95.toFixed(0)}ms`);
  console.log(`All: ${times.map((t) => t.toFixed(0)).join(', ')}ms`);

  console.log('\nQuery pattern (fixed batch, not O(residents) per card):');
  console.log('  - 8 parallel batches on load');
  console.log('  - Payment proofs: O(PGs) × 3 queries (existing queue)');
  console.log('  - KYC, vacating, reserves, refunds, electricity, PS4: single SQL each');

  const scales = [100, 500, 1000];
  console.log('\nExtrapolated estimates (linear scan on indexed tables):');
  for (const scale of scales) {
    const factor = residents > 0 ? scale / residents : 1;
    const est = median * Math.max(1, Math.sqrt(factor));
    console.log(`  ~${scale} residents: ~${est.toFixed(0)}ms (estimate)`);
  }

  if (median > 3000) {
    console.error('\nWARN: median load exceeds 3s at current scale');
    process.exit(1);
  }

  await closeDb();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
