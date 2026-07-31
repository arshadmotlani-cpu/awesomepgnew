/**
 * Electricity payment history for audit — traceable rows from ledger, invoices, contributions.
 */
import { and, eq, inArray, lt, ne, or } from 'drizzle-orm';
import { db } from '@/src/db/client';
import {
  customers,
  electricityInvoices,
  electricityRoomContributions,
  electricitySettlementLedger,
  payments,
  roomElectricityLedgerCycles,
  roomElectricityLedgerEntries,
} from '@/src/db/schema';
import { isProductionElectricityBillFilter } from '@/src/lib/billing/electricityProductionFilter';
import { formatDate } from '@/src/lib/format';
import { firstOfMonth } from '@/src/services/billing';
import { loadRoomElectricityContributionsForMonth } from '@/src/services/electricityRoomContributions';

export type ElectricityPaymentHistoryRow = {
  id: string;
  customerId: string;
  customerName: string;
  bookingId: string;
  date: string;
  amountPaise: number;
  invoiceNumber: string | null;
  electricityInvoiceId: string | null;
  financialInvoiceId: string | null;
  collectedBy: string;
  paymentMode: string;
  source: string;
  outstandingAfterPaise: number | null;
  billingMonth: string;
};

function paymentModeLabel(source: string, provider?: string | null): string {
  if (provider) return provider.replace(/_/g, ' ');
  switch (source) {
    case 'cash':
      return 'Cash';
    case 'upi':
      return 'UPI';
    case 'checkout_settlement':
      return 'Checkout';
    case 'monthly_invoice':
      return 'Monthly invoice';
    case 'historical':
      return 'Historical offline';
    case 'checkout_recovery':
      return 'Checkout recovery';
    case 'manual':
      return 'Manual';
    default:
      return source;
  }
}

export async function loadElectricityPaymentHistoryForBill(input: {
  roomId: string;
  billingMonth: string;
  bookingIds: string[];
  financialInvoiceIdByElectricityInvoiceId?: Map<string, string>;
}): Promise<ElectricityPaymentHistoryRow[]> {
  const month = firstOfMonth(input.billingMonth);
  const finMap = input.financialInvoiceIdByElectricityInvoiceId ?? new Map<string, string>();
  const rows: ElectricityPaymentHistoryRow[] = [];

  if (input.bookingIds.length === 0) return rows;

  const contributions = await loadRoomElectricityContributionsForMonth(input.roomId, month);
  for (const c of contributions.contributions) {
    rows.push({
      id: `contrib-${c.id}`,
      customerId: c.customerId,
      customerName: c.customerName,
      bookingId: c.bookingId,
      date: c.contributionDate,
      amountPaise: c.amountPaise,
      invoiceNumber: null,
      electricityInvoiceId: null,
      financialInvoiceId: null,
      collectedBy: c.createdByAdminId ? 'Admin' : 'System',
      paymentMode: paymentModeLabel(c.kind),
      source: c.kind,
      outstandingAfterPaise: null,
      billingMonth: formatDate(month),
    });
  }

  const settlementRows = await db
    .select({
      id: electricitySettlementLedger.id,
      customerId: electricitySettlementLedger.customerId,
      customerName: customers.fullName,
      bookingId: electricitySettlementLedger.bookingId,
      amountPaise: electricitySettlementLedger.amountPaise,
      createdAt: electricitySettlementLedger.createdAt,
    })
    .from(electricitySettlementLedger)
    .innerJoin(customers, eq(customers.id, electricitySettlementLedger.customerId))
    .where(
      and(
        eq(electricitySettlementLedger.roomId, input.roomId),
        eq(electricitySettlementLedger.billingMonth, month),
        inArray(electricitySettlementLedger.bookingId, input.bookingIds),
      ),
    );

  for (const s of settlementRows) {
    rows.push({
      id: `settlement-${s.id}`,
      customerId: s.customerId,
      customerName: s.customerName,
      bookingId: s.bookingId,
      date: s.createdAt.toISOString().slice(0, 10),
      amountPaise: s.amountPaise,
      invoiceNumber: null,
      electricityInvoiceId: null,
      financialInvoiceId: null,
      collectedBy: 'Checkout settlement',
      paymentMode: 'Checkout',
      source: 'checkout_settlement',
      outstandingAfterPaise: null,
      billingMonth: formatDate(month),
    });
  }

  const [cycle] = await db
    .select({ id: roomElectricityLedgerCycles.id })
    .from(roomElectricityLedgerCycles)
    .where(
      and(
        eq(roomElectricityLedgerCycles.roomId, input.roomId),
        eq(roomElectricityLedgerCycles.billingMonth, month),
      ),
    )
    .limit(1);

  if (cycle) {
    const ledgerRows = await db
      .select({
        id: roomElectricityLedgerEntries.id,
        customerId: roomElectricityLedgerEntries.customerId,
        customerName: customers.fullName,
        bookingId: roomElectricityLedgerEntries.bookingId,
        amountPaise: roomElectricityLedgerEntries.amountPaise,
        source: roomElectricityLedgerEntries.source,
        note: roomElectricityLedgerEntries.note,
        collectedAt: roomElectricityLedgerEntries.collectedAt,
        electricityInvoiceId: roomElectricityLedgerEntries.electricityInvoiceId,
      })
      .from(roomElectricityLedgerEntries)
      .innerJoin(customers, eq(customers.id, roomElectricityLedgerEntries.customerId))
      .where(
        and(
          eq(roomElectricityLedgerEntries.cycleId, cycle.id),
          inArray(roomElectricityLedgerEntries.bookingId, input.bookingIds),
        ),
      );

    for (const l of ledgerRows) {
      if (contributions.contributions.some((c) => c.id === l.id)) continue;
      rows.push({
        id: `ledger-${l.id}`,
        customerId: l.customerId,
        customerName: l.customerName,
        bookingId: l.bookingId,
        date: l.collectedAt.toISOString().slice(0, 10),
        amountPaise: l.amountPaise,
        invoiceNumber: null,
        electricityInvoiceId: l.electricityInvoiceId,
        financialInvoiceId: l.electricityInvoiceId
          ? (finMap.get(`electricity_invoices:${l.electricityInvoiceId}`) ?? null)
          : null,
        collectedBy: l.note ? 'Admin' : 'System',
        paymentMode: paymentModeLabel(l.source),
        source: l.source,
        outstandingAfterPaise: null,
        billingMonth: formatDate(month),
      });
    }
  }

  const invoiceRows = await db
    .select({
      id: electricityInvoices.id,
      invoiceNumber: electricityInvoices.invoiceNumber,
      customerId: electricityInvoices.customerId,
      customerName: customers.fullName,
      bookingId: electricityInvoices.bookingId,
      billingMonth: electricityInvoices.billingMonth,
      amountPaise: electricityInvoices.amountPaise,
      paidPaise: electricityInvoices.paidPaise,
      paidAt: electricityInvoices.paidAt,
      paymentId: electricityInvoices.paymentId,
      provider: payments.provider,
    })
    .from(electricityInvoices)
    .innerJoin(customers, eq(customers.id, electricityInvoices.customerId))
    .leftJoin(payments, eq(payments.id, electricityInvoices.paymentId))
    .where(
      and(
        inArray(electricityInvoices.bookingId, input.bookingIds),
        isProductionElectricityBillFilter(),
        ne(electricityInvoices.status, 'cancelled'),
        or(
          eq(electricityInvoices.roomId, input.roomId),
          lt(electricityInvoices.billingMonth, month),
        ),
      ),
    );

  for (const inv of invoiceRows) {
    if (inv.paidPaise <= 0 && !inv.paidAt) continue;
    const paidDate = inv.paidAt?.toISOString().slice(0, 10) ?? formatDate(month);
    rows.push({
      id: `invoice-pay-${inv.id}`,
      customerId: inv.customerId,
      customerName: inv.customerName,
      bookingId: inv.bookingId,
      date: paidDate,
      amountPaise: inv.paidPaise,
      invoiceNumber: inv.invoiceNumber,
      electricityInvoiceId: inv.id,
      financialInvoiceId: finMap.get(`electricity_invoices:${inv.id}`) ?? null,
      collectedBy: inv.provider ? 'Payment gateway' : 'Admin',
      paymentMode: paymentModeLabel('monthly_invoice', inv.provider),
      source: 'monthly_invoice',
      outstandingAfterPaise: Math.max(0, inv.amountPaise - inv.paidPaise),
      billingMonth: inv.billingMonth,
    });
  }

  rows.sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));

  const runningByBooking = new Map<string, number>();
  for (const row of rows) {
    if (row.outstandingAfterPaise != null) continue;
    const key = row.bookingId;
    const prev = runningByBooking.get(key) ?? 0;
    runningByBooking.set(key, prev + row.amountPaise);
  }

  return rows;
}

export async function loadElectricityPaymentHistoryForBooking(input: {
  bookingId: string;
  financialInvoiceIdByElectricityInvoiceId?: Map<string, string>;
}): Promise<ElectricityPaymentHistoryRow[]> {
  const finMap = input.financialInvoiceIdByElectricityInvoiceId ?? new Map<string, string>();
  const rows: ElectricityPaymentHistoryRow[] = [];

  const contributionRows = await db
    .select({
      id: electricityRoomContributions.id,
      customerId: electricityRoomContributions.customerId,
      customerName: customers.fullName,
      bookingId: electricityRoomContributions.bookingId,
      amountPaise: electricityRoomContributions.amountPaise,
      kind: electricityRoomContributions.kind,
      contributionDate: electricityRoomContributions.contributionDate,
      billingMonth: electricityRoomContributions.billingMonth,
      createdByAdminId: electricityRoomContributions.createdByAdminId,
    })
    .from(electricityRoomContributions)
    .innerJoin(customers, eq(customers.id, electricityRoomContributions.customerId))
    .where(eq(electricityRoomContributions.bookingId, input.bookingId));

  for (const c of contributionRows) {
    rows.push({
      id: `contrib-${c.id}`,
      customerId: c.customerId,
      customerName: c.customerName,
      bookingId: c.bookingId,
      date: c.contributionDate,
      amountPaise: c.amountPaise,
      invoiceNumber: null,
      electricityInvoiceId: null,
      financialInvoiceId: null,
      collectedBy: c.createdByAdminId ? 'Admin' : 'System',
      paymentMode: paymentModeLabel(c.kind),
      source: c.kind,
      outstandingAfterPaise: null,
      billingMonth: formatDate(c.billingMonth),
    });
  }

  const settlementRows = await db
    .select({
      id: electricitySettlementLedger.id,
      customerId: electricitySettlementLedger.customerId,
      customerName: customers.fullName,
      bookingId: electricitySettlementLedger.bookingId,
      amountPaise: electricitySettlementLedger.amountPaise,
      billingMonth: electricitySettlementLedger.billingMonth,
      createdAt: electricitySettlementLedger.createdAt,
    })
    .from(electricitySettlementLedger)
    .innerJoin(customers, eq(customers.id, electricitySettlementLedger.customerId))
    .where(eq(electricitySettlementLedger.bookingId, input.bookingId));

  for (const s of settlementRows) {
    rows.push({
      id: `settlement-${s.id}`,
      customerId: s.customerId,
      customerName: s.customerName,
      bookingId: s.bookingId,
      date: s.createdAt.toISOString().slice(0, 10),
      amountPaise: s.amountPaise,
      invoiceNumber: null,
      electricityInvoiceId: null,
      financialInvoiceId: null,
      collectedBy: 'Checkout settlement',
      paymentMode: 'Checkout',
      source: 'checkout_settlement',
      outstandingAfterPaise: null,
      billingMonth: formatDate(s.billingMonth),
    });
  }

  const ledgerRows = await db
    .select({
      id: roomElectricityLedgerEntries.id,
      customerId: roomElectricityLedgerEntries.customerId,
      customerName: customers.fullName,
      bookingId: roomElectricityLedgerEntries.bookingId,
      amountPaise: roomElectricityLedgerEntries.amountPaise,
      source: roomElectricityLedgerEntries.source,
      note: roomElectricityLedgerEntries.note,
      collectedAt: roomElectricityLedgerEntries.collectedAt,
      electricityInvoiceId: roomElectricityLedgerEntries.electricityInvoiceId,
      billingMonth: roomElectricityLedgerCycles.billingMonth,
    })
    .from(roomElectricityLedgerEntries)
    .innerJoin(customers, eq(customers.id, roomElectricityLedgerEntries.customerId))
    .innerJoin(
      roomElectricityLedgerCycles,
      eq(roomElectricityLedgerCycles.id, roomElectricityLedgerEntries.cycleId),
    )
    .where(eq(roomElectricityLedgerEntries.bookingId, input.bookingId));

  for (const l of ledgerRows) {
    rows.push({
      id: `ledger-${l.id}`,
      customerId: l.customerId,
      customerName: l.customerName,
      bookingId: l.bookingId,
      date: l.collectedAt.toISOString().slice(0, 10),
      amountPaise: l.amountPaise,
      invoiceNumber: null,
      electricityInvoiceId: l.electricityInvoiceId,
      financialInvoiceId: l.electricityInvoiceId
        ? (finMap.get(`electricity_invoices:${l.electricityInvoiceId}`) ?? null)
        : null,
      collectedBy: l.note ? 'Admin' : 'System',
      paymentMode: paymentModeLabel(l.source),
      source: l.source,
      outstandingAfterPaise: null,
      billingMonth: formatDate(l.billingMonth),
    });
  }

  const invoiceRows = await db
    .select({
      id: electricityInvoices.id,
      invoiceNumber: electricityInvoices.invoiceNumber,
      customerId: electricityInvoices.customerId,
      customerName: customers.fullName,
      bookingId: electricityInvoices.bookingId,
      billingMonth: electricityInvoices.billingMonth,
      amountPaise: electricityInvoices.amountPaise,
      paidPaise: electricityInvoices.paidPaise,
      paidAt: electricityInvoices.paidAt,
      paymentId: electricityInvoices.paymentId,
      provider: payments.provider,
    })
    .from(electricityInvoices)
    .innerJoin(customers, eq(customers.id, electricityInvoices.customerId))
    .leftJoin(payments, eq(payments.id, electricityInvoices.paymentId))
    .where(
      and(
        eq(electricityInvoices.bookingId, input.bookingId),
        isProductionElectricityBillFilter(),
        ne(electricityInvoices.status, 'cancelled'),
      ),
    );

  for (const inv of invoiceRows) {
    if (inv.paidPaise <= 0 && !inv.paidAt) continue;
    const paidDate = inv.paidAt?.toISOString().slice(0, 10) ?? formatDate(inv.billingMonth);
    rows.push({
      id: `invoice-pay-${inv.id}`,
      customerId: inv.customerId,
      customerName: inv.customerName,
      bookingId: inv.bookingId,
      date: paidDate,
      amountPaise: inv.paidPaise,
      invoiceNumber: inv.invoiceNumber,
      electricityInvoiceId: inv.id,
      financialInvoiceId: finMap.get(`electricity_invoices:${inv.id}`) ?? null,
      collectedBy: inv.provider ? 'Payment gateway' : 'Admin',
      paymentMode: paymentModeLabel('monthly_invoice', inv.provider),
      source: 'monthly_invoice',
      outstandingAfterPaise: Math.max(0, inv.amountPaise - inv.paidPaise),
      billingMonth: inv.billingMonth,
    });
  }

  rows.sort((a, b) => b.billingMonth.localeCompare(a.billingMonth) || a.date.localeCompare(b.date));
  return rows;
}
