/**
 * Deposit wallet repair — sync booking caches from ledger without creating ledger rows.
 */

import { eq, sql } from 'drizzle-orm';
import { db } from '@/src/db/client';
import { auditLog, bookings } from '@/src/db/schema';
import { syncDepositCollectionFromLedger } from '@/src/services/depositCollection';
import {
  getDepositSummaryForBooking,
  type DepositSummary,
} from '@/src/services/deposits';
import { validateWalletFormula } from '@/src/services/depositOperations';

export type DepositRepairRow = {
  bookingId: string;
  bookingCode: string;
  customerId: string;
  issue: string;
  requiredPaise: number;
  collectedPaise: number;
  refundablePaise: number;
  depositDuePaise: number;
};

export type DepositRepairPreview = {
  rows: DepositRepairRow[];
  totalScanned: number;
  issueCount: number;
};

export type DepositRepairResult = {
  synced: number;
  skipped: number;
  failed: Array<{ bookingId: string; error: string }>;
};

async function loadCandidateBookings(): Promise<
  Array<{ id: string; bookingCode: string; customerId: string; depositPaise: number; depositDuePaise: number }>
> {
  return db
    .select({
      id: bookings.id,
      bookingCode: bookings.bookingCode,
      customerId: bookings.customerId,
      depositPaise: bookings.depositPaise,
      depositDuePaise: bookings.depositDuePaise,
    })
    .from(bookings)
    .where(sql`${bookings.depositPaise} > 0 OR EXISTS (
      SELECT 1 FROM deposit_ledger dl WHERE dl.booking_id = ${bookings.id}
    )`);
}

function issuesForBooking(
  booking: { depositPaise: number; depositDuePaise: number },
  summary: DepositSummary | null,
): string[] {
  const issues: string[] = [];
  const walletCheck = validateWalletFormula(summary);
  if (!walletCheck.inSync && walletCheck.reason) {
    issues.push(walletCheck.reason);
  }
  const collected = summary?.collectedPaise ?? 0;
  const expectedDue = Math.max(0, booking.depositPaise - collected);
  if (booking.depositPaise > 0 && booking.depositDuePaise !== expectedDue) {
    issues.push(
      `Deposit due mismatch — booking shows ₹${(booking.depositDuePaise / 100).toLocaleString('en-IN')} but ledger implies ₹${(expectedDue / 100).toLocaleString('en-IN')}.`,
    );
  }
  if (booking.depositPaise > 0 && collected === 0 && booking.depositDuePaise === 0) {
    issues.push('Required deposit set but wallet shows zero collected and zero due.');
  }
  return issues;
}

export async function previewDepositRepair(): Promise<DepositRepairPreview> {
  const candidates = await loadCandidateBookings();
  const rows: DepositRepairRow[] = [];

  for (const booking of candidates) {
    const summary = await getDepositSummaryForBooking(booking.id);
    const issues = issuesForBooking(booking, summary);
    if (issues.length === 0) continue;
    rows.push({
      bookingId: booking.id,
      bookingCode: booking.bookingCode,
      customerId: booking.customerId,
      issue: issues.join(' '),
      requiredPaise: booking.depositPaise,
      collectedPaise: summary?.collectedPaise ?? 0,
      refundablePaise: summary?.refundableBalancePaise ?? 0,
      depositDuePaise: booking.depositDuePaise,
    });
  }

  return {
    rows,
    totalScanned: candidates.length,
    issueCount: rows.length,
  };
}

export async function executeDepositRepair(input: {
  adminId: string;
  dryRun?: boolean;
}): Promise<DepositRepairResult> {
  const preview = await previewDepositRepair();
  const result: DepositRepairResult = { synced: 0, skipped: 0, failed: [] };

  for (const row of preview.rows) {
    const summary = await getDepositSummaryForBooking(row.bookingId);
    const walletCheck = validateWalletFormula(summary);
    if (!walletCheck.inSync) {
      result.skipped += 1;
      result.failed.push({
        bookingId: row.bookingId,
        error: walletCheck.reason ?? 'Ledger formula mismatch — manual review required.',
      });
      continue;
    }
    if (input.dryRun) {
      result.synced += 1;
      continue;
    }
    try {
      await syncDepositCollectionFromLedger(row.bookingId);
      result.synced += 1;
    } catch (err) {
      result.skipped += 1;
      result.failed.push({
        bookingId: row.bookingId,
        error: err instanceof Error ? err.message : 'Sync failed.',
      });
    }
  }

  if (!input.dryRun && result.synced > 0) {
    await db.insert(auditLog).values({
      actorType: 'admin',
      actorId: input.adminId,
      entity: 'system',
      entityId: input.adminId,
      action: 'deposit_repair_executed',
      diff: {
        synced: result.synced,
        skipped: result.skipped,
        failed: result.failed.slice(0, 20),
      },
    });
  }

  return result;
}
