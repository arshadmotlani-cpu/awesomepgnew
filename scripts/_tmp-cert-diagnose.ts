/* eslint-disable no-console */
import { loadScriptEnv } from '@/src/lib/scripts/loadScriptEnv';
loadScriptEnv();
import { eq } from 'drizzle-orm';
import { db } from '@/src/db/client';
import { bookings } from '@/src/db/schema';
import { getBookingFinancialAccount, computeBookingFinancialSummaryCore } from '@/src/services/residentFinancialEngine';
import { buildBookingContextSnapshot } from '@/src/roomOs/engines/occupancy/resolveBookingContext';
import { projectInvoice } from '@/src/services/rentInvoices';
import { listRentInvoicesForBooking } from '@/src/db/queries/customer';
import { firstOfMonth } from '@/src/services/billing';
import { resolveMonthlyRentPaiseForBooking } from '@/src/lib/billing/rentPricingSsot';

const codes = ['APG-2026-0040', 'APG-2026-0099', 'APG-2026-0096', 'APG-2026-0090'];

async function main() {
  const billingMonth = firstOfMonth(new Date().toISOString().slice(0, 10));
  for (const code of codes) {
    const [b] = await db.select().from(bookings).where(eq(bookings.bookingCode, code)).limit(1);
    if (!b) continue;
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
    const ctx = await buildBookingContextSnapshot({ bookingId: b.id });
    const acct = await getBookingFinancialAccount({
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
    const rentList = await listRentInvoicesForBooking(b.id);
    let invOut = 0;
    if (rentList.ok) {
      for (const row of rentList.data) {
        if (row.status === 'cancelled') continue;
        invOut += projectInvoice({
          ...row,
          cancelledAt: null,
          cancellationReason: null,
          customerId: b.customerId,
          bedId: '',
          pgId: b.pgId,
          paymentId: row.paymentId ?? null,
          isAdhoc: false,
          createdAt: new Date(),
          updatedAt: new Date(),
        }).outstandingPaise;
      }
    }
    const ssot = await resolveMonthlyRentPaiseForBooking(b.id, billingMonth);
    console.log('\n===', code, '===');
    console.log({
      coreRentOut: core.rent.outstandingPaise,
      ledgerRentOut: ctx?.ledger?.rent.outstandingPaise,
      acctRentOut: acct.rent.outstandingPaise,
      invSumOut: invOut,
      ssot: ssot.rentPaise,
      latestInvoices: rentList.ok
        ? rentList.data
            .filter((r) => r.status !== 'cancelled')
            .slice(0, 3)
            .map((r) => ({ num: r.invoiceNumber, month: r.billingMonth, rent: r.rentPaise, out: projectInvoice({ ...r, cancelledAt: null, cancellationReason: null, customerId: b.customerId, bedId: '', pgId: b.pgId, paymentId: r.paymentId ?? null, isAdhoc: false, createdAt: new Date(), updatedAt: new Date() }).outstandingPaise }))
        : [],
    });
  }
  const { closeDb } = await import('@/src/db/client');
  await closeDb();
}

main();
