/**
 * Resident Financial Engine — single source of truth for all resident money figures.
 *
 * All UI surfaces (profile, overview, revenue, collections, WhatsApp) must read
 * from this module. Do not duplicate outstanding/required/paid math elsewhere.
 */

import { and, eq, inArray, sql } from 'drizzle-orm';
import { db } from '@/src/db/client';
import {
  bedReservations,
  bookings,
  customers,
  electricityInvoices,
  financialInvoices,
  floors,
  pgs,
  playstationMemberships,
  rentInvoices,
  rooms,
  beds,
} from '@/src/db/schema';
import type { RentInvoice } from '@/src/db/schema/rentInvoices';
import type { ElectricityInvoice } from '@/src/db/schema/electricityInvoices';
import type { AdminSession } from '@/src/lib/auth/session';
import { adminCanAccessPg } from '@/src/lib/auth/roles';
import { formatDate } from '@/src/lib/dates';
import type {
  GlobalFinancialAggregates,
  ResidentDepositCategory,
  ResidentFinancialCategory,
  ResidentFinancialLineItem,
  ResidentFinancialSummary,
  ResidentFinancialTotals,
} from '@/src/lib/billing/residentFinancialTypes';
import { getDepositSummaryForBooking } from '@/src/services/deposits';
import { projectElectricityInvoice } from '@/src/services/electricityBilling';
import { projectInvoice } from '@/src/services/rentInvoices';

const ACTIVE_BOOKING_STATUSES = ['confirmed'] as const;

function emptyCategory(): ResidentFinancialCategory {
  return { requiredPaise: 0, paidPaise: 0, outstandingPaise: 0, items: [] };
}

function sumCategory(c: ResidentFinancialCategory): ResidentFinancialTotals {
  return {
    requiredPaise: c.requiredPaise,
    paidPaise: c.paidPaise,
    outstandingPaise: c.outstandingPaise,
  };
}

function mergeTotals(...parts: ResidentFinancialTotals[]): ResidentFinancialTotals {
  return parts.reduce(
    (acc, p) => ({
      requiredPaise: acc.requiredPaise + p.requiredPaise,
      paidPaise: acc.paidPaise + p.paidPaise,
      outstandingPaise: acc.outstandingPaise + p.outstandingPaise,
    }),
    { requiredPaise: 0, paidPaise: 0, outstandingPaise: 0 },
  );
}

function buildRentCategory(
  invoices: RentInvoice[],
  financialIdByRent: Map<string, string>,
  meta: { pgId: string; pgName: string; roomNumber: string },
): ResidentFinancialCategory {
  const items: ResidentFinancialLineItem[] = [];
  let requiredPaise = 0;
  let paidPaise = 0;
  let outstandingPaise = 0;

  for (const inv of invoices) {
    if (inv.status === 'cancelled') continue;
    const projected = projectInvoice(inv);
    const lateFee =
      inv.status === 'paid'
        ? (inv.lateFeeLockedPaise ?? 0)
        : projected.accruedLateFeePaise;
    const required = inv.rentPaise + lateFee;
    const paid = inv.paidPrincipalPaise + inv.paidLateFeePaise;
    const outstanding = projected.outstandingPaise;

    requiredPaise += required;
    paidPaise += paid;
    outstandingPaise += outstanding;

    if (outstanding > 0 || inv.status === 'pending' || inv.status === 'overdue') {
      const adhocLabel = inv.isAdhoc && inv.notes ? inv.notes.split(' — ')[0] : null;
      items.push({
        id: inv.id,
        kind: 'rent',
        label: adhocLabel ?? `Rent · ${inv.billingMonth.slice(0, 7)}`,
        invoiceNumber: inv.invoiceNumber,
        sourceTable: 'rent_invoices',
        sourceId: inv.id,
        financialInvoiceId: financialIdByRent.get(inv.id) ?? null,
        requiredPaise: required,
        paidPaise: paid,
        outstandingPaise: outstanding,
        dueDate: inv.dueDate,
        generatedAt: inv.createdAt.toISOString(),
        status: projected.effectiveStatus,
        pgId: meta.pgId,
        pgName: meta.pgName,
        roomNumber: meta.roomNumber,
      });
    }
  }

  items.sort((a, b) => (a.dueDate ?? '').localeCompare(b.dueDate ?? ''));
  return { requiredPaise, paidPaise, outstandingPaise, items };
}

function buildElectricityCategory(
  invoices: ElectricityInvoice[],
  financialIdByElec: Map<string, string>,
  meta: { pgId: string; pgName: string; roomNumber: string },
): ResidentFinancialCategory {
  const items: ResidentFinancialLineItem[] = [];
  let requiredPaise = 0;
  let paidPaise = 0;
  let outstandingPaise = 0;

  for (const inv of invoices) {
    if (inv.status === 'cancelled') continue;
    const projected = projectElectricityInvoice(inv);
    const lateFee =
      inv.status === 'paid'
        ? (inv.lateFeeLockedPaise ?? 0)
        : projected.accruedLateFeePaise;
    const required = inv.amountPaise + lateFee;
    const paid = inv.paidPaise;
    const outstanding = Math.max(0, projected.outstandingPaise);

    requiredPaise += required;
    paidPaise += paid;
    outstandingPaise += outstanding;

    if (outstanding > 0 || inv.status === 'pending') {
      items.push({
        id: inv.id,
        kind: 'electricity',
        label: `Electricity · ${inv.billingMonth.slice(0, 7)}`,
        invoiceNumber: inv.invoiceNumber,
        sourceTable: 'electricity_invoices',
        sourceId: inv.id,
        financialInvoiceId: financialIdByElec.get(inv.id) ?? null,
        requiredPaise: required,
        paidPaise: paid,
        outstandingPaise: outstanding,
        dueDate: inv.dueDate,
        generatedAt: inv.createdAt.toISOString(),
        status: projected.effectiveStatus,
        pgId: meta.pgId,
        pgName: meta.pgName,
        roomNumber: meta.roomNumber,
      });
    }
  }

  items.sort((a, b) => (a.dueDate ?? '').localeCompare(b.dueDate ?? ''));
  return { requiredPaise, paidPaise, outstandingPaise, items };
}

async function loadFinancialInvoiceIds(bookingId: string) {
  const rentIds = await db
    .select({ sourceId: financialInvoices.sourceId, id: financialInvoices.id })
    .from(financialInvoices)
    .innerJoin(rentInvoices, eq(rentInvoices.id, financialInvoices.sourceId))
    .where(
      and(
        eq(financialInvoices.sourceTable, 'rent_invoices'),
        eq(rentInvoices.bookingId, bookingId),
      ),
    );

  const elecIds = await db
    .select({ sourceId: financialInvoices.sourceId, id: financialInvoices.id })
    .from(financialInvoices)
    .innerJoin(electricityInvoices, eq(electricityInvoices.id, financialInvoices.sourceId))
    .where(
      and(
        eq(financialInvoices.sourceTable, 'electricity_invoices'),
        eq(electricityInvoices.bookingId, bookingId),
      ),
    );

  return {
    rent: new Map(
      rentIds
        .filter((r): r is { sourceId: string; id: string } => r.sourceId != null)
        .map((r) => [r.sourceId, r.id]),
    ),
    elec: new Map(
      elecIds
        .filter((r): r is { sourceId: string; id: string } => r.sourceId != null)
        .map((r) => [r.sourceId, r.id]),
    ),
  };
}

async function buildDepositCategory(
  bookingId: string,
  depositRequiredPaise: number,
  depositDuePaise: number,
  meta: { pgId: string; pgName: string; roomNumber: string },
): Promise<ResidentDepositCategory> {
  const summary = await getDepositSummaryForBooking(bookingId);
  const hasWalletActivity = (summary?.entries.length ?? 0) > 0;

  // Wallet-only: no ledger rows → zero financial display (ignore booking snapshot).
  if (!hasWalletActivity) {
    return {
      requiredPaise: 0,
      paidPaise: 0,
      outstandingPaise: 0,
      refundablePaise: 0,
      items: [],
    };
  }

  const collected = summary?.collectedPaise ?? 0;
  const requiredPaise = depositRequiredPaise;
  const paidPaise = collected;
  const outstandingPaise = Math.max(0, depositDuePaise);
  const refundablePaise = summary?.refundableBalancePaise ?? 0;

  const items: ResidentFinancialLineItem[] = [];
  if (outstandingPaise > 0) {
    items.push({
      id: `deposit-due-${bookingId}`,
      kind: 'deposit',
      label: 'Deposit remaining',
      requiredPaise: requiredPaise,
      paidPaise,
      outstandingPaise,
      status: 'due',
      pgId: meta.pgId,
      pgName: meta.pgName,
      roomNumber: meta.roomNumber,
    });
  }

  return {
    requiredPaise,
    paidPaise,
    outstandingPaise,
    refundablePaise,
    items,
  };
}

async function buildOtherCategory(
  customerId: string,
  meta: { pgId: string; pgName: string; roomNumber: string },
): Promise<ResidentFinancialCategory> {
  const items: ResidentFinancialLineItem[] = [];
  let requiredPaise = 0;
  let paidPaise = 0;
  let outstandingPaise = 0;

  const pendingMemberships = await db
    .select()
    .from(playstationMemberships)
    .where(
      and(
        eq(playstationMemberships.customerId, customerId),
        eq(playstationMemberships.status, 'pending_payment'),
      ),
    );

  for (const m of pendingMemberships) {
    const amount = m.amountPaise ?? 0;
    if (amount <= 0) continue;
    requiredPaise += amount;
    outstandingPaise += amount;
    items.push({
      id: m.id,
      kind: 'ps4',
      label: `PS4 · ${m.plan}`,
      requiredPaise: amount,
      paidPaise: 0,
      outstandingPaise: amount,
      status: 'pending_payment',
      pgId: meta.pgId,
      pgName: meta.pgName,
    });
  }

  const customInvoices = await db
    .select()
    .from(financialInvoices)
    .where(
      and(
        eq(financialInvoices.customerId, customerId),
        inArray(financialInvoices.invoiceType, ['custom', 'penalty', 'damage', 'ps4']),
        inArray(financialInvoices.status, ['draft', 'sent', 'overdue', 'partial']),
      ),
    );

  for (const fi of customInvoices) {
    const paidAmount = fi.breakdown?.paidPaise ?? (fi.status === 'paid' ? fi.amountPaise : 0);
    const outstanding =
      fi.status === 'paid' || fi.status === 'cancelled' || fi.status === 'refunded'
        ? 0
        : Math.max(0, fi.amountPaise - paidAmount);
    if (outstanding <= 0 && fi.status !== 'partial') continue;
    requiredPaise += fi.amountPaise;
    paidPaise += paidAmount;
    outstandingPaise += outstanding;
    items.push({
      id: fi.id,
      kind: fi.invoiceType === 'ps4' ? 'ps4' : 'custom',
      label: fi.notes ?? fi.invoiceType,
      invoiceNumber: fi.invoiceNumber,
      sourceTable: 'financial_invoices',
      sourceId: fi.id,
      financialInvoiceId: fi.id,
      requiredPaise: fi.amountPaise,
      paidPaise: paidAmount,
      outstandingPaise: outstanding,
      dueDate: fi.dueDate,
      generatedAt: fi.createdAt.toISOString(),
      status: fi.status,
      pgId: fi.pgId,
      pgName: meta.pgName,
      roomNumber: fi.roomNumber,
    });
  }

  return { requiredPaise, paidPaise, outstandingPaise, items };
}

export async function getBookingFinancialSummary(args: {
  bookingId: string;
  customerId: string;
  customerName: string;
  customerPhone: string;
  bookingCode: string;
  pgId: string;
  pgName: string;
  roomNumber: string;
  depositPaise: number;
  depositDuePaise: number;
}): Promise<ResidentFinancialSummary> {
  const [rentRows, elecRows, finIds] = await Promise.all([
    db.select().from(rentInvoices).where(eq(rentInvoices.bookingId, args.bookingId)),
    db
      .select()
      .from(electricityInvoices)
      .where(eq(electricityInvoices.bookingId, args.bookingId)),
    loadFinancialInvoiceIds(args.bookingId),
  ]);

  const meta = { pgId: args.pgId, pgName: args.pgName, roomNumber: args.roomNumber };

  const rent = buildRentCategory(rentRows, finIds.rent, meta);
  const electricity = buildElectricityCategory(elecRows, finIds.elec, meta);
  const deposit = await buildDepositCategory(
    args.bookingId,
    args.depositPaise,
    args.depositDuePaise,
    meta,
  );
  const other = await buildOtherCategory(args.customerId, meta);

  const totals = mergeTotals(
    sumCategory(rent),
    sumCategory(deposit),
    sumCategory(electricity),
    sumCategory(other),
  );

  return {
    customerId: args.customerId,
    bookingId: args.bookingId,
    bookingCode: args.bookingCode,
    customerName: args.customerName,
    customerPhone: args.customerPhone,
    pgId: args.pgId,
    pgName: args.pgName,
    roomNumber: args.roomNumber,
    asOf: new Date().toISOString(),
    rent,
    deposit,
    electricity,
    other,
    totals,
  };
}

export async function getResidentFinancialSummary(
  customerId: string,
): Promise<ResidentFinancialSummary | null> {
  const [row] = await db
    .select({
      customerId: customers.id,
      customerName: customers.fullName,
      customerPhone: customers.phone,
      bookingId: bookings.id,
      bookingCode: bookings.bookingCode,
      depositPaise: bookings.depositPaise,
      depositDuePaise: bookings.depositDuePaise,
      pgId: pgs.id,
      pgName: pgs.name,
      roomNumber: rooms.roomNumber,
    })
    .from(customers)
    .innerJoin(bookings, eq(bookings.customerId, customers.id))
    .innerJoin(bedReservations, eq(bedReservations.bookingId, bookings.id))
    .innerJoin(beds, eq(beds.id, bedReservations.bedId))
    .innerJoin(rooms, eq(rooms.id, beds.roomId))
    .innerJoin(floors, eq(floors.id, rooms.floorId))
    .innerJoin(pgs, eq(pgs.id, floors.pgId))
    .where(
      and(
        eq(customers.id, customerId),
        inArray(bookings.status, [...ACTIVE_BOOKING_STATUSES]),
        eq(bedReservations.kind, 'primary'),
        eq(bedReservations.status, 'active'),
      ),
    )
    .limit(1);

  if (!row?.bookingId) {
    const [customer] = await db
      .select({
        id: customers.id,
        fullName: customers.fullName,
        phone: customers.phone,
      })
      .from(customers)
      .where(eq(customers.id, customerId))
      .limit(1);
    if (!customer) return null;
    return {
      customerId: customer.id,
      bookingId: null,
      bookingCode: null,
      customerName: customer.fullName,
      customerPhone: customer.phone,
      pgId: null,
      pgName: null,
      roomNumber: null,
      asOf: new Date().toISOString(),
      rent: emptyCategory(),
      deposit: { ...emptyCategory(), refundablePaise: 0 },
      electricity: emptyCategory(),
      other: emptyCategory(),
      totals: { requiredPaise: 0, paidPaise: 0, outstandingPaise: 0 },
    };
  }

  return getBookingFinancialSummary({
    bookingId: row.bookingId,
    customerId: row.customerId,
    customerName: row.customerName,
    customerPhone: row.customerPhone,
    bookingCode: row.bookingCode,
    pgId: row.pgId,
    pgName: row.pgName,
    roomNumber: row.roomNumber,
    depositPaise: row.depositPaise,
    depositDuePaise: row.depositDuePaise ?? 0,
  });
}

/** TEMP: set DEBUG_RENT_OUTSTANDING_TRACE=1 to log every rent invoice in portfolio aggregates. */
function traceRentOutstandingForDebug(
  rows: Array<{
    booking_id: string;
    customer_id: string;
    customer_name: string;
    booking_code: string;
    pg_name: string;
    room_number: string;
    pg_id: string;
  }>,
  session?: AdminSession,
): void {
  if (process.env.DEBUG_RENT_OUTSTANDING_TRACE !== '1') return;

  void (async () => {
    console.log('\n=== DEBUG_RENT_OUTSTANDING_TRACE (Admin Overview SSOT path) ===\n');
    let grandOutstanding = 0;
    const invoiceRows: Array<Record<string, unknown>> = [];

    for (const row of rows) {
      if (session && !adminCanAccessPg({ role: session.role, pgScope: session.pgScope }, row.pg_id)) {
        continue;
      }
      const rentInvs = await db
        .select()
        .from(rentInvoices)
        .where(eq(rentInvoices.bookingId, row.booking_id));

      for (const inv of rentInvs) {
        if (inv.status === 'cancelled' || inv.status === 'paid') continue;
        const projected = projectInvoice(inv);
        if (projected.outstandingPaise <= 0) continue;

        grandOutstanding += projected.outstandingPaise;
        invoiceRows.push({
          invoiceId: inv.id,
          invoiceNumber: inv.invoiceNumber,
          residentName: row.customer_name,
          residentId: row.customer_id,
          bookingId: row.booking_id,
          bookingCode: row.booking_code,
          pgName: row.pg_name,
          roomNumber: row.room_number,
          billingMonth: inv.billingMonth,
          dueDate: inv.dueDate,
          invoiceAmountPaise: inv.rentPaise,
          amountPaidPaise: inv.paidPrincipalPaise + inv.paidLateFeePaise,
          outstandingPaise: projected.outstandingPaise,
          storedStatus: inv.status,
          effectiveStatus: projected.effectiveStatus,
          notes: inv.notes,
          isAdhoc: inv.isAdhoc,
        });
      }
    }

    console.log(`Rent invoices with outstanding > 0: ${invoiceRows.length}`);
    console.log(`Sum outstanding (rent only): ${grandOutstanding} paise (₹${grandOutstanding / 100})`);
    for (const r of invoiceRows) {
      console.log(JSON.stringify(r, null, 2));
    }
    console.log('\n=== end DEBUG_RENT_OUTSTANDING_TRACE ===\n');
  })();
}

/** Global aggregates — used by Overview, Revenue, Collections dashboards. */
export async function getGlobalFinancialAggregates(
  session?: AdminSession,
): Promise<GlobalFinancialAggregates> {
  const rows = await db.execute<{
    booking_id: string;
    customer_id: string;
    customer_name: string;
    customer_phone: string;
    booking_code: string;
    deposit_paise: number;
    deposit_due_paise: number;
    pg_id: string;
    pg_name: string;
    room_number: string;
  }>(sql`
    SELECT DISTINCT ON (b.id)
      b.id AS booking_id,
      c.id AS customer_id,
      c.full_name AS customer_name,
      c.phone AS customer_phone,
      b.booking_code,
      b.deposit_paise,
      coalesce(b.deposit_due_paise, 0) AS deposit_due_paise,
      p.id AS pg_id,
      p.name AS pg_name,
      r.room_number
    FROM bookings b
    INNER JOIN customers c ON c.id = b.customer_id
    INNER JOIN bed_reservations br ON br.booking_id = b.id
      AND br.kind = 'primary'
      AND br.status = 'active'
    INNER JOIN beds bd ON bd.id = br.bed_id
    INNER JOIN rooms r ON r.id = bd.room_id
    INNER JOIN floors f ON f.id = r.floor_id
    INNER JOIN pgs p ON p.id = f.pg_id
    WHERE b.status = 'confirmed'
      AND b.duration_mode IN ('monthly', 'open_ended')
      AND b.is_test = false
      AND c.is_test = false
      AND c.residency_status = 'active'
    ORDER BY b.id, br.created_at DESC
  `);

  const bookingRows = Array.from(rows);
  traceRentOutstandingForDebug(
    bookingRows.map((row) => ({
      booking_id: row.booking_id,
      customer_id: row.customer_id,
      customer_name: row.customer_name,
      booking_code: row.booking_code,
      pg_name: row.pg_name,
      room_number: row.room_number,
      pg_id: row.pg_id,
    })),
    session,
  );

  const empty: ResidentFinancialTotals = {
    requiredPaise: 0,
    paidPaise: 0,
    outstandingPaise: 0,
  };
  let rent = { ...empty };
  let deposit = { ...empty };
  let electricity = { ...empty };
  let other = { ...empty };
  let pendingRentInvoiceCount = 0;
  let pendingElectricityInvoiceCount = 0;

  for (const row of Array.from(rows)) {
    if (session && !adminCanAccessPg({ role: session.role, pgScope: session.pgScope }, row.pg_id)) {
      continue;
    }
    const summary = await getBookingFinancialSummary({
      bookingId: row.booking_id,
      customerId: row.customer_id,
      customerName: row.customer_name,
      customerPhone: row.customer_phone,
      bookingCode: row.booking_code,
      pgId: row.pg_id,
      pgName: row.pg_name,
      roomNumber: row.room_number,
      depositPaise: Number(row.deposit_paise),
      depositDuePaise: Number(row.deposit_due_paise),
    });

    rent = mergeTotals(rent, sumCategory(summary.rent));
    deposit = mergeTotals(deposit, sumCategory(summary.deposit));
    electricity = mergeTotals(electricity, sumCategory(summary.electricity));
    other = mergeTotals(other, sumCategory(summary.other));
    pendingRentInvoiceCount += summary.rent.items.length;
    pendingElectricityInvoiceCount += summary.electricity.items.length;
  }

  return {
    asOf: formatDate(new Date()),
    rent,
    deposit,
    electricity,
    other,
    totals: mergeTotals(rent, deposit, electricity, other),
    pendingRentInvoiceCount,
    pendingElectricityInvoiceCount,
  };
}

/** Portfolio-wide totals for Overview / Revenue (SSOT). */
export async function getPortfolioFinancialTotals(session?: AdminSession) {
  return getGlobalFinancialAggregates(session);
}

/** Rent-only aggregate for legacy getRentStats() consumers. */
export async function getPortfolioRentStats(): Promise<{
  pendingCount: number;
  overdueCount: number;
  paidCount: number;
  cancelledCount: number;
  totalRentPaise: number;
  collectedPaise: number;
  outstandingPaise: number;
}> {
  const aggregates = await getGlobalFinancialAggregates();
  const [counts] = await db
    .select({
      pendingCount: sql<number>`count(*) FILTER (WHERE ${rentInvoices.status} = 'pending')::int`,
      overdueCount: sql<number>`count(*) FILTER (WHERE ${rentInvoices.status} = 'overdue')::int`,
      paidCount: sql<number>`count(*) FILTER (WHERE ${rentInvoices.status} = 'paid')::int`,
      cancelledCount: sql<number>`count(*) FILTER (WHERE ${rentInvoices.status} = 'cancelled')::int`,
    })
    .from(rentInvoices)
    .innerJoin(bookings, eq(bookings.id, rentInvoices.bookingId))
    .innerJoin(customers, eq(customers.id, rentInvoices.customerId))
    .where(
      and(
        eq(bookings.status, 'confirmed'),
        eq(bookings.isTest, false),
        eq(customers.isTest, false),
        eq(customers.residencyStatus, 'active'),
      ),
    );

  return {
    pendingCount: Number(counts?.pendingCount ?? 0),
    overdueCount: Number(counts?.overdueCount ?? 0),
    paidCount: Number(counts?.paidCount ?? 0),
    cancelledCount: Number(counts?.cancelledCount ?? 0),
    totalRentPaise: aggregates.rent.requiredPaise,
    collectedPaise: aggregates.rent.paidPaise,
    outstandingPaise: aggregates.rent.outstandingPaise,
  };
}

/** Recalculate pending rent invoices after vacating is cancelled / stay restored. */
export async function recalculateBillingAfterVacatingRestore(args: {
  bookingId: string;
  adminId?: string | null;
}): Promise<{ updatedCount: number }> {
  const [booking] = await db
    .select({ pricingSnapshot: bookings.pricingSnapshot })
    .from(bookings)
    .where(eq(bookings.id, args.bookingId))
    .limit(1);
  if (!booking?.pricingSnapshot) return { updatedCount: 0 };

  const { recalculatePendingRentInvoicesForBooking } = await import(
    '@/src/services/rentInvoices'
  );
  const result = await recalculatePendingRentInvoicesForBooking({
    bookingId: args.bookingId,
    pricingSnapshot: booking.pricingSnapshot,
    adminId: args.adminId ?? 'system',
  });
  return { updatedCount: result.updatedCount };
}

export type EngineOutstandingDepositRow = {
  bookingId: string;
  bookingCode: string;
  customerId: string;
  customerFullName: string;
  customerPhone: string;
  pgId: string;
  pgName: string;
  roomNumber: string;
  bedCode: string;
  depositPaise: number;
  collectedPaise: number;
  depositDuePaise: number;
  depositDueDate: string | null;
  depositCollectionStatus: string;
};

/** Deposit outstanding rows — SSOT via getBookingFinancialSummary().deposit */
export async function listOutstandingDepositsFromEngine(
  session?: AdminSession,
  filter?: { overdueOnly?: boolean; dueWithinDays?: number },
): Promise<EngineOutstandingDepositRow[]> {
  const today = formatDate(new Date());
  const rows = await db.execute<{
    booking_id: string;
    booking_code: string;
    customer_id: string;
    customer_name: string;
    customer_phone: string;
    deposit_paise: number;
    deposit_due_paise: number;
    deposit_due_date: string | null;
    deposit_collection_status: string;
    pg_id: string;
    pg_name: string;
    room_number: string;
    bed_code: string;
  }>(sql`
    SELECT DISTINCT ON (b.id)
      b.id AS booking_id,
      b.booking_code,
      c.id AS customer_id,
      c.full_name AS customer_name,
      c.phone AS customer_phone,
      b.deposit_paise,
      coalesce(b.deposit_due_paise, 0) AS deposit_due_paise,
      b.deposit_due_date::text AS deposit_due_date,
      b.deposit_collection_status,
      p.id AS pg_id,
      p.name AS pg_name,
      r.room_number,
      bd.bed_code
    FROM bookings b
    INNER JOIN customers c ON c.id = b.customer_id
    INNER JOIN bed_reservations br ON br.booking_id = b.id
      AND br.kind = 'primary'
      AND br.status = 'active'
    INNER JOIN beds bd ON bd.id = br.bed_id
    INNER JOIN rooms r ON r.id = bd.room_id
    INNER JOIN floors f ON f.id = r.floor_id
    INNER JOIN pgs p ON p.id = f.pg_id
    WHERE b.status = 'confirmed'
      AND b.duration_mode IN ('monthly', 'open_ended')
      AND b.is_test = false
      AND c.is_test = false
      AND c.residency_status = 'active'
    ORDER BY b.id, br.created_at DESC
  `);

  const result: EngineOutstandingDepositRow[] = [];
  for (const row of Array.from(rows)) {
    if (session && !adminCanAccessPg({ role: session.role, pgScope: session.pgScope }, row.pg_id)) {
      continue;
    }
    const summary = await getBookingFinancialSummary({
      bookingId: row.booking_id,
      customerId: row.customer_id,
      customerName: row.customer_name,
      customerPhone: row.customer_phone,
      bookingCode: row.booking_code,
      pgId: row.pg_id,
      pgName: row.pg_name,
      roomNumber: row.room_number,
      depositPaise: Number(row.deposit_paise),
      depositDuePaise: Number(row.deposit_due_paise),
    });
    if (summary.deposit.outstandingPaise <= 0) continue;

    result.push({
      bookingId: row.booking_id,
      bookingCode: row.booking_code,
      customerId: row.customer_id,
      customerFullName: row.customer_name,
      customerPhone: row.customer_phone,
      pgId: row.pg_id,
      pgName: row.pg_name,
      roomNumber: row.room_number,
      bedCode: row.bed_code,
      depositPaise: summary.deposit.requiredPaise,
      collectedPaise: summary.deposit.paidPaise,
      depositDuePaise: summary.deposit.outstandingPaise,
      depositDueDate: row.deposit_due_date,
      depositCollectionStatus: row.deposit_collection_status,
    });
  }

  let filtered = result;
  if (filter?.overdueOnly) {
    filtered = filtered.filter(
      (r) =>
        r.depositCollectionStatus === 'overdue' ||
        (r.depositDueDate != null && r.depositDueDate < today),
    );
  }
  if (filter?.dueWithinDays != null) {
    const limit = new Date();
    limit.setDate(limit.getDate() + filter.dueWithinDays);
    const limitStr = formatDate(limit);
    filtered = filtered.filter(
      (r) =>
        r.depositDueDate != null &&
        r.depositDueDate >= today &&
        r.depositDueDate <= limitStr,
    );
  }
  return filtered;
}
