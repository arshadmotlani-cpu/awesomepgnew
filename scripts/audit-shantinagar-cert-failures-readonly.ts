/* eslint-disable no-console */
import dotenv from 'dotenv';
dotenv.config({ path: '.env.prod.live' });
dotenv.config({ path: '.env.production.local' });

import { and, desc, eq, ne, sql } from 'drizzle-orm';
import { closeDb, db } from '@/src/db/client';
import { bookings, customers, electricityInvoices, rentInvoices } from '@/src/db/schema';
import { resolveMonthlyRentPaiseForBooking } from '@/src/lib/billing/rentPricingSsot';
import { calendarMonthBillingPeriod, firstMonthRentForCalendarPolicy, firstOfMonth } from '@/src/services/billing';
import { getBillingProfileForBooking } from '@/src/services/residentBillingProfiles';
import { projectElectricityInvoice } from '@/src/services/electricityBilling';
import { getBookingFinancialAccount } from '@/src/services/residentFinancialEngine';
import { _internals, projectInvoice } from '@/src/services/rentInvoices';

const { loadStayWindow } = _internals;

const CODES = ['APG-2026-0040', 'APG-2026-0099', 'APG-2026-0096', 'APG-2026-0090'];
const PG_ID = '64ead929-b7a0-43a6-8ac4-cafdd398ecde';

async function main() {
  const billingMonth = firstOfMonth(new Date().toISOString().slice(0, 10));

  for (const code of CODES) {
    const [b] = await db.select().from(bookings).where(eq(bookings.bookingCode, code)).limit(1);
    if (!b) {
      console.log('MISSING', code);
      continue;
    }
    const [c] = await db.select().from(customers).where(eq(customers.id, b.customerId)).limit(1);
    const { rentPaise: ssot } = await resolveMonthlyRentPaiseForBooking(b.id, billingMonth);
    const stay = await loadStayWindow(b.id);
    const profile = await getBillingProfileForBooking(b.id);
    let expectedInvoice = ssot;
    const policy = profile?.billingCyclePolicy ?? 'anniversary';
    if (
      stay &&
      policy === 'calendar_month_1st' &&
      firstOfMonth(stay.start) === billingMonth &&
      stay.start > calendarMonthBillingPeriod(billingMonth).periodStart
    ) {
      expectedInvoice = firstMonthRentForCalendarPolicy(ssot, stay.start).amountPaise;
    }

    const acct = await getBookingFinancialAccount({
      bookingId: b.id,
      customerId: b.customerId,
      customerName: c?.fullName ?? '',
      customerPhone: c?.phone ?? '',
      bookingCode: code,
      pgId: PG_ID,
      pgName: 'Shantinagar',
      roomNumber: '?',
      depositPaise: b.depositPaise,
      depositDuePaise: b.depositDuePaise,
    });

    const rents = await db
      .select()
      .from(rentInvoices)
      .where(and(eq(rentInvoices.bookingId, b.id), ne(rentInvoices.status, 'cancelled')))
      .orderBy(desc(rentInvoices.billingMonth));
    let invRentOut = 0;
    for (const r of rents) invRentOut += projectInvoice(r).outstandingPaise;

    const elecs = await db
      .select()
      .from(electricityInvoices)
      .where(and(eq(electricityInvoices.bookingId, b.id), ne(electricityInvoices.status, 'cancelled')));

    let invElecOut = 0;
    for (const e of elecs) {
      const p = projectElectricityInvoice(e);
      if (e.status === 'pending' || e.status === 'overdue') {
        invElecOut += Math.max(0, p.outstandingPaise);
      }
    }

    console.log('\n===', code, b.id, '===');
    console.log('SSOT:', ssot, 'expectedAugInvoice:', expectedInvoice, 'policy:', policy, 'stay:', stay);
    console.log(
      'Admin rent/elec:',
      acct.rent.outstandingPaise,
      acct.electricity.outstandingPaise,
      '| Invoice rent/elec out:',
      invRentOut,
      invElecOut,
    );
    for (const r of rents) {
      const p = projectInvoice(r);
      console.log(
        '  RENT',
        r.invoiceNumber,
        String(r.billingMonth).slice(0, 10),
        'rent',
        r.rentPaise,
        r.status,
        'out',
        p.outstandingPaise,
        'paid',
        r.paidAt,
      );
    }
    for (const e of elecs) {
      const p = projectElectricityInvoice(e);
      console.log(
        '  ELEC',
        e.invoiceNumber,
        String(e.billingMonth).slice(0, 10),
        'amt',
        e.amountPaise,
        'paid',
        e.paidPaise,
        e.status,
        'out',
        p.outstandingPaise,
        'proof',
        Boolean(e.paymentProofUrl),
      );
    }
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => closeDb());
