/* eslint-disable no-console */
/**
 * Read-only diagnose Shantinagar cert blockers (Saswat + Syed).
 */
import { readFileSync } from 'node:fs';
import { loadScriptEnv } from '@/src/lib/scripts/loadScriptEnv';

function loadDatabaseUrlFromBackupFiles(): void {
  if (process.env.DATABASE_URL?.trim()) return;
  for (const path of ['.env.prod.live', '.env.production.local', '.env.local', '.env.off', '.env.bak']) {
    try {
      const raw = readFileSync(path, 'utf8');
      const match = raw.match(/^DATABASE_URL=(.+)$/m);
      const value = match?.[1]?.trim().replace(/^["']|["']$/g, '');
      if (value && value.length > 10 && !value.includes('localhost')) {
        process.env.DATABASE_URL = value;
        return;
      }
    } catch {
      // try next
    }
  }
}

loadScriptEnv();
loadDatabaseUrlFromBackupFiles();

const TARGETS = ['APG-2026-0094', 'APG-2026-0090'];

async function main() {
  const { and, eq, ne, desc } = await import('drizzle-orm');
  const { db } = await import('@/src/db/client');
  const { bookings, rentInvoices, electricityInvoices } = await import('@/src/db/schema');
  const { projectInvoice, _internals: rentInvoiceInternals } = await import('@/src/services/rentInvoices');
  const { projectElectricityInvoice } = await import('@/src/services/electricityBilling');
  const { listRentInvoicesForBooking, listElectricityInvoicesForBooking } = await import(
    '@/src/db/queries/customer',
  );
  const { computeBookingFinancialSummaryCore } = await import('@/src/services/residentFinancialEngine');
  const { buildResidentBillRowsFromDetail } = await import('@/src/lib/residents/residentPortalBillRows');
  const { computeResidentTotalDuePaise } = await import('@/src/lib/residents/residentPortalDisplay');
  const { resolveMonthlyRentPaiseForBooking } = await import('@/src/lib/billing/rentPricingSsot');
  const { getBillingProfileForBooking } = await import('@/src/services/residentBillingProfiles');
  const { calendarMonthBillingPeriod, firstMonthRentForCalendarPolicy, firstOfMonth } = await import(
    '@/src/services/billing',
  );
  const { isElectricityAwaitingResidentPayment, buildPaidElectricityBookingMonthKeys } = await import(
    '@/src/lib/billing/electricityCollectibility',
  );

  for (const code of TARGETS) {
    const [b] = await db.select().from(bookings).where(eq(bookings.bookingCode, code)).limit(1);
    if (!b) throw new Error(`Missing ${code}`);

    const billingMonth = firstOfMonth('2026-08-01');
    const stay = await rentInvoiceInternals.loadStayWindow(b.id);
    const profile = await getBillingProfileForBooking(b.id);
    const ssot = await resolveMonthlyRentPaiseForBooking(b.id, billingMonth);

    let expectedInvoiceRent = ssot.rentPaise;
    if (
      stay &&
      (profile?.billingCyclePolicy ?? 'anniversary') === 'calendar_month_1st' &&
      firstOfMonth(stay.start) === billingMonth &&
      stay.start > calendarMonthBillingPeriod(billingMonth).periodStart
    ) {
      expectedInvoiceRent = firstMonthRentForCalendarPolicy(ssot.rentPaise, stay.start).amountPaise;
    }

    const rents = await db
      .select()
      .from(rentInvoices)
      .where(and(eq(rentInvoices.bookingId, b.id), ne(rentInvoices.status, 'cancelled')))
      .orderBy(desc(rentInvoices.billingMonth));

    const elecs = await db
      .select()
      .from(electricityInvoices)
      .where(and(eq(electricityInvoices.bookingId, b.id), ne(electricityInvoices.status, 'cancelled')))
      .orderBy(desc(electricityInvoices.billingMonth));

    const rentList = await listRentInvoicesForBooking(b.id);
    const elecList = await listElectricityInvoicesForBooking(b.id);
    const bills = buildResidentBillRowsFromDetail(
      [{ bookingId: b.id, rent: rentList, electricity: elecList }],
      { paymentProviders: new Map() },
    );
    const portalDue = computeResidentTotalDuePaise(bills.dueBillRows);

    const core = await computeBookingFinancialSummaryCore({
      bookingId: b.id,
      customerId: b.customerId,
      customerName: code,
      customerPhone: '',
      bookingCode: b.bookingCode,
      pgId: b.pgId,
      pgName: 'Shantinagar',
      roomNumber: '0',
      depositPaise: b.depositPaise,
      depositDuePaise: b.depositDuePaise ?? 0,
    });

    const paidElecKeys = buildPaidElectricityBookingMonthKeys(
      elecs
        .filter((e) => e.status === 'paid')
        .map((e) => ({ bookingId: b.id, billingMonth: String(e.billingMonth) })),
    );

    console.log(`\n========== ${code} ==========`);
    console.log({
      bookingId: b.id,
      stay,
      billingPolicy: profile?.billingCyclePolicy,
      billingDay: profile?.billingDay,
      monthlySsotPaise: ssot.rentPaise,
      expectedAugInvoiceRentPaise: expectedInvoiceRent,
      coreRentOut: core.rent.outstandingPaise,
      coreElecOut: core.electricity.outstandingPaise,
      coreTotal: core.rent.outstandingPaise + core.electricity.outstandingPaise + core.deposit.outstandingPaise,
      portalDue,
      portalDueRows: bills.dueBillRows.map((r) => ({
        key: r.key,
        label: r.label,
        amountPaise: r.amountPaise,
        status: r.status,
        invoiceNumber: r.invoiceNumber,
      })),
    });

    console.log('Rent invoices:');
    for (const inv of rents) {
      const p = projectInvoice({
        ...inv,
        cancelledAt: null,
        cancellationReason: null,
        customerId: b.customerId,
        bedId: '',
        pgId: b.pgId,
        paymentId: inv.paymentId ?? null,
        isAdhoc: inv.isAdhoc,
        createdAt: inv.createdAt,
        updatedAt: inv.updatedAt,
      });
      console.log({
        id: inv.id,
        num: inv.invoiceNumber,
        month: inv.billingMonth,
        rentPaise: inv.rentPaise,
        paidPrincipal: inv.paidPrincipalPaise,
        paidLate: inv.paidLateFeePaise,
        status: inv.status,
        outstanding: p.outstandingPaise,
        notes: inv.notes?.slice(0, 100),
      });
    }

    console.log('Electricity invoices:');
    for (const inv of elecs) {
      const p = projectElectricityInvoice(inv);
      const collectible = isElectricityAwaitingResidentPayment(
        {
          id: inv.id,
          status: inv.status,
          paymentProofUrl: inv.paymentProofUrl,
          outstandingPaise: Math.max(0, p.outstandingPaise),
          effectiveStatus: p.effectiveStatus,
          supersededByInvoiceId: inv.supersededByInvoiceId,
          bookingId: b.id,
          billingMonth: String(inv.billingMonth),
        },
        paidElecKeys,
      );
      console.log({
        id: inv.id,
        num: inv.invoiceNumber,
        month: inv.billingMonth,
        amountPaise: inv.amountPaise,
        paidPaise: inv.paidPaise,
        status: inv.status,
        outstanding: p.outstandingPaise,
        collectible,
        paymentProof: Boolean(inv.paymentProofUrl),
      });
    }
  }

  const { closeDb } = await import('@/src/db/client');
  await closeDb();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
