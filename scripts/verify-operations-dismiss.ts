#!/usr/bin/env npx tsx
/**
 * Audit + verify Operations queue dismiss for a resident (e.g. Harish).
 *
 * Usage:
 *   DATABASE_URL='…' npx tsx scripts/verify-operations-dismiss.ts Harish
 *   DATABASE_URL='…' npx tsx scripts/verify-operations-dismiss.ts --phone=6369363982
 */
import 'dotenv/config';
import { closeDb } from '@/src/db/client';
import { auditOperationsQueueSourcesForResident } from '@/src/services/operationsQueueDismissals';
import { loadResidentOperationsDashboard } from '@/src/services/residentOperationsDashboard';
import type { AdminSession } from '@/src/lib/auth/session';

function arg(name: string): string | undefined {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit?.split('=').slice(1).join('=');
}

const SUPER_ADMIN_SESSION: AdminSession = {
  adminId: '00000000-0000-0000-0000-000000000001',
  email: 'verify@awesomepg.local',
  role: 'super_admin',
  pgScope: [],
  mustChangePassword: false,
};

async function main() {
  const query = arg('phone') ?? process.argv[2] ?? 'Harish';
  console.log(`\n=== Operations dismiss verification: ${query} ===\n`);

  const audit = await auditOperationsQueueSourcesForResident(query);
  if (!audit) {
    console.error('Resident not found');
    process.exit(1);
  }

  console.log('--- Audit ---');
  console.log(JSON.stringify(audit, null, 2));

  const dashboard = await loadResidentOperationsDashboard(SUPER_ADMIN_SESSION);
  const residentId = audit.resident_id;
  const inQueue = dashboard.queue.filter((q) => q.customerId === residentId);
  const inBlocked = dashboard.queue.filter(
    (q) => q.customerId === residentId && q.category === 'refund',
  );

  console.log('\n--- Queue presence after loaders ---');
  console.log({
    queue_rows: inQueue.length,
    refund_rows: inBlocked.length,
    queue_item_ids: inQueue.map((q) => q.id),
  });

  if (inQueue.length > 0) {
    console.error('\nFAIL: Resident still appears in Operations queue.');
    console.error('Sources:', audit.queue_sources);
    process.exit(1);
  }

  console.log('\nPASS: Resident absent from Operations queue loaders.');
  await closeDb();
}

main().catch(async (err) => {
  console.error(err);
  await closeDb().catch(() => undefined);
  process.exit(1);
});
