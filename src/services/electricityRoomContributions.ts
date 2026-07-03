/**
 * Room electricity contributions — SSOT for pre-distribution credits
 * (historical offline payments and checkout deposit recoveries).
 */
import { and, eq, inArray, sql } from 'drizzle-orm';
import { db } from '@/src/db/client';
import {
  customers,
  electricityRoomContributions,
  roomElectricityLedgerCycles,
  roomElectricityLedgerEntries,
} from '@/src/db/schema';
import { formatDate } from '@/src/lib/dates';
import type { DateLike } from '@/src/lib/dates';
import { firstOfMonth } from '@/src/services/billing';
import { listCheckoutElectricityLedgerForRoomMonth } from '@/src/services/electricitySettlementLedger';

type DbTx = Parameters<Parameters<typeof db.transaction>[0]>[0];

export type ElectricityRoomContributionRow = {
  id: string;
  roomId: string;
  billingMonth: string;
  customerId: string;
  customerName: string;
  bookingId: string;
  amountPaise: number;
  kind: 'historical' | 'checkout_recovery';
  reason: string | null;
  contributionDate: string;
  occupancyStart: string | null;
  occupancyEnd: string | null;
  checkoutSettlementId: string | null;
  createdByAdminId: string | null;
  createdAt: Date;
};

export type RoomElectricityContributionsLoadResult = {
  contributions: ElectricityRoomContributionRow[];
  byCustomerId: Map<string, number>;
  totalPaise: number;
  contributorCustomerIds: Set<string>;
  usesLegacyFallback: boolean;
};

const MANUAL_LEDGER_SOURCES = ['manual', 'cash', 'upi'] as const;

export async function recordHistoricalElectricityContributionInTx(
  tx: DbTx,
  input: {
    roomId: string;
    billingMonth: string;
    customerId: string;
    bookingId: string;
    amountPaise: number;
    reason?: string | null;
    contributionDate?: string;
    createdByAdminId?: string | null;
  },
): Promise<{ id: string }> {
  if (input.amountPaise <= 0) {
    throw new Error('Contribution amount must be greater than zero.');
  }

  const billingMonth = firstOfMonth(input.billingMonth);
  const contributionDate = input.contributionDate ?? formatDate(new Date());

  const [duplicate] = await tx
    .select({ id: electricityRoomContributions.id })
    .from(electricityRoomContributions)
    .where(
      and(
        eq(electricityRoomContributions.roomId, input.roomId),
        eq(electricityRoomContributions.billingMonth, billingMonth),
        eq(electricityRoomContributions.customerId, input.customerId),
        eq(electricityRoomContributions.bookingId, input.bookingId),
        eq(electricityRoomContributions.kind, 'historical'),
        eq(electricityRoomContributions.amountPaise, input.amountPaise),
        input.reason
          ? eq(electricityRoomContributions.reason, input.reason)
          : sql`${electricityRoomContributions.reason} IS NULL`,
      ),
    )
    .limit(1);

  if (duplicate) return { id: duplicate.id };

  const [row] = await tx
    .insert(electricityRoomContributions)
    .values({
      roomId: input.roomId,
      billingMonth,
      customerId: input.customerId,
      bookingId: input.bookingId,
      amountPaise: input.amountPaise,
      kind: 'historical',
      reason: input.reason ?? null,
      contributionDate,
      createdByAdminId: input.createdByAdminId ?? null,
    })
    .returning({ id: electricityRoomContributions.id });

  return { id: row.id };
}

export async function recordHistoricalElectricityContribution(input: {
  roomId: string;
  billingMonth: DateLike;
  customerId: string;
  bookingId: string;
  amountPaise: number;
  reason?: string | null;
  contributionDate?: string;
  createdByAdminId?: string | null;
}): Promise<{ id: string }> {
  const billingMonth = firstOfMonth(input.billingMonth);
  return db.transaction(async (tx) =>
    recordHistoricalElectricityContributionInTx(tx, { ...input, billingMonth }),
  );
}

export async function recordCheckoutElectricityContributionInTx(
  tx: DbTx,
  input: {
    roomId: string;
    billingMonth: string;
    customerId: string;
    bookingId: string;
    amountPaise: number;
    checkoutSettlementId: string;
    contributionDate?: string;
    occupancyStart?: string | null;
    occupancyEnd?: string | null;
    reason?: string | null;
  },
): Promise<void> {
  if (input.amountPaise <= 0) return;

  const billingMonth = firstOfMonth(input.billingMonth);
  const contributionDate = input.contributionDate ?? billingMonth;

  await tx
    .insert(electricityRoomContributions)
    .values({
      roomId: input.roomId,
      billingMonth,
      customerId: input.customerId,
      bookingId: input.bookingId,
      amountPaise: input.amountPaise,
      kind: 'checkout_recovery',
      reason: input.reason ?? 'Recovered from deposit at checkout',
      contributionDate,
      occupancyStart: input.occupancyStart ?? null,
      occupancyEnd: input.occupancyEnd ?? null,
      checkoutSettlementId: input.checkoutSettlementId,
    })
    .onConflictDoNothing({
      target: electricityRoomContributions.checkoutSettlementId,
    });
}

async function loadContributionsFromTable(
  roomId: string,
  billingMonth: string,
): Promise<ElectricityRoomContributionRow[]> {
  const rows = await db
    .select({
      id: electricityRoomContributions.id,
      roomId: electricityRoomContributions.roomId,
      billingMonth: electricityRoomContributions.billingMonth,
      customerId: electricityRoomContributions.customerId,
      customerName: customers.fullName,
      bookingId: electricityRoomContributions.bookingId,
      amountPaise: electricityRoomContributions.amountPaise,
      kind: electricityRoomContributions.kind,
      reason: electricityRoomContributions.reason,
      contributionDate: electricityRoomContributions.contributionDate,
      occupancyStart: electricityRoomContributions.occupancyStart,
      occupancyEnd: electricityRoomContributions.occupancyEnd,
      checkoutSettlementId: electricityRoomContributions.checkoutSettlementId,
      createdByAdminId: electricityRoomContributions.createdByAdminId,
      createdAt: electricityRoomContributions.createdAt,
    })
    .from(electricityRoomContributions)
    .innerJoin(customers, eq(customers.id, electricityRoomContributions.customerId))
    .where(
      and(
        eq(electricityRoomContributions.roomId, roomId),
        eq(electricityRoomContributions.billingMonth, billingMonth),
      ),
    )
    .orderBy(electricityRoomContributions.contributionDate, electricityRoomContributions.createdAt);

  return rows.map((r) => ({
    ...r,
    kind: r.kind as 'historical' | 'checkout_recovery',
    contributionDate: String(r.contributionDate),
    occupancyStart: r.occupancyStart ? String(r.occupancyStart) : null,
    occupancyEnd: r.occupancyEnd ? String(r.occupancyEnd) : null,
    billingMonth: String(r.billingMonth),
  }));
}

async function loadLegacyContributionsForRoomMonth(
  roomId: string,
  billingMonth: string,
): Promise<ElectricityRoomContributionRow[]> {
  const contributions: ElectricityRoomContributionRow[] = [];

  const checkoutRows = await listCheckoutElectricityLedgerForRoomMonth(roomId, billingMonth, {
    status: 'collected',
  });
  for (const row of checkoutRows) {
    contributions.push({
      id: `legacy-checkout-${row.id}`,
      roomId,
      billingMonth,
      customerId: row.customerId,
      customerName: row.customerName,
      bookingId: row.bookingId,
      amountPaise: row.amountPaise,
      kind: 'checkout_recovery',
      reason: 'Recovered from deposit at checkout',
      contributionDate: formatDate(row.createdAt),
      occupancyStart: null,
      occupancyEnd: null,
      checkoutSettlementId: row.checkoutSettlementId,
      createdByAdminId: null,
      createdAt: row.createdAt,
    });
  }

  const [cycle] = await db
    .select({ id: roomElectricityLedgerCycles.id })
    .from(roomElectricityLedgerCycles)
    .where(
      and(
        eq(roomElectricityLedgerCycles.roomId, roomId),
        eq(roomElectricityLedgerCycles.billingMonth, billingMonth),
      ),
    )
    .limit(1);

  if (cycle) {
    const manualRows = await db
      .select({
        id: roomElectricityLedgerEntries.id,
        customerId: roomElectricityLedgerEntries.customerId,
        customerName: customers.fullName,
        bookingId: roomElectricityLedgerEntries.bookingId,
        amountPaise: roomElectricityLedgerEntries.amountPaise,
        note: roomElectricityLedgerEntries.note,
        collectedAt: roomElectricityLedgerEntries.collectedAt,
      })
      .from(roomElectricityLedgerEntries)
      .innerJoin(customers, eq(customers.id, roomElectricityLedgerEntries.customerId))
      .where(
        and(
          eq(roomElectricityLedgerEntries.cycleId, cycle.id),
          inArray(roomElectricityLedgerEntries.source, [...MANUAL_LEDGER_SOURCES]),
        ),
      );

    for (const row of manualRows) {
      contributions.push({
        id: `legacy-manual-${row.id}`,
        roomId,
        billingMonth,
        customerId: row.customerId,
        customerName: row.customerName,
        bookingId: row.bookingId,
        amountPaise: row.amountPaise,
        kind: 'historical',
        reason: row.note ?? 'Offline payment recorded before contribution ledger',
        contributionDate: formatDate(row.collectedAt),
        occupancyStart: null,
        occupancyEnd: null,
        checkoutSettlementId: null,
        createdByAdminId: null,
        createdAt: row.collectedAt,
      });
    }
  }

  return contributions;
}

export async function loadCheckoutElectricityContributionForSettlement(
  checkoutSettlementId: string,
): Promise<ElectricityRoomContributionRow | null> {
  const [row] = await db
    .select({
      id: electricityRoomContributions.id,
      roomId: electricityRoomContributions.roomId,
      billingMonth: electricityRoomContributions.billingMonth,
      customerId: electricityRoomContributions.customerId,
      customerName: customers.fullName,
      bookingId: electricityRoomContributions.bookingId,
      amountPaise: electricityRoomContributions.amountPaise,
      kind: electricityRoomContributions.kind,
      reason: electricityRoomContributions.reason,
      contributionDate: electricityRoomContributions.contributionDate,
      occupancyStart: electricityRoomContributions.occupancyStart,
      occupancyEnd: electricityRoomContributions.occupancyEnd,
      checkoutSettlementId: electricityRoomContributions.checkoutSettlementId,
      createdByAdminId: electricityRoomContributions.createdByAdminId,
      createdAt: electricityRoomContributions.createdAt,
    })
    .from(electricityRoomContributions)
    .innerJoin(customers, eq(customers.id, electricityRoomContributions.customerId))
    .where(eq(electricityRoomContributions.checkoutSettlementId, checkoutSettlementId))
    .limit(1);

  if (!row) return null;
  return {
    ...row,
    kind: row.kind as 'historical' | 'checkout_recovery',
    contributionDate: String(row.contributionDate),
    occupancyStart: row.occupancyStart ? String(row.occupancyStart) : null,
    occupancyEnd: row.occupancyEnd ? String(row.occupancyEnd) : null,
    billingMonth: String(row.billingMonth),
  };
}

function buildContributionsLoadResult(
  contributions: ElectricityRoomContributionRow[],
  usesLegacyFallback: boolean,
): RoomElectricityContributionsLoadResult {
  const byCustomerId = new Map<string, number>();
  const contributorCustomerIds = new Set<string>();
  for (const row of contributions) {
    byCustomerId.set(row.customerId, (byCustomerId.get(row.customerId) ?? 0) + row.amountPaise);
    contributorCustomerIds.add(row.customerId);
  }
  const totalPaise = contributions.reduce((sum, row) => sum + row.amountPaise, 0);
  return { contributions, byCustomerId, totalPaise, contributorCustomerIds, usesLegacyFallback };
}

/** Load room contributions for allocation — table SSOT with legacy ledger fallback. */
export async function loadRoomElectricityContributionsForMonth(
  roomId: string,
  billingMonth: DateLike,
): Promise<RoomElectricityContributionsLoadResult> {
  const month = firstOfMonth(billingMonth);
  const tableRows = await loadContributionsFromTable(roomId, month);
  if (tableRows.length > 0) {
    return buildContributionsLoadResult(tableRows, false);
  }
  const legacyRows = await loadLegacyContributionsForRoomMonth(roomId, month);
  return buildContributionsLoadResult(legacyRows, legacyRows.length > 0);
}

export async function listRoomElectricityContributionsForMonth(
  roomId: string,
  billingMonth: DateLike,
): Promise<ElectricityRoomContributionRow[]> {
  const load = await loadRoomElectricityContributionsForMonth(roomId, billingMonth);
  return load.contributions;
}
