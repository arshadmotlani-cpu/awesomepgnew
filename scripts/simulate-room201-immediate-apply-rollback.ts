/* eslint-disable no-console */
/**
 * Rollback-only: reproduce pricing step for Room 201 B2 restore (no commit).
 * USE_PRODUCTION_DB=1 npx tsx scripts/simulate-room201-immediate-apply-rollback.ts
 */
import { loadProductionAuditEnv, requireDatabaseUrl } from '@/src/lib/db/loadEnv';

loadProductionAuditEnv();
requireDatabaseUrl('simulate-room201-immediate-apply-rollback');

import { and, eq, isNull } from 'drizzle-orm';
import { closeDb, db } from '@/src/db/client';
import { beds } from '@/src/db/schema';
import { todayString } from '@/src/lib/dates';
import { monthStartFor, writeBedPriceVersionInTx } from '@/src/services/pgInventoryPricing';

const ROOM_ID = 'dd469fbf-5eba-4ebc-b28b-d4f06ea3c8d1';
const B2_ID = 'f22a5473-811c-4454-a679-b888ac954cc3';

const pricing = {
  dailyRatePaise: 35000,
  weeklyRatePaise: 200000,
  monthlyRatePaise: 510000,
  securityDepositPaise: 721140,
  dailySecurityDepositPaise: 721140,
  weeklySecurityDepositPaise: 721140,
  monthlySecurityDepositPaise: 721140,
};

async function main() {
  const today = todayString();
  const monthStart = monthStartFor(today);
  console.log({ today, monthStart });

  const started = Date.now();
  try {
    await db.transaction(async (tx) => {
      await tx
        .update(beds)
        .set({ archivedAt: null, status: 'available', updatedAt: new Date() })
        .where(eq(beds.id, B2_ID));

      console.log('today effective write (fixed behavior)...');
      await writeBedPriceVersionInTx(tx, { bedId: B2_ID, ...pricing }, today);
      console.log('monthStart write succeeded (unexpected)');

      throw new Error('ROLLBACK_SIMULATION');
    });
  } catch (err) {
    console.log(
      'transaction ended:',
      err instanceof Error ? err.message : err,
      'elapsed_ms',
      Date.now() - started,
    );
  }

  const [b2] = await db
    .select({ archivedAt: beds.archivedAt })
    .from(beds)
    .where(and(eq(beds.id, B2_ID), eq(beds.roomId, ROOM_ID)))
    .limit(1);
  console.log('B2 archived_at after rollback (should be set):', b2?.archivedAt ?? null);
  await closeDb();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
