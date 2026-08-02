/**
 * Room OS Wave 2 performance benchmarks.
 *
 * Usage: npm run bench:room-os-wave2
 */
import 'dotenv/config';

import { sql } from 'drizzle-orm';
import { db, closeDb } from '@/src/db/client';
import { rooms } from '@/src/db/schema';
import type { AdminSession } from '@/src/lib/auth/session';
import { loadRoomOsOperationsQueueItems } from '@/src/lib/operations/roomOsOperationsQueueAdapter';
import { getWorkQueue } from '@/src/roomOs/api/v1/decision';
import { loadPropertyIndex } from '@/src/roomOs/api/v1/propertyOs';
import { resolveShantinagarPgId } from '@/src/roomOs/certification/shantinagar/resolvePg';
import { rebuildPropertyOsIndex } from '@/src/roomOs/projectors/property/rebuildPropertyIndex';
import { rebuildWorkQueueIndex } from '@/src/roomOs/projectors/workQueue/rebuildWorkQueueIndex';
import { todayString } from '@/src/lib/dates';
import { firstOfMonth } from '@/src/services/billing';

const RUNS = 5;
const INDEX_GATE_MS = 500;
const SCALE_GATE_ROOMS = 500;

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

async function roomCount(): Promise<number> {
  const [row] = await db.select({ count: sql<number>`count(*)::int` }).from(rooms);
  return row?.count ?? 0;
}

async function bench(label: string, fn: () => Promise<unknown>): Promise<{ median: number; p95: number }> {
  const times: number[] = [];
  for (let i = 0; i < RUNS; i += 1) {
    const t0 = performance.now();
    await fn();
    times.push(performance.now() - t0);
  }
  times.sort((a, b) => a - b);
  const median = times[Math.floor(times.length / 2)]!;
  const p95 = times[Math.ceil(times.length * 0.95) - 1]!;
  console.log(`${label}: median=${median.toFixed(0)}ms p95=${p95.toFixed(0)}ms`);
  return { median, p95 };
}

async function main() {
  const shantinagar = await resolveShantinagarPgId();
  if (!shantinagar) {
    console.error('Shantinagar PG not found — skipping benchmark.');
    process.exit(1);
  }

  const asOf = todayString();
  const billingMonth = firstOfMonth(asOf);
  const roomsTotal = await roomCount();
  const session = mockSuperAdmin();

  console.log('Room OS Wave 2 benchmark');
  console.log(`PG: ${shantinagar.pgName} (${shantinagar.pgId})`);
  console.log(`Billing month: ${billingMonth}`);
  console.log(`Rooms in DB: ${roomsTotal}`);
  console.log(`Runs per benchmark: ${RUNS}`);
  console.log('');

  const rebuildProperty = await bench('rebuildPropertyOsIndex', () =>
    rebuildPropertyOsIndex({ pgId: shantinagar.pgId, billingMonth, asOf }),
  );
  const rebuildWorkQueue = await bench('rebuildWorkQueueIndex', () =>
    rebuildWorkQueueIndex({ pgId: shantinagar.pgId, billingMonth }),
  );
  const readPropertyIndex = await bench('loadPropertyIndex (read)', () =>
    loadPropertyIndex({ pgId: shantinagar.pgId, billingMonth, asOf }),
  );
  const readWorkQueue = await bench('getWorkQueue (read)', () =>
    getWorkQueue({ pgId: shantinagar.pgId, billingMonth, asOf, limit: 50_000 }),
  );
  const opsAdapter = await bench('loadRoomOsOperationsQueueItems', () =>
    loadRoomOsOperationsQueueItems(session),
  );

  console.log('');
  console.log(`Wave 1 gate: index read < ${INDEX_GATE_MS}ms @ ${SCALE_GATE_ROOMS} rooms`);

  let failed = false;
  if (roomsTotal <= SCALE_GATE_ROOMS && readPropertyIndex.median > INDEX_GATE_MS) {
    console.error(
      `FAIL: loadPropertyIndex median ${readPropertyIndex.median.toFixed(0)}ms exceeds ${INDEX_GATE_MS}ms`,
    );
    failed = true;
  }
  if (roomsTotal <= SCALE_GATE_ROOMS && readWorkQueue.median > INDEX_GATE_MS) {
    console.error(
      `FAIL: getWorkQueue median ${readWorkQueue.median.toFixed(0)}ms exceeds ${INDEX_GATE_MS}ms`,
    );
    failed = true;
  }

  console.log(JSON.stringify({
    roomsTotal,
    rebuildPropertyOsIndexMs: rebuildProperty,
    rebuildWorkQueueIndexMs: rebuildWorkQueue,
    loadPropertyIndexMs: readPropertyIndex,
    getWorkQueueMs: readWorkQueue,
    loadRoomOsOperationsQueueItemsMs: opsAdapter,
  }));

  await closeDb();
  if (failed) process.exit(1);
}

main().catch(async (err) => {
  console.error(err);
  await closeDb();
  process.exit(1);
});
