/**
 * Bulk PG pricing — future bookings only.
 *
 * Updates time-versioned bed_prices rows. Never mutates bookings, invoices,
 * deposit ledger, or checkout settlements (see DECISIONS pricing snapshot).
 */

import { desc, eq, sql } from 'drizzle-orm';
import { db } from '@/src/db/client';
import {
  auditLog,
  pgPriceRevisions,
  pgs,
  type PgPriceRevisionBedChange,
} from '@/src/db/schema';
import type { AdminSession } from '@/src/lib/auth/session';
import { todayString } from '@/src/lib/dates';
import { revalidatePricingViews } from '@/src/lib/pricingRevalidate';
import { getPgInventory, type PgInventoryBedRow } from '@/src/services/pgInventory';
import { writeBedPriceVersion } from '@/src/services/pgInventoryPricing';
import {
  capturePgFinancialFingerprint,
  verifyPgFinancialFingerprintUnchanged,
  type PgFinancialFingerprint,
} from '@/src/services/pgPricingSafetyAudit';

export type BulkPgPricingBedRow = {
  bedId: string;
  roomNumber: string;
  bedCode: string;
  floorLabel: string;
  currentRentPaise: number;
  newRentPaise: number;
  currentDepositPaise: number;
  newDepositPaise: number;
  dailyRatePaise: number;
  weeklyRatePaise: number;
  dailyDepositPaise: number;
  weeklyDepositPaise: number;
};

export type BulkPgPricingPreview = {
  beds: BulkPgPricingBedRow[];
  summary: {
    bedCount: number;
    oldTotalMonthlyRentPaise: number;
    newTotalMonthlyRentPaise: number;
    oldAvgRentPaise: number;
    newAvgRentPaise: number;
    oldAvgDepositPaise: number;
    newAvgDepositPaise: number;
  };
};

export type PgPricingRevisionRow = {
  id: string;
  createdAt: Date;
  adminName: string;
  rentPercentChange: number | null;
  depositPercentChange: number | null;
  bedsAffected: number;
  oldAvgRentPaise: number;
  newAvgRentPaise: number;
  oldAvgDepositPaise: number;
  newAvgDepositPaise: number;
  reason: string | null;
};

function assertSuperAdmin(session: AdminSession) {
  if (session.role !== 'super_admin') {
    throw new Error('Only Super Admin can apply bulk PG pricing changes.');
  }
}

export function adjustRateByPercent(currentPaise: number, percentChange: number): number {
  if (currentPaise <= 0) return 0;
  return Math.max(0, Math.round(currentPaise * (1 + percentChange / 100)));
}

function buildBedPreview(
  bed: PgInventoryBedRow,
  rentPercent: number | null,
  depositPercent: number | null,
): BulkPgPricingBedRow {
  const newRent =
    rentPercent != null && rentPercent !== 0
      ? adjustRateByPercent(bed.monthlyRatePaise, rentPercent)
      : bed.monthlyRatePaise;
  const newDeposit =
    depositPercent != null && depositPercent !== 0
      ? adjustRateByPercent(bed.monthlyDepositPaise, depositPercent)
      : bed.monthlyDepositPaise;

  return {
    bedId: bed.bedId,
    roomNumber: bed.roomNumber,
    bedCode: bed.bedCode,
    floorLabel: bed.floorLabel,
    currentRentPaise: bed.monthlyRatePaise,
    newRentPaise: newRent,
    currentDepositPaise: bed.monthlyDepositPaise,
    newDepositPaise: newDeposit,
    dailyRatePaise: bed.dailyRatePaise,
    weeklyRatePaise: bed.weeklyRatePaise,
    dailyDepositPaise: bed.dailyDepositPaise,
    weeklyDepositPaise: bed.weeklyDepositPaise,
  };
}

function summarize(beds: BulkPgPricingBedRow[]): BulkPgPricingPreview['summary'] {
  const bedCount = beds.length;
  const oldTotalMonthlyRentPaise = beds.reduce((s, b) => s + b.currentRentPaise, 0);
  const newTotalMonthlyRentPaise = beds.reduce((s, b) => s + b.newRentPaise, 0);
  const oldAvgRentPaise = bedCount > 0 ? Math.round(oldTotalMonthlyRentPaise / bedCount) : 0;
  const newAvgRentPaise = bedCount > 0 ? Math.round(newTotalMonthlyRentPaise / bedCount) : 0;
  const oldDepositSum = beds.reduce((s, b) => s + b.currentDepositPaise, 0);
  const newDepositSum = beds.reduce((s, b) => s + b.newDepositPaise, 0);
  const oldAvgDepositPaise = bedCount > 0 ? Math.round(oldDepositSum / bedCount) : 0;
  const newAvgDepositPaise = bedCount > 0 ? Math.round(newDepositSum / bedCount) : 0;
  return {
    bedCount,
    oldTotalMonthlyRentPaise,
    newTotalMonthlyRentPaise,
    oldAvgRentPaise,
    newAvgRentPaise,
    oldAvgDepositPaise,
    newAvgDepositPaise,
  };
}

export async function previewBulkPgPricing(
  session: AdminSession,
  input: {
    pgId: string;
    rentPercentChange?: number | null;
    depositPercentChange?: number | null;
  },
): Promise<BulkPgPricingPreview> {
  const rentPct = input.rentPercentChange ?? null;
  const depPct = input.depositPercentChange ?? null;
  if ((rentPct == null || rentPct === 0) && (depPct == null || depPct === 0)) {
    throw new Error('Enter a rent and/or deposit percentage change.');
  }

  const inv = await getPgInventory(session, input.pgId);
  const beds = inv.beds.map((b) => buildBedPreview(b, rentPct, depPct));
  return { beds, summary: summarize(beds) };
}

export async function getPgPricingDashboard(session: AdminSession, pgId: string) {
  const inv = await getPgInventory(session, pgId);
  const beds = inv.beds.map((b) => buildBedPreview(b, null, null));
  const summary = summarize(beds);

  const revisions = await listPgPriceRevisions(session, pgId, 12);
  const lastRevision = revisions[0] ?? null;

  return {
    beds,
    summary,
    lastRevision,
    revisions,
  };
}

export async function listPgPriceRevisions(
  session: AdminSession,
  pgId: string,
  limit = 20,
): Promise<PgPricingRevisionRow[]> {
  const rows = await db.execute<{
    id: string;
    created_at: Date;
    admin_name: string;
    rent_percent_change: string | null;
    deposit_percent_change: string | null;
    beds_affected: number;
    old_avg_rent_paise: number;
    new_avg_rent_paise: number;
    old_avg_deposit_paise: number;
    new_avg_deposit_paise: number;
    reason: string | null;
  }>(sql`
    SELECT
      r.id,
      r.created_at,
      au.full_name AS admin_name,
      r.rent_percent_change,
      r.deposit_percent_change,
      r.beds_affected,
      r.old_avg_rent_paise,
      r.new_avg_rent_paise,
      r.old_avg_deposit_paise,
      r.new_avg_deposit_paise,
      r.reason
    FROM pg_price_revisions r
    INNER JOIN admin_users au ON au.id = r.admin_id
    WHERE r.pg_id = ${pgId}::uuid
    ORDER BY r.created_at DESC
    LIMIT ${limit}
  `);

  return rows.map((r) => ({
    id: r.id,
    createdAt: r.created_at instanceof Date ? r.created_at : new Date(r.created_at),
    adminName: r.admin_name,
    rentPercentChange: r.rent_percent_change != null ? Number(r.rent_percent_change) : null,
    depositPercentChange:
      r.deposit_percent_change != null ? Number(r.deposit_percent_change) : null,
    bedsAffected: r.beds_affected,
    oldAvgRentPaise: Number(r.old_avg_rent_paise),
    newAvgRentPaise: Number(r.new_avg_rent_paise),
    oldAvgDepositPaise: Number(r.old_avg_deposit_paise),
    newAvgDepositPaise: Number(r.new_avg_deposit_paise),
    reason: r.reason,
  }));
}

export type BulkPgPricingApplyResult = {
  revisionId: string;
  bedsUpdated: number;
  safety: { ok: true; fingerprint: PgFinancialFingerprint };
};

export async function applyBulkPgPricing(
  session: AdminSession,
  input: {
    pgId: string;
    rentPercentChange?: number | null;
    depositPercentChange?: number | null;
    reason?: string;
    confirmation: string;
  },
): Promise<BulkPgPricingApplyResult> {
  assertSuperAdmin(session);
  if (input.confirmation.trim().toUpperCase() !== 'UPDATE') {
    throw new Error('Type UPDATE to confirm.');
  }

  const preview = await previewBulkPgPricing(session, {
    pgId: input.pgId,
    rentPercentChange: input.rentPercentChange,
    depositPercentChange: input.depositPercentChange,
  });

  const changedBeds = preview.beds.filter(
    (b) =>
      b.newRentPaise !== b.currentRentPaise || b.newDepositPaise !== b.currentDepositPaise,
  );
  if (changedBeds.length === 0) {
    throw new Error('No bed prices would change with these percentages.');
  }

  const fingerprintBefore = await capturePgFinancialFingerprint(input.pgId);
  const effectiveFrom = todayString();
  const rentPct = input.rentPercentChange ?? null;
  const depPct = input.depositPercentChange ?? null;
  let revisionId = '';

  const bedChanges: PgPriceRevisionBedChange[] = [];

  await db.transaction(async (tx) => {
    for (const bed of changedBeds) {
      const newDaily =
        rentPct != null && rentPct !== 0
          ? adjustRateByPercent(bed.dailyRatePaise, rentPct)
          : bed.dailyRatePaise;
      const newWeekly =
        rentPct != null && rentPct !== 0
          ? adjustRateByPercent(bed.weeklyRatePaise, rentPct)
          : bed.weeklyRatePaise;
      const newDailyDep =
        depPct != null && depPct !== 0
          ? adjustRateByPercent(bed.dailyDepositPaise, depPct)
          : bed.dailyDepositPaise;
      const newWeeklyDep =
        depPct != null && depPct !== 0
          ? adjustRateByPercent(bed.weeklyDepositPaise, depPct)
          : bed.weeklyDepositPaise;

      await writeBedPriceVersion(
        {
          bedId: bed.bedId,
          dailyRatePaise: newDaily,
          weeklyRatePaise: newWeekly,
          monthlyRatePaise: bed.newRentPaise,
          dailySecurityDepositPaise: newDailyDep,
          weeklySecurityDepositPaise: newWeeklyDep,
          monthlySecurityDepositPaise: bed.newDepositPaise,
          securityDepositPaise: bed.newDepositPaise,
        },
        effectiveFrom,
        tx,
      );

      bedChanges.push({
        bedId: bed.bedId,
        roomNumber: bed.roomNumber,
        bedCode: bed.bedCode,
        oldRentPaise: bed.currentRentPaise,
        newRentPaise: bed.newRentPaise,
        oldDepositPaise: bed.currentDepositPaise,
        newDepositPaise: bed.newDepositPaise,
      });
    }

    const [revision] = await tx
      .insert(pgPriceRevisions)
      .values({
        pgId: input.pgId,
        adminId: session.adminId,
        rentPercentChange: rentPct != null ? String(rentPct) : null,
        depositPercentChange: depPct != null ? String(depPct) : null,
        bedsAffected: changedBeds.length,
        oldAvgRentPaise: preview.summary.oldAvgRentPaise,
        newAvgRentPaise: preview.summary.newAvgRentPaise,
        oldAvgDepositPaise: preview.summary.oldAvgDepositPaise,
        newAvgDepositPaise: preview.summary.newAvgDepositPaise,
        oldTotalMonthlyRentPaise: preview.summary.oldTotalMonthlyRentPaise,
        newTotalMonthlyRentPaise: preview.summary.newTotalMonthlyRentPaise,
        reason: input.reason?.trim() || null,
        bedChanges,
      })
      .returning({ id: pgPriceRevisions.id });

    revisionId = revision!.id;

    await tx.insert(auditLog).values({
      actorType: 'admin',
      actorId: session.adminId,
      entity: 'pg_price_revision',
      entityId: revisionId,
      action: 'bulk_apply',
      diff: {
        pgId: input.pgId,
        rentPercentChange: rentPct,
        depositPercentChange: depPct,
        bedsAffected: changedBeds.length,
        effectiveFrom,
        reason: input.reason ?? null,
      },
    });
  });

  const safety = await verifyPgFinancialFingerprintUnchanged(input.pgId, fingerprintBefore);
  if (!safety.ok) {
    throw new Error(
      `Financial safety check failed: ${safety.violations.join('; ')}. Bed prices were updated — contact engineering.`,
    );
  }

  const [pgRow] = await db.select({ slug: pgs.slug }).from(pgs).where(eq(pgs.id, input.pgId)).limit(1);
  revalidatePricingViews(pgRow?.slug);

  return {
    revisionId,
    bedsUpdated: changedBeds.length,
    safety: { ok: true, fingerprint: fingerprintBefore },
  };
}
