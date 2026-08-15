#!/usr/bin/env npx tsx
/**
 * Read-only: list active monthly residents not on 1st-of-month billing.
 *
 *   npx tsx scripts/list-billing-cycle-migration-candidates.ts
 *   npx tsx scripts/list-billing-cycle-migration-candidates.ts --json
 *   npx tsx scripts/list-billing-cycle-migration-candidates.ts --all
 */
import { eq } from 'drizzle-orm';
import { db, closeDb } from '@/src/db/client';
import { adminUsers } from '@/src/db/schema/adminUsers';
import {
  listBillingCycleMigrationCandidates,
  type BillingCycleMigrationCandidateRow,
} from '@/src/services/billingCycleMigrationCandidates';
import { paiseToInr } from '@/src/lib/format';

const jsonMode = process.argv.includes('--json');
const includeAll = process.argv.includes('--all');

function formatRow(r: BillingCycleMigrationCandidateRow): Record<string, unknown> {
  return {
    resident: r.customerName,
    pg: r.pgName,
    room: r.roomNumber,
    bed: r.bedCode,
    checkIn: r.checkInDate,
    billingDay: r.billingDay,
    cycle: r.billingCyclePolicyLabel,
    monthlyRent: paiseToInr(r.monthlyRentPaise),
    paidThrough: r.paidThroughDate,
    outstanding: paiseToInr(r.outstandingRentPaise),
    prepaid: r.remainingPrepaidLabel,
    transitionPeriod:
      r.transitionPeriodStart && r.transitionPeriodEnd
        ? `${r.transitionPeriodStart} → ${r.transitionPeriodEnd}`
        : null,
    transitionAmount:
      r.transitionAmountPaise != null ? paiseToInr(r.transitionAmountPaise) : null,
    nextAutoBill: r.firstAutoBillingDate,
    status: r.migrationStatus,
    blocked: r.blockedReason,
    bookingCode: r.bookingId,
    customerId: r.customerId,
  };
}

async function main() {
  const [admin] = await db
    .select()
    .from(adminUsers)
    .where(eq(adminUsers.role, 'super_admin'))
    .limit(1);
  if (!admin) throw new Error('No super_admin found');

  const session = {
    adminId: admin.id,
    role: 'super_admin' as const,
    pgScope: null,
    email: admin.email,
  };

  const rows = await listBillingCycleMigrationCandidates(session, {
    includeOnTarget: includeAll,
  });

  if (jsonMode) {
    console.log(JSON.stringify(rows.map(formatRow), null, 2));
    console.error(`\nTotal: ${rows.length}`);
    return;
  }

  const byPg = new Map<string, BillingCycleMigrationCandidateRow[]>();
  for (const r of rows) {
    const bucket = byPg.get(r.pgName) ?? [];
    bucket.push(r);
    byPg.set(r.pgName, bucket);
  }

  console.log(`Billing cycle migration candidates (${rows.length} residents)\n`);
  for (const [pgName, pgRows] of byPg) {
    console.log(`=== ${pgName} (${pgRows.length}) ===`);
    for (const r of pgRows) {
      const roomBed =
        r.roomNumber && r.bedCode ? `Room ${r.roomNumber} · ${r.bedCode}` : '—';
      const transition =
        r.transitionAmountPaise != null
          ? `transition ${paiseToInr(r.transitionAmountPaise)} (${r.transitionPeriodStart}→${r.transitionPeriodEnd})`
          : 'no transition bill';
      console.log(
        `  ${r.customerName} | ${roomBed} | day ${r.billingDay} ${r.billingCyclePolicyLabel} | rent ${paiseToInr(r.monthlyRentPaise)} | paid through ${r.paidThroughDate ?? '—'} | out ${paiseToInr(r.outstandingRentPaise)} | ${transition} | ${r.migrationStatus}${r.blockedReason ? ` (${r.blockedReason})` : ''}`,
      );
    }
    console.log('');
  }

  const needsMigration = rows.filter((r) => r.migrationStatus === 'eligible').length;
  const blocked = rows.filter((r) => r.migrationStatus === 'blocked').length;
  console.log(`Eligible for migration: ${needsMigration} | Blocked: ${blocked}`);
}

main()
  .then(() => closeDb())
  .catch((err) => {
    console.error(err);
    closeDb().finally(() => process.exit(1));
  });
