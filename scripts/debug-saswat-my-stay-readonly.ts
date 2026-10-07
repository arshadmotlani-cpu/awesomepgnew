/**
 * READ-ONLY: reproduce My Stay tab loaders for Saswat (minimal output).
 * USE_PRODUCTION_DB=1 npx tsx scripts/debug-saswat-my-stay-readonly.ts
 */
import { eq, ilike } from 'drizzle-orm';
import { db, closeDb } from '@/src/db/client';
import { customers } from '@/src/db/schema';
import { loadResidentAccountContextSafe } from '@/src/services/residentAccountContextSafe';
import {
  loadResidentPaymentsTabData,
  loadResidentProfileTabData,
} from '@/src/services/residentPortalTabData';

async function main() {
  const { loadProductionAuditEnv, requireDatabaseUrl } = await import('@/src/lib/db/loadEnv');
  loadProductionAuditEnv();
  requireDatabaseUrl('debug-saswat-my-stay');

  const [resident] = await db
    .select({ id: customers.id, fullName: customers.fullName, email: customers.email })
    .from(customers)
    .where(ilike(customers.fullName, '%Saswat%Baral%'))
    .limit(1);
  if (!resident) throw new Error('Saswat not found');

  const contextLoad = await loadResidentAccountContextSafe(resident.id, resident.email);
  if (!contextLoad.ok) {
    console.error('context failed', contextLoad);
    process.exit(1);
  }

  const session = {
    kind: 'customer' as const,
    sessionId: 'debug',
    customerId: resident.id,
    email: resident.email,
    fullName: resident.fullName,
    phone: '+919999999999',
    expiresAt: new Date(Date.now() + 3_600_000),
  };

  try {
    console.log('profile tab…');
    await loadResidentProfileTabData({
      preloaded: contextLoad.ctx,
      session,
      developerTestMode: false,
      simulatedDurationMode: null,
    });
    console.log('profile tab OK');
  } catch (err) {
    console.error('PROFILE TAB FAILED');
    console.error(err);
    process.exit(1);
  }

  try {
    console.log('payments tab…');
    await loadResidentPaymentsTabData({ preloaded: contextLoad.ctx, session });
    console.log('payments tab OK');
  } catch (err) {
    console.error('PAYMENTS TAB FAILED');
    console.error(err);
    process.exit(1);
  }

  await closeDb();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
