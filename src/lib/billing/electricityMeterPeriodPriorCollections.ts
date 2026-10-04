/**
 * Verified electricity collections attributable to an open meter period
 * (after last finalized closing reading, before the next bill is generated).
 */
import { and, eq, gte, isNull, lt, sql } from 'drizzle-orm';
import { db } from '@/src/db/client';
import {
  bedReservations,
  beds,
  checkoutSettlements,
  customers,
  electricityRoomContributions,
  electricitySettlementLedger,
  vacatingRequests,
} from '@/src/db/schema';
import { addDays, formatDate, parseDate } from '@/src/lib/dates';
import type {
  VerifiedPriorCollection,
  VerifiedPriorCollectionsLoadResult,
} from '@/src/lib/billing/electricityVerifiedPriorCollections';
import { firstOfMonth } from '@/src/services/billing';

const CHECKOUT_COLLECTION_STATUSES = [
  'awaiting_admin_review',
  'approved',
  'refund_pending',
  'completed',
  'refund_paid',
] as const;

const DEPOSIT_ELECTRICITY_REASON = 'Electricity share at checkout';

function dedupeKey(row: VerifiedPriorCollection): string {
  if (row.checkoutSettlementId) return `settlement:${row.checkoutSettlementId}`;
  return `legacy:${row.customerId}:${row.amountPaise}:${row.billingMonth}:${row.source}`;
}

function monthsOverlappingPeriod(periodStart: string, periodEndExclusive: string): string[] {
  const months: string[] = [];
  let cursor = firstOfMonth(periodStart);
  const endMonth = firstOfMonth(formatDate(addDays(parseDate(periodEndExclusive), -1)));
  while (cursor <= endMonth) {
    months.push(cursor);
    const d = parseDate(cursor);
    d.setUTCMonth(d.getUTCMonth() + 1);
    cursor = formatDate(d);
  }
  return months;
}

function dateInHalfOpenRange(date: string, start: string, endExclusive: string): boolean {
  return date >= start && date < endExclusive;
}

/** Collections not yet applied to a generated electricity_bill for this open interval. */
export async function loadVerifiedPriorElectricityCollectionsForOpenMeterPeriod(input: {
  roomId: string;
  reportingBillingMonth: string;
  periodStartDate: string;
  periodEndExclusive: string;
}): Promise<VerifiedPriorCollectionsLoadResult> {
  const roomId = input.roomId?.trim();
  if (!roomId) {
    return emptyResult();
  }

  const periodStart = input.periodStartDate.slice(0, 10);
  const periodEndExclusive = input.periodEndExclusive.slice(0, 10);
  const seen = new Set<string>();
  const collections: VerifiedPriorCollection[] = [];

  const contributionRows = await db
    .select({
      id: electricityRoomContributions.id,
      customerId: electricityRoomContributions.customerId,
      customerName: customers.fullName,
      bookingId: electricityRoomContributions.bookingId,
      billingMonth: electricityRoomContributions.billingMonth,
      amountPaise: electricityRoomContributions.amountPaise,
      kind: electricityRoomContributions.kind,
      contributionDate: electricityRoomContributions.contributionDate,
      checkoutSettlementId: electricityRoomContributions.checkoutSettlementId,
    })
    .from(electricityRoomContributions)
    .innerJoin(customers, eq(customers.id, electricityRoomContributions.customerId))
    .where(
      and(
        eq(electricityRoomContributions.roomId, roomId),
        gte(electricityRoomContributions.contributionDate, periodStart),
        lt(electricityRoomContributions.contributionDate, periodEndExclusive),
      ),
    );

  for (const row of contributionRows) {
    const verified: VerifiedPriorCollection = {
      customerId: row.customerId,
      customerName: row.customerName,
      bookingId: row.bookingId,
      roomId,
      billingMonth: String(row.billingMonth).slice(0, 10),
      amountPaise: row.amountPaise,
      checkoutSettlementId: row.checkoutSettlementId,
      source: row.checkoutSettlementId ? 'checkout_ledger' : 'contribution_table',
      evidence: row.checkoutSettlementId
        ? `electricity_room_contributions checkout_settlement_id=${row.checkoutSettlementId}`
        : `electricity_room_contributions id=${row.id} date=${row.contributionDate}`,
    };
    const key = dedupeKey(verified);
    if (seen.has(key)) continue;
    seen.add(key);
    collections.push(verified);
  }

  const ledgerRows = await db
    .select({
      id: electricitySettlementLedger.id,
      customerId: electricitySettlementLedger.customerId,
      customerName: customers.fullName,
      bookingId: electricitySettlementLedger.bookingId,
      billingMonth: electricitySettlementLedger.billingMonth,
      amountPaise: electricitySettlementLedger.amountPaise,
      checkoutSettlementId: electricitySettlementLedger.checkoutSettlementId,
      electricityBillId: electricitySettlementLedger.electricityBillId,
      stayPeriodStart: electricitySettlementLedger.stayPeriodStart,
      stayPeriodEnd: electricitySettlementLedger.stayPeriodEnd,
      createdAt: electricitySettlementLedger.createdAt,
    })
    .from(electricitySettlementLedger)
    .innerJoin(customers, eq(customers.id, electricitySettlementLedger.customerId))
    .where(
      and(
        eq(electricitySettlementLedger.roomId, roomId),
        eq(electricitySettlementLedger.status, 'collected'),
        isNull(electricitySettlementLedger.electricityBillId),
        sql`${electricitySettlementLedger.amountPaise} > 0`,
      ),
    );

  for (const row of ledgerRows) {
    const createdDate = formatDate(row.createdAt);
    const inRange =
      dateInHalfOpenRange(createdDate, periodStart, periodEndExclusive) ||
      (row.stayPeriodStart != null &&
        row.stayPeriodEnd != null &&
        row.stayPeriodStart < periodEndExclusive &&
        row.stayPeriodEnd >= periodStart);
    if (!inRange) continue;

    const verified: VerifiedPriorCollection = {
      customerId: row.customerId,
      customerName: row.customerName,
      bookingId: row.bookingId,
      roomId,
      billingMonth: String(row.billingMonth).slice(0, 10),
      amountPaise: row.amountPaise,
      checkoutSettlementId: row.checkoutSettlementId,
      source: 'checkout_ledger',
      evidence: `electricity_settlement_ledger id=${row.id} unapplied collected`,
    };
    const key = dedupeKey(verified);
    if (seen.has(key)) continue;
    seen.add(key);
    collections.push(verified);
  }

  for (const month of monthsOverlappingPeriod(periodStart, periodEndExclusive)) {
    const depositRows = await db
      .select({
        checkoutSettlementId: checkoutSettlements.id,
        customerId: checkoutSettlements.customerId,
        customerName: customers.fullName,
        bookingId: checkoutSettlements.bookingId,
        amountPaise: checkoutSettlements.electricityFromDepositPaise,
        vacatingDate: vacatingRequests.vacatingDate,
      })
      .from(checkoutSettlements)
      .innerJoin(vacatingRequests, eq(vacatingRequests.id, checkoutSettlements.vacatingRequestId))
      .innerJoin(customers, eq(customers.id, checkoutSettlements.customerId))
      .innerJoin(bedReservations, eq(bedReservations.bookingId, checkoutSettlements.bookingId))
      .innerJoin(beds, eq(beds.id, bedReservations.bedId))
      .where(
        and(
          eq(beds.roomId, roomId),
          eq(bedReservations.kind, 'primary'),
          sql`${checkoutSettlements.electricityFromDepositPaise} > 0`,
          eq(checkoutSettlements.electricityDeductFromDeposit, true),
          sql`${checkoutSettlements.status} IN (${sql.join(
            CHECKOUT_COLLECTION_STATUSES.map((s) => sql`${s}`),
            sql`, `,
          )})`,
          eq(sql`date_trunc('month', ${vacatingRequests.vacatingDate}::timestamp)::date`, month),
          sql`EXISTS (
            SELECT 1 FROM deposit_ledger dl
            WHERE dl.booking_id = ${checkoutSettlements.bookingId}
              AND dl.entry_kind = 'deducted'
              AND dl.reason = ${DEPOSIT_ELECTRICITY_REASON}
              AND abs(dl.amount_paise) = ${checkoutSettlements.electricityFromDepositPaise}
          )`,
          sql`NOT EXISTS (
            SELECT 1 FROM electricity_room_contributions erc
            WHERE erc.checkout_settlement_id = ${checkoutSettlements.id}
          )`,
          sql`NOT EXISTS (
            SELECT 1 FROM electricity_settlement_ledger esl
            WHERE esl.checkout_settlement_id = ${checkoutSettlements.id}
              AND esl.amount_paise > 0
          )`,
        ),
      );

    for (const row of depositRows) {
      const vacating = String(row.vacatingDate).slice(0, 10);
      if (!dateInHalfOpenRange(vacating, periodStart, periodEndExclusive)) continue;
      const verified: VerifiedPriorCollection = {
        customerId: row.customerId,
        customerName: row.customerName,
        bookingId: row.bookingId,
        roomId,
        billingMonth: month,
        amountPaise: row.amountPaise,
        checkoutSettlementId: row.checkoutSettlementId,
        source: 'deposit_evidence',
        evidence:
          `deposit_ledger "${DEPOSIT_ELECTRICITY_REASON}" vacating=${vacating} ` +
          `checkout_settlement_id=${row.checkoutSettlementId}`,
      };
      const key = dedupeKey(verified);
      if (seen.has(key)) continue;
      seen.add(key);
      collections.push(verified);
    }
  }

  const byCustomerId = new Map<string, number>();
  const contributorCustomerIds = new Set<string>();
  for (const row of collections) {
    byCustomerId.set(row.customerId, (byCustomerId.get(row.customerId) ?? 0) + row.amountPaise);
    contributorCustomerIds.add(row.customerId);
  }

  return {
    collections,
    byCustomerId,
    totalPaise: collections.reduce((sum, row) => sum + row.amountPaise, 0),
    contributorCustomerIds,
  };
}

function emptyResult(): VerifiedPriorCollectionsLoadResult {
  return {
    collections: [],
    byCustomerId: new Map(),
    totalPaise: 0,
    contributorCustomerIds: new Set(),
  };
}
