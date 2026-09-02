/**
 * Orchestrates all data sources for the Room Electricity Audit Panel (SSOT).
 * Assembly only — no new billing math.
 */
import { and, eq, inArray, lt } from 'drizzle-orm';
import { getElectricityBillDetail } from '@/src/db/queries/admin';
import { listElectricityInvoicesForBooking, type ElectricityInvoiceRow } from '@/src/db/queries/customer';
import { db } from '@/src/db/client';
import { electricityBills, electricityInvoices, rooms } from '@/src/db/schema';
import { loadElectricityBillBreakdown } from '@/src/lib/billing/buildElectricityBillBreakdown';
import {
  buildRoomElectricityAuditView,
  type RoomElectricityAuditInvoiceProjection,
  type RoomElectricityAuditView,
} from '@/src/lib/billing/buildRoomElectricityAuditView';
import type { ElectricityBillCalculationBreakdown } from '@/src/lib/billing/electricityBillBreakdownTypes';
import { isProductionElectricityBillFilter } from '@/src/lib/billing/electricityProductionFilter';
import {
  buildRoomElectricityOperatorView,
  mapElectricityInvoiceToHistoryRow,
  type ElectricityInvoiceHistoryRow,
  type RoomElectricityOperatorView,
} from '@/src/lib/billing/buildRoomElectricityOperatorView';
import { firstOfMonth } from '@/src/services/billing';
import { resolveFinancialInvoiceIdMap } from '@/src/services/adminCashSettlement';
import {
  loadElectricityPaymentHistoryForBill,
  loadElectricityPaymentHistoryForBooking,
  type ElectricityPaymentHistoryRow,
} from '@/src/services/electricityPaymentHistory';
import { projectElectricityInvoice } from '@/src/services/electricityBilling';
import { getElectricitySettlementLedgerView } from '@/src/services/electricitySettlementLedgerView';
import type { ElectricitySettlementLedgerView } from '@/src/services/electricitySettlementLedgerView';

export type RoomElectricityAuditNavigation = {
  siblingBills: Array<{ id: string; roomId: string; roomNumber: string }>;
  sameRoomOtherMonths: Array<{ id: string; billingMonth: string }>;
};

export type RoomElectricityAuditDistributionRow = {
  invoiceId: string;
  invoiceNumber: string;
  bookingId: string;
  customerFullName: string;
  bedCode: string;
  amountPaise: number;
  status: string;
  paidPaise: number;
  paidAt: Date | null;
  unitsShare: number | null;
  activeDays: number | null;
};

export type RoomElectricityAuditBundle = {
  billId: string;
  roomId: string;
  pgId: string;
  pgName: string;
  billingMonth: string;
  audit: RoomElectricityAuditView | null;
  operator: RoomElectricityOperatorView | null;
  breakdown: ElectricityBillCalculationBreakdown | null;
  ledger: ElectricitySettlementLedgerView | null;
  distribution: RoomElectricityAuditDistributionRow[];
  paymentHistory: ElectricityPaymentHistoryRow[];
  navigation: RoomElectricityAuditNavigation;
  domainWarnings: Array<{ code: string; message: string }>;
};

export type RoomElectricityAuditLoadResult =
  | { ok: true; bundle: RoomElectricityAuditBundle }
  | {
      ok: false;
      code:
        | 'not_found'
        | 'missing_room'
        | 'missing_breakdown'
        | 'incomplete_generation'
        | 'unexpected_error';
      message: string;
      recoverable: boolean;
      billId?: string;
      operatorHint?: string;
    };

async function loadPriorOutstandingByBooking(
  roomId: string,
  billingMonth: string,
  bookingIds: string[],
): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  if (bookingIds.length === 0) return map;

  const month = firstOfMonth(billingMonth);
  const priorRows = await db
    .select()
    .from(electricityInvoices)
    .where(
      and(
        eq(electricityInvoices.roomId, roomId),
        lt(electricityInvoices.billingMonth, month),
        inArray(electricityInvoices.bookingId, bookingIds),
        isProductionElectricityBillFilter(),
      ),
    );

  for (const inv of priorRows) {
    const projected = projectElectricityInvoice(inv);
    if (projected.outstandingPaise <= 0) continue;
    const prev = map.get(inv.bookingId) ?? 0;
    map.set(inv.bookingId, prev + projected.outstandingPaise);
  }

  return map;
}

async function buildNavigation(input: {
  billId: string;
  roomId: string;
  pgId: string;
  billingMonth: string;
}): Promise<RoomElectricityAuditNavigation> {
  const month = firstOfMonth(input.billingMonth);
  const rows = await db
    .select({
      id: electricityBills.id,
      roomId: electricityBills.roomId,
      roomNumber: rooms.roomNumber,
      billingMonth: electricityBills.billingMonth,
    })
    .from(electricityBills)
    .innerJoin(rooms, eq(rooms.id, electricityBills.roomId))
    .where(and(eq(electricityBills.pgId, input.pgId), isProductionElectricityBillFilter()));

  const siblingBills: RoomElectricityAuditNavigation['siblingBills'] = [];
  const sameRoomOtherMonths: RoomElectricityAuditNavigation['sameRoomOtherMonths'] = [];

  for (const row of rows) {
    if (firstOfMonth(row.billingMonth) === month && row.id !== input.billId) {
      siblingBills.push({ id: row.id, roomId: row.roomId, roomNumber: row.roomNumber });
    }
    if (row.roomId === input.roomId && firstOfMonth(row.billingMonth) !== month) {
      sameRoomOtherMonths.push({ id: row.id, billingMonth: row.billingMonth });
    }
  }

  siblingBills.sort((a, b) => a.roomNumber.localeCompare(b.roomNumber, undefined, { numeric: true }));
  sameRoomOtherMonths.sort((a, b) => b.billingMonth.localeCompare(a.billingMonth));

  return { siblingBills, sameRoomOtherMonths };
}

export async function loadRoomElectricityAuditBundleResult(
  billId: string,
): Promise<RoomElectricityAuditLoadResult> {
  try {
    const bundle = await loadRoomElectricityAuditBundleInner(billId);
    if (!bundle) {
      return {
        ok: false,
        code: 'not_found',
        message: 'Electricity bill not found.',
        recoverable: false,
        billId,
      };
    }
    return { ok: true, bundle };
  } catch (err) {
    console.error('[electricity] audit bundle load failed', {
      domain: 'electricity',
      command: 'loadRoomElectricityAuditBundle',
      billId,
      message: err instanceof Error ? err.message : String(err),
    });
    return {
      ok: false,
      code: 'unexpected_error',
      message:
        'Electricity bill details could not be assembled. Retry, or open the bill from Billing Centre.',
      recoverable: true,
      billId,
    };
  }
}

/** @deprecated Prefer loadRoomElectricityAuditBundleResult. */
export async function loadRoomElectricityAuditBundle(
  billId: string,
): Promise<RoomElectricityAuditBundle | null> {
  const result = await loadRoomElectricityAuditBundleResult(billId);
  return result.ok ? result.bundle : null;
}

async function loadRoomElectricityAuditBundleInner(
  billId: string,
): Promise<RoomElectricityAuditBundle | null> {
  const detail = await getElectricityBillDetail(billId);
  if (!detail.ok || !detail.data?.bill) return null;

  const bill = detail.data.bill;
  const domainWarnings: Array<{ code: string; message: string }> = [];

  const [billRow] = await db
    .select({
      roomId: electricityBills.roomId,
      pgId: electricityBills.pgId,
      previousReadingUnits: electricityBills.previousReadingUnits,
      currentReadingUnits: electricityBills.currentReadingUnits,
      createdAt: electricityBills.createdAt,
    })
    .from(electricityBills)
    .where(eq(electricityBills.id, billId))
    .limit(1);

  if (!billRow?.roomId) return null;

  const roomId = billRow.roomId;
  const billingMonth = bill.billingMonth;

  const [ledger, calculationBreakdown] = await Promise.all([
    getElectricitySettlementLedgerView({
      roomId,
      billingMonth,
      fallbackTotalBillPaise: bill.totalPaise,
    }).catch(() => null),
    loadElectricityBillBreakdown(billId),
  ]);

  if (!calculationBreakdown) {
    domainWarnings.push({
      code: 'missing_breakdown',
      message:
        'Calculation breakdown is missing or could not be rebuilt. Invoice amounts below remain authoritative.',
    });
  }
  if (!ledger) {
    domainWarnings.push({
      code: 'missing_ledger',
      message: 'Settlement ledger view is unavailable for this room/month.',
    });
  }

  const invoiceIds = detail.data.distribution.map((d) => d.invoiceId);
  const invoiceMeta =
    invoiceIds.length > 0
      ? await db
          .select()
          .from(electricityInvoices)
          .where(inArray(electricityInvoices.id, invoiceIds))
      : [];

  const metaById = new Map(invoiceMeta.map((m) => [m.id, m]));

  const distribution: RoomElectricityAuditDistributionRow[] = detail.data.distribution.map(
    (row) => {
      const meta = metaById.get(row.invoiceId);
      return {
        invoiceId: row.invoiceId,
        invoiceNumber: row.invoiceNumber,
        bookingId: row.bookingId,
        customerFullName: row.customerFullName,
        bedCode: row.bedCode,
        amountPaise: row.amountPaise,
        status: row.status,
        paidPaise: meta?.paidPaise ?? 0,
        paidAt: meta?.paidAt ?? row.paidAt ?? null,
        unitsShare: meta?.unitsShare != null ? Number(meta.unitsShare) : null,
        activeDays: meta?.activeDays ?? null,
      };
    },
  );

  const financialMap =
    distribution.length > 0
      ? await resolveFinancialInvoiceIdMap(
          distribution.map((d) => ({
            sourceTable: 'electricity_invoices' as const,
            sourceId: d.invoiceId,
          })),
        )
      : new Map<string, string>();

  const bookingIds = [
    ...new Set([
      ...distribution.map((d) => d.bookingId),
      ...(calculationBreakdown?.timeline.map((t) => t.bookingId) ?? []),
    ]),
  ];

  const priorOutstandingByBookingId = await loadPriorOutstandingByBooking(
    roomId,
    billingMonth,
    bookingIds,
  );

  const invoiceProjectionByBookingId = new Map<string, RoomElectricityAuditInvoiceProjection>();
  for (const inv of invoiceMeta) {
    const projected = projectElectricityInvoice(inv);
    invoiceProjectionByBookingId.set(inv.bookingId, {
      outstandingPaise: projected.outstandingPaise,
      effectiveStatus: projected.effectiveStatus,
      paidPaise: inv.paidPaise,
      paidAt: inv.paidAt?.toISOString() ?? null,
    });
  }

  const audit =
    calculationBreakdown && ledger
      ? buildRoomElectricityAuditView({
          breakdown: calculationBreakdown,
          ledger,
          distribution: distribution.map((d) => ({
            invoiceId: d.invoiceId,
            invoiceNumber: d.invoiceNumber,
            bookingId: d.bookingId,
            customerFullName: d.customerFullName,
            bedCode: d.bedCode,
            amountPaise: d.amountPaise,
            status: d.status,
            paidPaise: d.paidPaise,
            paidAt: d.paidAt,
            unitsShare: d.unitsShare,
            activeDays: d.activeDays,
          })),
          financialInvoiceIdByElectricityInvoiceId: financialMap,
          pgName: bill.pgName,
          priorOutstandingByBookingId,
          billGeneratedAt:
            billRow.createdAt instanceof Date && Number.isFinite(billRow.createdAt.getTime())
              ? billRow.createdAt.toISOString()
              : new Date().toISOString(),
          invoiceProjectionByBookingId,
        })
      : null;

  if (!audit) {
    domainWarnings.push({
      code: 'incomplete_artifacts',
      message:
        'Full room electricity audit could not be built. Showing invoice distribution only.',
    });
  }

  const paymentHistory = await loadElectricityPaymentHistoryForBill({
    roomId,
    billingMonth,
    bookingIds,
    financialInvoiceIdByElectricityInvoiceId: financialMap,
  });

  const allElectricityInvoiceIds: Array<{ sourceTable: 'electricity_invoices'; sourceId: string }> =
    [];
  const invoiceHistoryByBookingId = new Map<string, ElectricityInvoiceHistoryRow[]>();
  const paymentHistoryByBookingId = new Map<string, ElectricityPaymentHistoryRow[]>();
  const historyByBooking = new Map<string, ElectricityInvoiceRow[]>();

  for (const bookingId of bookingIds) {
    const historyRes = await listElectricityInvoicesForBooking(bookingId);
    const historyRows = historyRes.ok && historyRes.data ? historyRes.data : [];
    historyByBooking.set(bookingId, historyRows);
    for (const inv of historyRows) {
      allElectricityInvoiceIds.push({
        sourceTable: 'electricity_invoices',
        sourceId: inv.id,
      });
    }
  }

  const extendedFinMap =
    allElectricityInvoiceIds.length > 0
      ? await resolveFinancialInvoiceIdMap(allElectricityInvoiceIds)
      : financialMap;

  const allHistoryIds = allElectricityInvoiceIds.map((x) => x.sourceId);
  const viewMetaRows =
    allHistoryIds.length > 0
      ? await db
          .select({
            id: electricityInvoices.id,
            firstViewedAt: electricityInvoices.firstViewedAt,
            viewedSource: electricityInvoices.viewedSource,
            createdAt: electricityInvoices.createdAt,
          })
          .from(electricityInvoices)
          .where(inArray(electricityInvoices.id, allHistoryIds))
      : [];
  const viewMetaById = new Map(viewMetaRows.map((m) => [m.id, m]));

  for (const bookingId of bookingIds) {
    const historyRows = historyByBooking.get(bookingId) ?? [];
    invoiceHistoryByBookingId.set(
      bookingId,
      historyRows.map((inv) => {
        const meta = viewMetaById.get(inv.id);
        return mapElectricityInvoiceToHistoryRow(
          {
            ...inv,
            firstViewedAt: meta?.firstViewedAt ?? null,
            viewedSource: meta?.viewedSource ?? null,
            createdAt: meta?.createdAt ?? inv.createdAt,
          },
          extendedFinMap.get(`electricity_invoices:${inv.id}`) ?? null,
        );
      }),
    );

    paymentHistoryByBookingId.set(
      bookingId,
      await loadElectricityPaymentHistoryForBooking({
        bookingId,
        financialInvoiceIdByElectricityInvoiceId: extendedFinMap,
      }),
    );
  }

  const operator = audit
    ? buildRoomElectricityOperatorView({
        audit,
        invoiceHistoryByBookingId,
        paymentHistoryByBookingId,
      })
    : null;

  const navigation = await buildNavigation({
    billId,
    roomId,
    pgId: billRow.pgId,
    billingMonth,
  });

  return {
    billId,
    roomId,
    pgId: billRow.pgId,
    pgName: bill.pgName,
    billingMonth,
    audit,
    operator,
    breakdown: calculationBreakdown,
    ledger,
    distribution,
    paymentHistory,
    navigation,
    domainWarnings,
  };
}
