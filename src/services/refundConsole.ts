/**
 * Refund Console — single admin workflow for deposit refunds, transfers, and deductions.
 */

import { and, desc, eq, ilike, ne, or, sql } from 'drizzle-orm';
import { db } from '@/src/db/client';
import {
  bookings,
  checkoutSettlements,
  customers,
  depositLedger,
  vacatingRequests,
  type DepositLedgerEntry,
} from '@/src/db/schema';
import { guardDepositPaise, guardPlainPaise } from '@/src/lib/deposits/paiseSafety';
import {
  DEDUCTION_CATEGORY_LABELS,
  isDepositTransferReason,
  parseDeductionCategory,
} from '@/src/lib/financial/deductionCategories';
import { getDepositSummaryForBooking, fetchDepositLedgerEntriesForBooking } from '@/src/services/deposits';

export function emptyRefundConsoleWallet(): RefundConsoleWallet {
  return {
    depositPaidPaise: 0,
    depositUsedPaise: 0,
    depositTransferredPaise: 0,
    electricityDeductionPaise: 0,
    policyDeductionPaise: 0,
    otherDeductionsPaise: 0,
    refundPaidPaise: 0,
    remainingDepositPaise: 0,
  };
}

function absLedgerPaise(value: unknown): number {
  return guardDepositPaise(Math.abs(guardPlainPaise(value)), 'refundConsole.absLedgerPaise');
}

function signedLedgerPaise(value: unknown): number {
  return guardPlainPaise(value, 'refundConsole.signedLedgerPaise');
}

function formatDateOnly(value: string | Date | null | undefined): string | null {
  if (value == null) return null;
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value.toISOString().slice(0, 10);
  }
  const trimmed = String(value).trim();
  return trimmed.length > 0 ? trimmed.slice(0, 10) : null;
}

function ledgerEventDate(value: Date | string | null | undefined): Date {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? new Date(0) : value;
  }
  if (!value) return new Date(0);
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? new Date(0) : parsed;
}

export type RefundConsoleBookingRow = {
  bookingId: string;
  bookingCode: string;
  customerId: string;
  customerName: string;
  pgName: string | null;
  bedLabel: string | null;
  status: string;
  wallet: RefundConsoleWallet;
};

export type RefundConsoleWallet = {
  depositPaidPaise: number;
  depositUsedPaise: number;
  depositTransferredPaise: number;
  electricityDeductionPaise: number;
  policyDeductionPaise: number;
  otherDeductionsPaise: number;
  refundPaidPaise: number;
  remainingDepositPaise: number;
};

export type RefundConsoleSearchResult = {
  query: string;
  rows: RefundConsoleBookingRow[];
};

export type RefundConsoleTimelineEvent = {
  id: string;
  label: string;
  detail: string;
  amountPaise: number | null;
  occurredAt: Date;
};

export type RefundConsoleDeductionRow = {
  id: string;
  category: string;
  reason: string;
  amountPaise: number;
  occurredAt: Date;
};

export type RefundConsoleTransferRow = {
  id: string;
  reason: string;
  amountPaise: number;
  occurredAt: Date;
};

export type RefundConsoleCheckoutContext = {
  settlementId: string;
  status: string;
  finalRefundPaise: number | null;
  payoutUpiId: string | null;
  payoutQrUrl: string | null;
  meterPhotoUrl: string | null;
  noticeDeductionPaise: number;
  electricitySharePaise: number;
  damageChargePaise: number;
  cleaningChargePaise: number;
  customChargePaise: number;
  customChargeLabel: string | null;
  vacatingRequestId: string;
  canMarkPaid: boolean;
};

export type RefundConsoleWorkspace = RefundConsoleBookingRow & {
  customerPhone: string | null;
  checkInDate: string | null;
  checkOutDate: string | null;
  vacatingDate: string | null;
  adminDepositRefundStatus: string | null;
  ledger: DepositLedgerEntry[];
  deductions: RefundConsoleDeductionRow[];
  transfers: RefundConsoleTransferRow[];
  timeline: RefundConsoleTimelineEvent[];
  checkout: RefundConsoleCheckoutContext | null;
  suggestedRefundPaise: number;
  refundableBalancePaise: number;
};

function customerDisplayName(row: {
  fullName: string | null;
  phone: string | null;
}): string {
  const name = row.fullName?.trim();
  return name || row.phone || 'Resident';
}

function summarizeWallet(entries: DepositLedgerEntry[]): RefundConsoleWallet {
  let depositPaidPaise = 0;
  let depositUsedPaise = 0;
  let depositTransferredPaise = 0;
  let electricityDeductionPaise = 0;
  let policyDeductionPaise = 0;
  let otherDeductionsPaise = 0;
  let refundPaidPaise = 0;

  for (const entry of entries) {
    const amount = absLedgerPaise(entry.amountPaise);
    if (entry.entryKind === 'collected') {
      depositPaidPaise += guardDepositPaise(
        signedLedgerPaise(entry.amountPaise),
        'refundConsole.collected',
      );
      continue;
    }
    if (entry.entryKind === 'refunded') {
      refundPaidPaise += amount;
      continue;
    }
    if (entry.entryKind !== 'deducted') continue;

    if (isDepositTransferReason(entry.reason)) {
      depositTransferredPaise += amount;
      continue;
    }

    const category = parseDeductionCategory({
      deductionCategory: entry.deductionCategory,
      reason: entry.reason,
    });

    if (category === 'electricity') {
      electricityDeductionPaise += amount;
    } else if (category === 'notice_policy' || category === 'five_day_policy') {
      policyDeductionPaise += amount;
    } else {
      otherDeductionsPaise += amount;
    }
  }

  depositUsedPaise = electricityDeductionPaise + policyDeductionPaise + otherDeductionsPaise;

  const remainingDepositPaise = Math.max(
    0,
    depositPaidPaise - depositTransferredPaise - depositUsedPaise - refundPaidPaise,
  );

  return {
    depositPaidPaise: guardDepositPaise(depositPaidPaise, 'refundConsole.depositPaidPaise'),
    depositUsedPaise: guardDepositPaise(depositUsedPaise, 'refundConsole.depositUsedPaise'),
    depositTransferredPaise: guardDepositPaise(
      depositTransferredPaise,
      'refundConsole.depositTransferredPaise',
    ),
    electricityDeductionPaise: guardDepositPaise(
      electricityDeductionPaise,
      'refundConsole.electricityDeductionPaise',
    ),
    policyDeductionPaise: guardDepositPaise(
      policyDeductionPaise,
      'refundConsole.policyDeductionPaise',
    ),
    otherDeductionsPaise: guardDepositPaise(
      otherDeductionsPaise,
      'refundConsole.otherDeductionsPaise',
    ),
    refundPaidPaise: guardDepositPaise(refundPaidPaise, 'refundConsole.refundPaidPaise'),
    remainingDepositPaise: guardDepositPaise(
      remainingDepositPaise,
      'refundConsole.remainingDepositPaise',
    ),
  };
}

export async function buildRefundConsoleWallet(bookingId: string): Promise<RefundConsoleWallet> {
  const summary = await getDepositSummaryForBooking(bookingId);
  if (!summary) return emptyRefundConsoleWallet();
  return summarizeWallet(summary.entries);
}

export async function searchRefundConsoleBookings(
  query: string,
  limit = 40,
): Promise<RefundConsoleSearchResult> {
  const trimmed = query.trim();
  if (!trimmed) {
    return { query: trimmed, rows: [] };
  }

  const pattern = `%${trimmed}%`;
  const rows = await db
    .select({
      bookingId: bookings.id,
      bookingCode: bookings.bookingCode,
      customerId: bookings.customerId,
      status: bookings.status,
      fullName: customers.fullName,
      phone: customers.phone,
      pgName: sql<string | null>`(
        SELECT p.name FROM bed_reservations br
        INNER JOIN beds bd ON bd.id = br.bed_id
        INNER JOIN rooms r ON r.id = bd.room_id
        INNER JOIN floors f ON f.id = r.floor_id
        INNER JOIN pgs p ON p.id = f.pg_id
        WHERE br.booking_id = ${bookings.id} AND br.kind = 'primary'
        ORDER BY br.created_at DESC LIMIT 1
      )`,
      bedLabel: sql<string | null>`(
        SELECT concat('Room ', r.room_number, ' · Bed ', bd.bed_code)
        FROM bed_reservations br
        INNER JOIN beds bd ON bd.id = br.bed_id
        INNER JOIN rooms r ON r.id = bd.room_id
        WHERE br.booking_id = ${bookings.id} AND br.kind = 'primary'
        ORDER BY br.created_at DESC LIMIT 1
      )`,
    })
    .from(bookings)
    .innerJoin(customers, eq(customers.id, bookings.customerId))
    .where(
      and(
        eq(bookings.isTest, false),
        eq(customers.isTest, false),
        or(
          ilike(bookings.bookingCode, pattern),
          ilike(customers.phone, pattern),
          ilike(customers.fullName, pattern),
          sql`${bookings.id}::text ILIKE ${pattern}`,
        ),
      ),
    )
    .orderBy(desc(bookings.createdAt))
    .limit(limit);

  const result: RefundConsoleBookingRow[] = [];
  for (const row of rows) {
    const wallet = await buildRefundConsoleWallet(row.bookingId);
    result.push({
      bookingId: row.bookingId,
      bookingCode: row.bookingCode,
      customerId: row.customerId,
      customerName: customerDisplayName(row),
      pgName: row.pgName,
      bedLabel: row.bedLabel,
      status: row.status,
      wallet,
    });
  }

  return { query: trimmed, rows: result };
}

/** All bookings for one resident (booking picker). */
export async function listRefundConsoleBookingsForCustomer(
  customerId: string,
  limit = 20,
): Promise<RefundConsoleBookingRow[]> {
  const rows = await db
    .select({
      bookingId: bookings.id,
      bookingCode: bookings.bookingCode,
      customerId: bookings.customerId,
      status: bookings.status,
      fullName: customers.fullName,
      phone: customers.phone,
      pgName: sql<string | null>`(
        SELECT p.name FROM bed_reservations br
        INNER JOIN beds bd ON bd.id = br.bed_id
        INNER JOIN rooms r ON r.id = bd.room_id
        INNER JOIN floors f ON f.id = r.floor_id
        INNER JOIN pgs p ON p.id = f.pg_id
        WHERE br.booking_id = ${bookings.id} AND br.kind = 'primary'
        ORDER BY br.created_at DESC LIMIT 1
      )`,
      bedLabel: sql<string | null>`(
        SELECT concat('Room ', r.room_number, ' · Bed ', bd.bed_code)
        FROM bed_reservations br
        INNER JOIN beds bd ON bd.id = br.bed_id
        INNER JOIN rooms r ON r.id = bd.room_id
        WHERE br.booking_id = ${bookings.id} AND br.kind = 'primary'
        ORDER BY br.created_at DESC LIMIT 1
      )`,
    })
    .from(bookings)
    .innerJoin(customers, eq(customers.id, bookings.customerId))
    .where(and(eq(bookings.customerId, customerId), eq(bookings.isTest, false)))
    .orderBy(desc(bookings.createdAt))
    .limit(limit);

  const result: RefundConsoleBookingRow[] = [];
  for (const row of rows) {
    const wallet = await buildRefundConsoleWallet(row.bookingId);
    result.push({
      bookingId: row.bookingId,
      bookingCode: row.bookingCode,
      customerId: row.customerId,
      customerName: customerDisplayName(row),
      pgName: row.pgName,
      bedLabel: row.bedLabel,
      status: row.status,
      wallet,
    });
  }
  return result;
}

export async function getRefundConsoleBookingDetail(
  bookingId: string,
): Promise<(RefundConsoleBookingRow & { ledger: DepositLedgerEntry[] }) | null> {
  const [row] = await db
    .select({
      bookingId: bookings.id,
      bookingCode: bookings.bookingCode,
      customerId: bookings.customerId,
      status: bookings.status,
      fullName: customers.fullName,
      phone: customers.phone,
      pgName: sql<string | null>`(
        SELECT p.name FROM bed_reservations br
        INNER JOIN beds bd ON bd.id = br.bed_id
        INNER JOIN rooms r ON r.id = bd.room_id
        INNER JOIN floors f ON f.id = r.floor_id
        INNER JOIN pgs p ON p.id = f.pg_id
        WHERE br.booking_id = ${bookings.id} AND br.kind = 'primary'
        ORDER BY br.created_at DESC LIMIT 1
      )`,
      bedLabel: sql<string | null>`(
        SELECT concat('Room ', r.room_number, ' · Bed ', bd.bed_code)
        FROM bed_reservations br
        INNER JOIN beds bd ON bd.id = br.bed_id
        INNER JOIN rooms r ON r.id = bd.room_id
        WHERE br.booking_id = ${bookings.id} AND br.kind = 'primary'
        ORDER BY br.created_at DESC LIMIT 1
      )`,
    })
    .from(bookings)
    .innerJoin(customers, eq(customers.id, bookings.customerId))
    .where(eq(bookings.id, bookingId))
    .limit(1);

  if (!row) return null;

  let ledger: DepositLedgerEntry[] = [];
  let wallet = emptyRefundConsoleWallet();

  try {
    const summary = await getDepositSummaryForBooking(bookingId);
    if (summary) {
      ledger = summary.entries;
      wallet = summarizeWallet(summary.entries);
    } else {
      ledger = await fetchDepositLedgerEntriesForBooking(bookingId);
      if (ledger.length > 0) {
        wallet = summarizeWallet(ledger);
      }
    }
  } catch (err) {
    console.error('[refundConsole] deposit summary failed', bookingId, err);
    try {
      ledger = await fetchDepositLedgerEntriesForBooking(bookingId);
      if (ledger.length > 0) {
        wallet = summarizeWallet(ledger);
      }
    } catch {
      ledger = [];
    }
  }

  if (ledger.length === 0 && wallet.remainingDepositPaise === 0) {
    const [depositRow] = await db
      .select({ depositPaise: bookings.depositPaise })
      .from(bookings)
      .where(eq(bookings.id, bookingId))
      .limit(1);
    const depositPaise = guardDepositPaise(depositRow?.depositPaise ?? 0, 'refundConsole.fallbackDepositPaise');
    if (depositPaise > 0) {
      wallet = {
        ...emptyRefundConsoleWallet(),
        depositPaidPaise: depositPaise,
        remainingDepositPaise: depositPaise,
      };
    }
  }

  return {
    bookingId: row.bookingId,
    bookingCode: row.bookingCode,
    customerId: row.customerId,
    customerName: customerDisplayName(row),
    pgName: row.pgName,
    bedLabel: row.bedLabel,
    status: row.status,
    wallet,
    ledger,
  };
}

function ledgerTimelineLabel(entry: DepositLedgerEntry): string {
  if (entry.entryKind === 'collected') return 'Deposit collected';
  if (entry.entryKind === 'refunded') return 'Refund paid';
  if (entry.entryKind === 'deducted') {
    if (isDepositTransferReason(entry.reason)) return 'Deposit transferred';
    return 'Deduction applied';
  }
  return entry.entryKind;
}

function buildTimeline(entries: DepositLedgerEntry[]): RefundConsoleTimelineEvent[] {
  return [...entries]
    .sort(
      (a, b) =>
        ledgerEventDate(b.createdAt).getTime() - ledgerEventDate(a.createdAt).getTime(),
    )
    .map((entry) => ({
      id: entry.id,
      label: ledgerTimelineLabel(entry),
      detail: entry.reason?.trim() || '—',
      amountPaise: signedLedgerPaise(entry.amountPaise),
      occurredAt: ledgerEventDate(entry.createdAt),
    }));
}

function buildDeductionRows(entries: DepositLedgerEntry[]): RefundConsoleDeductionRow[] {
  return entries
    .filter((e) => e.entryKind === 'deducted' && !isDepositTransferReason(e.reason))
    .map((entry) => {
      const category = parseDeductionCategory({
        deductionCategory: entry.deductionCategory,
        reason: entry.reason,
      });
      return {
        id: entry.id,
        category: category ? DEDUCTION_CATEGORY_LABELS[category] : 'Other',
        reason: entry.reason?.trim() || 'Deduction',
        amountPaise: absLedgerPaise(entry.amountPaise),
        occurredAt: ledgerEventDate(entry.createdAt),
      };
    })
    .sort((a, b) => b.occurredAt.getTime() - a.occurredAt.getTime());
}

function buildTransferRows(entries: DepositLedgerEntry[]): RefundConsoleTransferRow[] {
  return entries
    .filter((e) => e.entryKind === 'deducted' && isDepositTransferReason(e.reason))
    .map((entry) => ({
      id: entry.id,
      reason: entry.reason?.trim() || 'Deposit transfer',
      amountPaise: absLedgerPaise(entry.amountPaise),
      occurredAt: ledgerEventDate(entry.createdAt),
    }))
    .sort((a, b) => b.occurredAt.getTime() - a.occurredAt.getTime());
}

function mapCheckoutSettlement(
  settlement: {
    id: string;
    status: string;
    finalRefundPaise: number | null;
    payoutUpiId: string | null;
    payoutQrUrl: string | null;
    electricityMeterPhotoUrl: string | null;
    noticeDeductionPaise: number;
    electricitySharePaise: number;
    damageChargePaise: number;
    cleaningChargePaise: number;
    customChargePaise: number;
    customChargeLabel: string | null;
    vacatingRequestId: string;
  },
  refundableBalancePaise: number,
): RefundConsoleCheckoutContext {
  const finalRefundPaise =
    settlement.finalRefundPaise == null
      ? null
      : guardDepositPaise(settlement.finalRefundPaise, 'refundConsole.checkout.finalRefundPaise');

  return {
    settlementId: settlement.id,
    status: settlement.status,
    finalRefundPaise,
    payoutUpiId: settlement.payoutUpiId,
    payoutQrUrl: settlement.payoutQrUrl,
    meterPhotoUrl: settlement.electricityMeterPhotoUrl,
    noticeDeductionPaise: guardDepositPaise(
      settlement.noticeDeductionPaise,
      'refundConsole.checkout.noticeDeductionPaise',
    ),
    electricitySharePaise: guardDepositPaise(
      settlement.electricitySharePaise,
      'refundConsole.checkout.electricitySharePaise',
    ),
    damageChargePaise: guardDepositPaise(
      settlement.damageChargePaise,
      'refundConsole.checkout.damageChargePaise',
    ),
    cleaningChargePaise: guardDepositPaise(
      settlement.cleaningChargePaise,
      'refundConsole.checkout.cleaningChargePaise',
    ),
    customChargePaise: guardDepositPaise(
      settlement.customChargePaise,
      'refundConsole.checkout.customChargePaise',
    ),
    customChargeLabel: settlement.customChargeLabel,
    vacatingRequestId: settlement.vacatingRequestId ?? '',
    canMarkPaid:
      settlement.status === 'refund_pending' &&
      (finalRefundPaise ?? 0) > 0 &&
      refundableBalancePaise >= (finalRefundPaise ?? 0),
  };
}

export async function getRefundConsoleWorkspace(
  bookingId: string,
): Promise<RefundConsoleWorkspace | null> {
  try {
    return await buildRefundConsoleWorkspace(bookingId);
  } catch (err) {
    console.error('[refundConsole] getRefundConsoleWorkspace failed', bookingId, err);
    return buildRefundConsoleWorkspaceFallback(bookingId);
  }
}

async function buildRefundConsoleWorkspaceFallback(
  bookingId: string,
): Promise<RefundConsoleWorkspace | null> {
  try {
    const detail = await getRefundConsoleBookingDetail(bookingId);
    if (!detail) return null;
    return {
      ...detail,
      customerPhone: null,
      checkInDate: null,
      checkOutDate: null,
      vacatingDate: null,
      adminDepositRefundStatus: null,
      deductions: [],
      transfers: [],
      timeline: [],
      checkout: null,
      suggestedRefundPaise: detail.wallet.remainingDepositPaise,
      refundableBalancePaise: detail.wallet.remainingDepositPaise,
    };
  } catch (fallbackErr) {
    console.error('[refundConsole] fallback workspace failed', bookingId, fallbackErr);
    return null;
  }
}

async function buildRefundConsoleWorkspace(
  bookingId: string,
): Promise<RefundConsoleWorkspace | null> {
  const detail = await getRefundConsoleBookingDetail(bookingId);
  if (!detail) return null;

  const [bookingRow] = await db
    .select({
      phone: customers.phone,
      checkInDate: bookings.billingAnchorDate,
      checkOutDate: bookings.expectedCheckoutDate,
      adminDepositRefundStatus: bookings.adminDepositRefundStatus,
    })
    .from(bookings)
    .innerJoin(customers, eq(customers.id, bookings.customerId))
    .where(eq(bookings.id, bookingId))
    .limit(1);

  const [vacatingRow] = await db
    .select({ vacatingDate: vacatingRequests.vacatingDate })
    .from(vacatingRequests)
    .where(eq(vacatingRequests.bookingId, bookingId))
    .orderBy(desc(vacatingRequests.createdAt))
    .limit(1);

  const [settlement] = await db
      .select({
        id: checkoutSettlements.id,
        status: checkoutSettlements.status,
        finalRefundPaise: checkoutSettlements.finalRefundPaise,
        payoutUpiId: checkoutSettlements.payoutUpiId,
        payoutQrUrl: checkoutSettlements.payoutQrUrl,
        electricityMeterPhotoUrl: checkoutSettlements.electricityMeterPhotoUrl,
        noticeDeductionPaise: checkoutSettlements.noticeDeductionPaise,
        electricitySharePaise: checkoutSettlements.electricitySharePaise,
        damageChargePaise: checkoutSettlements.damageChargePaise,
        cleaningChargePaise: checkoutSettlements.cleaningChargePaise,
        customChargePaise: checkoutSettlements.customChargePaise,
        customChargeLabel: checkoutSettlements.customChargeLabel,
        vacatingRequestId: checkoutSettlements.vacatingRequestId,
      })
      .from(checkoutSettlements)
      .where(
        and(
          eq(checkoutSettlements.bookingId, bookingId),
          ne(checkoutSettlements.status, 'archived'),
        ),
      )
      .orderBy(desc(checkoutSettlements.updatedAt))
      .limit(1);

  const refundableBalancePaise = detail.wallet.remainingDepositPaise;
  const checkoutRefundPaise =
    settlement == null || settlement.finalRefundPaise == null
      ? null
      : guardDepositPaise(settlement.finalRefundPaise, 'refundConsole.checkoutRefundPaise');
  const suggestedRefundPaise =
    settlement?.status === 'refund_pending' && checkoutRefundPaise != null
      ? checkoutRefundPaise
      : refundableBalancePaise;

  let checkout: RefundConsoleCheckoutContext | null = null;
  try {
    checkout = settlement ? mapCheckoutSettlement(settlement, refundableBalancePaise) : null;
  } catch (checkoutErr) {
    console.error('[refundConsole] checkout mapping failed', bookingId, checkoutErr);
  }

  let deductions: RefundConsoleDeductionRow[] = [];
  let transfers: RefundConsoleTransferRow[] = [];
  let timeline: RefundConsoleTimelineEvent[] = [];
  try {
    deductions = buildDeductionRows(detail.ledger);
    transfers = buildTransferRows(detail.ledger);
    timeline = buildTimeline(detail.ledger);
  } catch (ledgerErr) {
    console.error('[refundConsole] ledger presentation failed', bookingId, ledgerErr);
  }

  return {
    ...detail,
    customerPhone: bookingRow?.phone ?? null,
    checkInDate: formatDateOnly(bookingRow?.checkInDate),
    checkOutDate: formatDateOnly(bookingRow?.checkOutDate),
    vacatingDate: formatDateOnly(vacatingRow?.vacatingDate),
    adminDepositRefundStatus: bookingRow?.adminDepositRefundStatus ?? null,
    deductions,
    transfers,
    timeline,
    checkout,
    suggestedRefundPaise: guardDepositPaise(
      suggestedRefundPaise,
      'refundConsole.suggestedRefundPaise',
    ),
    refundableBalancePaise,
  };
}
