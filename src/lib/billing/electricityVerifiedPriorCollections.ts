/**
 * Unified verified prior electricity collection for a room + consumption month.
 *
 * Prior collection requires canonical financial evidence — never electricity_share_paise alone.
 */
import { and, eq, sql } from 'drizzle-orm';
import { db } from '@/src/db/client';
import {
  bedReservations,
  beds,
  checkoutSettlements,
  customers,
  vacatingRequests,
} from '@/src/db/schema';
import { firstOfMonth } from '@/src/services/billing';
import type { DateLike } from '@/src/lib/dates';
import {
  loadRoomElectricityContributionsForMonth,
  type ElectricityRoomContributionRow,
} from '@/src/services/electricityRoomContributions';

export type VerifiedPriorCollectionSource =
  | 'contribution_table'
  | 'checkout_ledger'
  | 'deposit_evidence';

export type VerifiedPriorCollection = {
  customerId: string;
  customerName?: string;
  bookingId: string;
  roomId: string;
  billingMonth: string;
  amountPaise: number;
  checkoutSettlementId: string | null;
  source: VerifiedPriorCollectionSource;
  evidence: string;
};

export type VerifiedPriorCollectionsLoadResult = {
  collections: VerifiedPriorCollection[];
  byCustomerId: Map<string, number>;
  totalPaise: number;
  contributorCustomerIds: Set<string>;
};

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

function contributionToVerified(row: ElectricityRoomContributionRow): VerifiedPriorCollection {
  const source: VerifiedPriorCollectionSource =
    row.kind === 'checkout_recovery' ? 'checkout_ledger' : 'contribution_table';
  return {
    customerId: row.customerId,
    customerName: row.customerName,
    bookingId: row.bookingId,
    roomId: row.roomId,
    billingMonth: row.billingMonth,
    amountPaise: row.amountPaise,
    checkoutSettlementId: row.checkoutSettlementId,
    source: row.checkoutSettlementId ? source : 'contribution_table',
    evidence:
      row.checkoutSettlementId
        ? `electricity_room_contributions checkout_settlement_id=${row.checkoutSettlementId}`
        : `electricity_room_contributions id=${row.id}`,
  };
}

async function loadDepositEvidenceCollectionsForRoomMonth(
  roomId: string,
  billingMonth: string,
): Promise<VerifiedPriorCollection[]> {
  const rows = await db
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
        sql`date_trunc('month', ${vacatingRequests.vacatingDate}::timestamp)::date = ${billingMonth}::date`,
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

  return rows.map((row) => ({
    customerId: row.customerId,
    customerName: row.customerName,
    bookingId: row.bookingId,
    roomId,
    billingMonth,
    amountPaise: row.amountPaise,
    checkoutSettlementId: row.checkoutSettlementId,
    source: 'deposit_evidence' as const,
    evidence:
      `deposit_ledger deduction "${DEPOSIT_ELECTRICITY_REASON}" ` +
      `matching electricity_from_deposit_paise=${row.amountPaise} ` +
      `checkout_settlement_id=${row.checkoutSettlementId}`,
  }));
}

/** Canonical verified prior collections — contributions, ledger merge, and deposit evidence. */
export async function loadVerifiedPriorElectricityCollectionsForMonth(
  roomId: string,
  billingMonth: DateLike,
): Promise<VerifiedPriorCollectionsLoadResult> {
  const month = firstOfMonth(billingMonth);
  const contributionsLoad = await loadRoomElectricityContributionsForMonth(roomId, month);
  const depositEvidence = await loadDepositEvidenceCollectionsForRoomMonth(roomId, month);

  const seen = new Set<string>();
  const collections: VerifiedPriorCollection[] = [];

  for (const row of contributionsLoad.contributions) {
    const verified = contributionToVerified(row);
    const key = dedupeKey(verified);
    if (seen.has(key)) continue;
    seen.add(key);
    collections.push(verified);
  }

  for (const row of depositEvidence) {
    const key = dedupeKey(row);
    if (seen.has(key)) continue;
    seen.add(key);
    collections.push(row);
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
