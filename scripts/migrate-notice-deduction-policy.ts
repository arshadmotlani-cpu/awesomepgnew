/* eslint-disable no-console */
/**
 * Migrate active vacating + open checkout settlements to the pro-rata notice policy.
 *
 * Updates ONLY:
 *   - vacating_requests.status IN ('pending', 'approved')
 *   - checkout_settlements.status IN ('awaiting_resident_details', 'awaiting_admin_review')
 *     where amounts_locked = false
 *
 * Does NOT touch completed vacatings, paid refunds, or deposit_ledger history.
 *
 * Usage:
 *   npx tsx scripts/migrate-notice-deduction-policy.ts           # dry-run (default)
 *   npx tsx scripts/migrate-notice-deduction-policy.ts --apply
 */
import 'dotenv/config';
import { and, eq, inArray } from 'drizzle-orm';
import { closeDb, db } from '@/src/db/client';
import {
  bookings,
  checkoutSettlements,
  vacatingRequests,
} from '@/src/db/schema';
import { noticeDeductionAppliesToBooking } from '@/src/lib/checkout/noticeDeductionPolicy';
import { diffDays } from '@/src/lib/dates';
import {
  computeNoticeDeduction,
  isNoticeCompliant,
  noticeShortfallDays,
  VACATING_NOTICE_MIN_DAYS,
} from '@/src/services/billing';

type VacatingPatch = {
  id: string;
  bookingCode: string | null;
  status: string;
  noticeGivenDate: string;
  vacatingDate: string;
  beforeDeductionPaise: number;
  afterDeductionPaise: number;
  beforeCompliant: boolean;
  afterCompliant: boolean;
};

type SettlementPatch = {
  id: string;
  vacatingRequestId: string;
  status: string;
  beforeNoticeDeductionPaise: number;
  afterNoticeDeductionPaise: number;
  beforeShortfallDays: number;
  afterShortfallDays: number;
};

function policyForVacating(row: {
  noticeGivenDate: string;
  vacatingDate: string;
  monthlyRentPaiseSnapshot: number;
}) {
  const noticeCompliant = isNoticeCompliant({
    noticeGivenDate: row.noticeGivenDate,
    vacatingDate: row.vacatingDate,
  });
  const deductionPaise = computeNoticeDeduction(row.monthlyRentPaiseSnapshot, {
    noticeGivenDate: row.noticeGivenDate,
    vacatingDate: row.vacatingDate,
  });
  return { noticeCompliant, deductionPaise };
}

function policyForSettlement(row: {
  noticeGivenDate: string;
  vacatingDate: string;
  monthlyRentPaiseSnapshot: number;
  stayType: string | null;
  durationMode: string | null;
}) {
  const noticeGivenDays = diffDays(row.noticeGivenDate, row.vacatingDate);
  const shortfall = noticeShortfallDays({
    noticeGivenDate: row.noticeGivenDate,
    vacatingDate: row.vacatingDate,
  });
  const applies = noticeDeductionAppliesToBooking({
    stayType: row.stayType,
    durationMode: row.durationMode,
  });
  const noticeDeductionPaise = applies
    ? computeNoticeDeduction(row.monthlyRentPaiseSnapshot, {
        noticeGivenDate: row.noticeGivenDate,
        vacatingDate: row.vacatingDate,
      })
    : 0;
  return {
    noticeGivenDays,
    noticeShortfallDays: applies ? shortfall : 0,
    noticeDeductionPaise,
  };
}

async function main() {
  const apply = process.argv.includes('--apply');
  console.log(apply ? 'APPLY — writing updates.\n' : 'DRY RUN — pass --apply to write.\n');

  const activeVacating = await db
    .select({
      id: vacatingRequests.id,
      bookingId: vacatingRequests.bookingId,
      status: vacatingRequests.status,
      noticeGivenDate: vacatingRequests.noticeGivenDate,
      vacatingDate: vacatingRequests.vacatingDate,
      noticeCompliant: vacatingRequests.noticeCompliant,
      deductionPaise: vacatingRequests.deductionPaise,
      monthlyRentPaiseSnapshot: vacatingRequests.monthlyRentPaiseSnapshot,
      bookingCode: bookings.bookingCode,
    })
    .from(vacatingRequests)
    .innerJoin(bookings, eq(bookings.id, vacatingRequests.bookingId))
    .where(inArray(vacatingRequests.status, ['pending', 'approved']));

  const vacatingPatches: VacatingPatch[] = [];
  for (const row of activeVacating) {
    const policy = policyForVacating(row);
    if (
      row.deductionPaise === policy.deductionPaise &&
      row.noticeCompliant === policy.noticeCompliant
    ) {
      continue;
    }
    vacatingPatches.push({
      id: row.id,
      bookingCode: row.bookingCode,
      status: row.status,
      noticeGivenDate: row.noticeGivenDate,
      vacatingDate: row.vacatingDate,
      beforeDeductionPaise: row.deductionPaise,
      afterDeductionPaise: policy.deductionPaise,
      beforeCompliant: row.noticeCompliant,
      afterCompliant: policy.noticeCompliant,
    });
  }

  const openSettlements = await db
    .select({
      id: checkoutSettlements.id,
      vacatingRequestId: checkoutSettlements.vacatingRequestId,
      status: checkoutSettlements.status,
      amountsLocked: checkoutSettlements.amountsLocked,
      noticeGivenDays: checkoutSettlements.noticeGivenDays,
      noticeShortfallDays: checkoutSettlements.noticeShortfallDays,
      noticeDeductionPaise: checkoutSettlements.noticeDeductionPaise,
      monthlyRentPaiseSnapshot: checkoutSettlements.monthlyRentPaiseSnapshot,
      noticeGivenDate: vacatingRequests.noticeGivenDate,
      vacatingDate: vacatingRequests.vacatingDate,
      stayType: bookings.stayType,
      durationMode: bookings.durationMode,
    })
    .from(checkoutSettlements)
    .innerJoin(
      vacatingRequests,
      eq(vacatingRequests.id, checkoutSettlements.vacatingRequestId),
    )
    .innerJoin(bookings, eq(bookings.id, checkoutSettlements.bookingId))
    .where(
      and(
        inArray(checkoutSettlements.status, [
          'awaiting_resident_details',
          'awaiting_admin_review',
        ]),
        eq(checkoutSettlements.amountsLocked, false),
        inArray(vacatingRequests.status, ['pending', 'approved']),
      ),
    );

  const settlementPatches: SettlementPatch[] = [];
  for (const row of openSettlements) {
    const policy = policyForSettlement(row);
    if (
      row.noticeDeductionPaise === policy.noticeDeductionPaise &&
      row.noticeShortfallDays === policy.noticeShortfallDays &&
      row.noticeGivenDays === policy.noticeGivenDays
    ) {
      continue;
    }
    settlementPatches.push({
      id: row.id,
      vacatingRequestId: row.vacatingRequestId,
      status: row.status,
      beforeNoticeDeductionPaise: row.noticeDeductionPaise,
      afterNoticeDeductionPaise: policy.noticeDeductionPaise,
      beforeShortfallDays: row.noticeShortfallDays,
      afterShortfallDays: policy.noticeShortfallDays,
    });
  }

  console.log(`Active vacating rows scanned: ${activeVacating.length}`);
  console.log(`Vacating rows to update: ${vacatingPatches.length}`);
  console.log(`Open settlements scanned: ${openSettlements.length}`);
  console.log(`Settlements to update: ${settlementPatches.length}\n`);

  if (vacatingPatches.length > 0) {
    console.table(
      vacatingPatches.map((p) => ({
        booking: p.bookingCode,
        status: p.status,
        vacatingDate: p.vacatingDate,
        deductionBefore: p.beforeDeductionPaise / 100,
        deductionAfter: p.afterDeductionPaise / 100,
        compliantBefore: p.beforeCompliant,
        compliantAfter: p.afterCompliant,
      })),
    );
  }

  if (settlementPatches.length > 0) {
    console.table(
      settlementPatches.map((p) => ({
        settlementId: p.id.slice(0, 8),
        status: p.status,
        noticeBefore: p.beforeNoticeDeductionPaise / 100,
        noticeAfter: p.afterNoticeDeductionPaise / 100,
        shortfallBefore: p.beforeShortfallDays,
        shortfallAfter: p.afterShortfallDays,
      })),
    );
  }

  if (!apply) {
    console.log('\nDry run complete. Re-run with --apply to persist.');
    await closeDb();
    return;
  }

  await db.transaction(async (tx) => {
    for (const patch of vacatingPatches) {
      await tx
        .update(vacatingRequests)
        .set({
          deductionPaise: patch.afterDeductionPaise,
          noticeCompliant: patch.afterCompliant,
          updatedAt: new Date(),
        })
        .where(eq(vacatingRequests.id, patch.id));
    }

    for (const patch of settlementPatches) {
      const row = openSettlements.find((s) => s.id === patch.id);
      if (!row) continue;
      const policy = policyForSettlement(row);
      await tx
        .update(checkoutSettlements)
        .set({
          noticeRequiredDays: VACATING_NOTICE_MIN_DAYS,
          noticeGivenDays: policy.noticeGivenDays,
          noticeShortfallDays: policy.noticeShortfallDays,
          noticeDeductionPaise: policy.noticeDeductionPaise,
          updatedAt: new Date(),
        })
        .where(eq(checkoutSettlements.id, patch.id));
    }
  });

  console.log(
    `\nApplied ${vacatingPatches.length} vacating + ${settlementPatches.length} settlement update(s).`,
  );
  await closeDb();
}

main().catch(async (err) => {
  console.error(err);
  await closeDb();
  process.exit(1);
});
