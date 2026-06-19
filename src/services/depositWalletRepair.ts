/**
 * Single-booking deposit wallet audit/repair — read-only by default.
 */

import { eq } from 'drizzle-orm';
import { db } from '@/src/db/client';
import { bookings, depositSettlements } from '@/src/db/schema';
import { coerceNonNegativePaise } from '@/src/lib/format';
import { logDepositDebug } from '@/src/lib/depositDebug';
import { syncDepositCollectionFromLedger } from '@/src/services/depositCollection';
import {
  getDepositSummaryForBooking,
  type DepositSummary,
} from '@/src/services/deposits';
import {
  getUnifiedDepositView,
  validateWalletFormula,
} from '@/src/services/depositOperations';

export type DepositWalletAuditEntry = {
  id: string;
  entryKind: string;
  amountPaise: number;
  reason: string;
  createdAt: Date;
};

export type DepositWalletAuditReport = {
  bookingId: string;
  customerId: string;
  bookingCode: string | null;
  booking: {
    depositPaise: number;
    depositDuePaise: number;
    depositCollectionStatus: string;
    totalPaise: number;
  };
  ledger: {
    rowCount: number;
    entries: DepositWalletAuditEntry[];
    collectedPaise: number;
    deductedPaise: number;
    refundedPaise: number;
    refundableBalancePaise: number;
  };
  settlements: { count: number; totalRefundPaise: number };
  unifiedView: Awaited<ReturnType<typeof getUnifiedDepositView>>;
  issues: string[];
  walletFormulaInSync: boolean;
};

export type RepairDepositWalletOptions = {
  /** When true, sync booking due/status from ledger (no ledger row changes). */
  execute?: boolean;
  adminId?: string;
};

export type RepairDepositWalletResult = {
  report: DepositWalletAuditReport;
  executed: boolean;
  syncOk: boolean;
  syncError: string | null;
};

function auditIssues(
  booking: { depositPaise: number; depositDuePaise: number },
  summary: DepositSummary | null,
): string[] {
  const issues: string[] = [];
  const walletCheck = validateWalletFormula(summary);
  if (!walletCheck.inSync && walletCheck.reason) {
    issues.push(walletCheck.reason);
  }
  const required = coerceNonNegativePaise(booking.depositPaise);
  const collected = coerceNonNegativePaise(summary?.collectedPaise ?? 0);
  const due = coerceNonNegativePaise(booking.depositDuePaise);
  const expectedDue = Math.max(0, required - collected);
  if (required > 0 && due !== expectedDue) {
    issues.push(
      `Deposit due mismatch — booking ${due} paise vs ledger-implied ${expectedDue} paise.`,
    );
  }
  if (required > 0 && collected === 0 && due === 0) {
    issues.push('Required deposit set but wallet shows zero collected and zero due.');
  }
  for (const entry of summary?.entries ?? []) {
    const amount = coerceNonNegativePaise(entry.amountPaise);
    if (!Number.isFinite(amount)) {
      issues.push(`Ledger row ${entry.id} has non-numeric amount.`);
    }
    if (entry.entryKind === 'collected' && amount < 0) {
      issues.push(`Ledger row ${entry.id}: collected amount must be positive.`);
    }
    if ((entry.entryKind === 'deducted' || entry.entryKind === 'refunded') && amount > 0) {
      issues.push(`Ledger row ${entry.id}: ${entry.entryKind} amount should be negative.`);
    }
  }
  return issues;
}

/** Audit one booking wallet — does not modify money unless execute=true. */
export async function repairDepositWallet(
  bookingId: string,
  options?: RepairDepositWalletOptions,
): Promise<RepairDepositWalletResult> {
  const [booking] = await db
    .select({
      id: bookings.id,
      bookingCode: bookings.bookingCode,
      customerId: bookings.customerId,
      depositPaise: bookings.depositPaise,
      depositDuePaise: bookings.depositDuePaise,
      depositCollectionStatus: bookings.depositCollectionStatus,
      totalPaise: bookings.totalPaise,
    })
    .from(bookings)
    .where(eq(bookings.id, bookingId))
    .limit(1);

  if (!booking) {
    throw new Error(`Booking not found: ${bookingId}`);
  }

  const summary = await getDepositSummaryForBooking(bookingId);
  const unifiedView = await getUnifiedDepositView(bookingId);
  const walletCheck = validateWalletFormula(summary);

  const settlements = await db
    .select({ finalRefundPaise: depositSettlements.finalRefundPaise })
    .from(depositSettlements)
    .where(eq(depositSettlements.bookingId, bookingId));

  const bookingSnapshot = {
    depositPaise: coerceNonNegativePaise(booking.depositPaise),
    depositDuePaise: coerceNonNegativePaise(booking.depositDuePaise),
    depositCollectionStatus: booking.depositCollectionStatus,
    totalPaise: coerceNonNegativePaise(booking.totalPaise),
  };

  const report: DepositWalletAuditReport = {
    bookingId,
    customerId: booking.customerId,
    bookingCode: booking.bookingCode,
    booking: bookingSnapshot,
    ledger: {
      rowCount: summary?.entries.length ?? 0,
      entries: (summary?.entries ?? []).map((e) => ({
        id: e.id,
        entryKind: e.entryKind,
        amountPaise: coerceNonNegativePaise(e.amountPaise),
        reason: e.reason,
        createdAt: e.createdAt,
      })),
      collectedPaise: coerceNonNegativePaise(summary?.collectedPaise ?? 0),
      deductedPaise: coerceNonNegativePaise(summary?.deductedPaise ?? 0),
      refundedPaise: coerceNonNegativePaise(summary?.refundedPaise ?? 0),
      refundableBalancePaise: coerceNonNegativePaise(summary?.refundableBalancePaise ?? 0),
    },
    settlements: {
      count: settlements.length,
      totalRefundPaise: settlements.reduce(
        (sum, s) => sum + coerceNonNegativePaise(s.finalRefundPaise),
        0,
      ),
    },
    unifiedView,
    issues: auditIssues(bookingSnapshot, summary),
    walletFormulaInSync: walletCheck.inSync,
  };

  logDepositDebug({
    phase: 'repairDepositWallet:audit',
    actionName: 'repairDepositWallet',
    bookingId,
    residentId: booking.customerId,
    requiredDeposit: report.booking.depositPaise,
    collectedDeposit: report.ledger.collectedPaise,
    wallet: report.ledger,
    ledger: { rowCount: report.ledger.rowCount, issues: report.issues },
  });

  let syncOk = false;
  let syncError: string | null = null;
  const executed = Boolean(options?.execute);

  if (executed) {
    if (!walletCheck.inSync) {
      syncError = walletCheck.reason ?? 'Ledger formula mismatch — refusing to sync.';
    } else {
      try {
        await syncDepositCollectionFromLedger(bookingId);
        syncOk = true;
      } catch (err) {
        syncError = err instanceof Error ? err.message : String(err);
        logDepositDebug({
          phase: 'repairDepositWallet:sync_failed',
          actionName: 'repairDepositWallet',
          bookingId,
          residentId: booking.customerId,
          error: err,
        });
      }
    }
  }

  return { report, executed, syncOk, syncError };
}
