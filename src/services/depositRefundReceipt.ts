import { eq, sql } from 'drizzle-orm';
import { db } from '@/src/db/client';
import {
  adminUsers,
  bookings,
  customers,
  depositLedger,
  depositSettlements,
} from '@/src/db/schema';
import { guardDepositPaise } from '@/src/lib/deposits/paiseSafety';
import {
  DEDUCTION_CATEGORY_LABELS,
  isDepositTransferReason,
  parseDeductionCategory,
} from '@/src/lib/financial/deductionCategories';
import { getDepositSummaryForBooking } from '@/src/services/deposits';

export type DepositRefundReceiptDocument = {
  settlementId: string;
  receiptNumber: string;
  residentName: string;
  residentPhone: string | null;
  bookingId: string;
  bookingCode: string;
  pgName: string | null;
  roomNumber: string | null;
  bedCode: string | null;
  depositCollectedPaise: number;
  deductionsPaise: number;
  deductionLines: Array<{ label: string; amountPaise: number }>;
  refundPaidPaise: number;
  refundMethod: string | null;
  refundReference: string | null;
  refundedAt: Date;
  notes: string | null;
  refundedByLabel: string | null;
};

function formatReceiptNumber(settlementId: string, refundedAt: Date): string {
  const year = refundedAt.getFullYear();
  const suffix = settlementId.replace(/-/g, '').slice(0, 6).toUpperCase();
  return `REF-${year}-${suffix}`;
}

export async function getDepositRefundReceiptDocument(
  settlementId: string,
): Promise<DepositRefundReceiptDocument | null> {
  const [settlement] = await db
    .select()
    .from(depositSettlements)
    .where(eq(depositSettlements.id, settlementId))
    .limit(1);
  if (!settlement || settlement.finalRefundPaise <= 0) return null;

  const [loc] = await db
    .select({
      bookingCode: bookings.bookingCode,
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
      roomNumber: sql<string | null>`(
        SELECT r.room_number FROM bed_reservations br
        INNER JOIN beds bd ON bd.id = br.bed_id
        INNER JOIN rooms r ON r.id = bd.room_id
        WHERE br.booking_id = ${bookings.id} AND br.kind = 'primary'
        ORDER BY br.created_at DESC LIMIT 1
      )`,
      bedCode: sql<string | null>`(
        SELECT bd.bed_code FROM bed_reservations br
        INNER JOIN beds bd ON bd.id = br.bed_id
        WHERE br.booking_id = ${bookings.id} AND br.kind = 'primary'
        ORDER BY br.created_at DESC LIMIT 1
      )`,
    })
    .from(bookings)
    .innerJoin(customers, eq(customers.id, bookings.customerId))
    .where(eq(bookings.id, settlement.bookingId))
    .limit(1);
  if (!loc) return null;

  const [admin] = settlement.refundedByAdminId
    ? await db
        .select({ fullName: adminUsers.fullName, email: adminUsers.email })
        .from(adminUsers)
        .where(eq(adminUsers.id, settlement.refundedByAdminId))
        .limit(1)
    : [null];

  const summary = await getDepositSummaryForBooking(settlement.bookingId);
  const entries = summary?.entries ?? [];

  let depositCollectedPaise = 0;
  let deductionsPaise = 0;
  const deductionLines: Array<{ label: string; amountPaise: number }> = [];

  for (const entry of entries) {
    const amount = Math.abs(guardDepositPaise(entry.amountPaise, 'receipt.amount'));
    if (entry.entryKind === 'collected') {
      depositCollectedPaise += amount;
      continue;
    }
    if (entry.entryKind === 'deducted' && !isDepositTransferReason(entry.reason)) {
      deductionsPaise += amount;
      const category = parseDeductionCategory({
        deductionCategory: entry.deductionCategory,
        reason: entry.reason,
      });
      deductionLines.push({
        label: category ? DEDUCTION_CATEGORY_LABELS[category] : entry.reason?.trim() || 'Deduction',
        amountPaise: amount,
      });
    }
  }

  const [ledgerRow] = settlement.ledgerEntryId
    ? await db
        .select({ reason: depositLedger.reason })
        .from(depositLedger)
        .where(eq(depositLedger.id, settlement.ledgerEntryId))
        .limit(1)
    : [null];

  return {
    settlementId: settlement.id,
    receiptNumber: formatReceiptNumber(settlement.id, settlement.refundedAt),
    residentName: loc.fullName?.trim() || loc.phone || 'Resident',
    residentPhone: loc.phone ?? null,
    bookingId: settlement.bookingId,
    bookingCode: loc.bookingCode,
    pgName: loc.pgName ?? null,
    roomNumber: loc.roomNumber ?? null,
    bedCode: loc.bedCode ?? null,
    depositCollectedPaise,
    deductionsPaise,
    deductionLines,
    refundPaidPaise: guardDepositPaise(settlement.finalRefundPaise, 'receipt.refund'),
    refundMethod: settlement.refundMethod,
    refundReference: settlement.refundReference,
    refundedAt: settlement.refundedAt,
    notes: ledgerRow?.reason ?? null,
    refundedByLabel: admin?.fullName?.trim() || admin?.email || null,
  };
}
