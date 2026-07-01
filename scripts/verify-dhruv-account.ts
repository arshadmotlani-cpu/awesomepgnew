/* eslint-disable no-console */
/**
 * End-to-end read-only certification for Dhruv (APG-2026-0036) account consistency.
 *
 * Usage:
 *   DOTENV_CONFIG_PATH=.env.vercel.pull npx tsx -r dotenv/config scripts/verify-dhruv-account.ts
 */
import { loadAppEnv } from '../src/lib/db/loadEnv';
loadAppEnv();
import { and, desc, eq } from 'drizzle-orm';
import { closeDb, db } from '../src/db/client';
import {
  bookings,
  checkoutSettlements,
  customers,
  depositLedger,
  payments,
  residentRequests,
  vacatingRequests,
} from '../src/db/schema';
import { getDepositRefundSettlementPreview } from '../src/lib/deposits/depositRefundSettlementPreview';
import { getDepositRefundEligibility } from '../src/lib/vacating/depositRefundEligibility';
import { customerHasConfirmedBooking, getVacatingForBooking, listElectricityInvoicesForBooking, listResidentBookingsForCustomer } from '../src/db/queries/customer';
import { getCustomerDepositCredit } from '../src/services/depositCredit';
import { getDepositSummaryForBooking } from '../src/services/deposits';
import { getResidentFinancialAccount } from '../src/services/residentFinancialEngine';
import { getCheckoutSettlementForCustomer } from '../src/services/checkoutSettlement';

const DHRUV_EMAIL = 'dhruvpaul001@gmail.com';
const EXPECTED_DEPOSIT_PAISE = 95_000;
const PRIMARY_BOOKING_CODE = 'APG-2026-0036';
const PRIOR_BOOKING_CODE = 'APG-2026-0032';

type Check = { name: string; ok: boolean; detail: string };

function check(name: string, ok: boolean, detail: string): Check {
  return { name, ok, detail };
}

async function main() {
  const results: Check[] = [];

  const [customer] = await db
    .select()
    .from(customers)
    .where(eq(customers.email, DHRUV_EMAIL))
    .limit(1);
  if (!customer) {
    console.error('Dhruv customer not found by email', DHRUV_EMAIL);
    process.exit(1);
  }

  const confirmed = await customerHasConfirmedBooking(customer.id);
  results.push(
    check(
      'Portal access (hasConfirmedBooking)',
      confirmed.ok && confirmed.data,
      confirmed.ok ? String(confirmed.data) : confirmed.error ?? 'query failed',
    ),
  );

  const bookingsRes = await listResidentBookingsForCustomer(customer.id);
  const bookingRows = bookingsRes.ok ? bookingsRes.data : [];
  const primary = bookingRows[0];
  results.push(
    check(
      'Primary resident booking',
      primary?.bookingCode === PRIMARY_BOOKING_CODE,
      primary
        ? `${primary.bookingCode} (${primary.status})`
        : 'no bookings in resident list',
    ),
  );

  for (const code of [PRIMARY_BOOKING_CODE, PRIOR_BOOKING_CODE]) {
    const [b] = await db
      .select({ id: bookings.id, depositPaise: bookings.depositPaise })
      .from(bookings)
      .where(eq(bookings.bookingCode, code))
      .limit(1);
    if (!b) {
      results.push(check(`Booking ${code}`, false, 'not found'));
      continue;
    }
    const summary = await getDepositSummaryForBooking(b.id);
    const ledger = await db
      .select()
      .from(depositLedger)
      .where(eq(depositLedger.bookingId, b.id))
      .orderBy(depositLedger.createdAt);
    const sum = ledger.reduce((acc, row) => acc + row.amountPaise, 0);
    results.push(
      check(
        `Deposit ledger ${code}`,
        summary?.refundableBalancePaise === sum,
        `ledger sum ₹${(sum / 100).toFixed(0)} · summary refundable ₹${((summary?.refundableBalancePaise ?? 0) / 100).toFixed(0)} · required ₹${(b.depositPaise / 100).toFixed(0)}`,
      ),
    );
    if (code === PRIMARY_BOOKING_CODE) {
      results.push(
        check(
          '₹950 held on APG-2026-0036',
          (summary?.refundableBalancePaise ?? 0) === EXPECTED_DEPOSIT_PAISE,
          `refundableBalancePaise=${summary?.refundableBalancePaise ?? 0}`,
        ),
      );
    }
    if (code === PRIOR_BOOKING_CODE) {
      results.push(
        check(
          'Prior stay deposit transferred (0032 net zero)',
          (summary?.refundableBalancePaise ?? 0) === 0,
          `refundableBalancePaise=${summary?.refundableBalancePaise ?? 0}`,
        ),
      );
    }
  }

  const wallet = await getCustomerDepositCredit(customer.id);
  results.push(
    check(
      'Customer wallet aggregate',
      wallet.availableCreditPaise === EXPECTED_DEPOSIT_PAISE,
      `held ₹${(wallet.totalHeldPaise / 100).toFixed(0)} · available ₹${(wallet.availableCreditPaise / 100).toFixed(0)}`,
    ),
  );

  const financial = await getResidentFinancialAccount(customer.id);
  results.push(
    check(
      'Financial engine deposit refundable',
      (financial?.deposit.refundablePaise ?? 0) === EXPECTED_DEPOSIT_PAISE,
      `refundablePaise=${financial?.deposit.refundablePaise ?? 0}`,
    ),
  );

  const primaryBooking = bookingRows.find((b) => b.bookingCode === PRIMARY_BOOKING_CODE);
  if (primaryBooking) {
    const elec = await listElectricityInvoicesForBooking(primaryBooking.bookingId);
    const elecRows = elec.ok ? elec.data : [];
    const pendingElec = elecRows.filter((e) => e.status === 'pending' || e.status === 'overdue');
    results.push(
      check(
        'Electricity invoices (0036)',
        true,
        `${elecRows.length} total · ${pendingElec.length} outstanding · ${elecRows.map((e) => `${e.invoiceNumber}:${e.status}`).join(', ') || 'none'}`,
      ),
    );

    const preview = await getDepositRefundSettlementPreview(primaryBooking.bookingId);
    results.push(
      check(
        'Refund settlement preview',
        preview.depositBalancePaise === EXPECTED_DEPOSIT_PAISE,
        `deposit ₹${(preview.depositBalancePaise / 100).toFixed(0)} · elec adj ${preview.electricityAdjustmentPaise ?? 'pending'} · refund ${preview.refundAmountPaise ?? 'pending'} · elecPending=${preview.electricityPending}`,
      ),
    );

    const vacating = await getVacatingForBooking(primaryBooking.bookingId);
    const settlement = await getCheckoutSettlementForCustomer(customer.id, primaryBooking.bookingId);
    const eligibility = getDepositRefundEligibility({
      vacating: vacating.ok ? vacating.data : null,
      booking: {
        status: primaryBooking.status,
        durationMode: primaryBooking.durationMode,
        expectedCheckoutDate: primaryBooking.expectedCheckoutDate,
        createdAt: primaryBooking.createdAt,
      },
      settlement: settlement ? { status: settlement.status } : null,
      monthlyRentPaise: primaryBooking.monthlyRentPaise,
    });
    results.push(
      check(
        'Refund eligibility (0036 fixed stay)',
        eligibility.canRequestRefund,
        eligibility.lockReason ?? `unlockState=${eligibility.unlockState ?? 'unlocked'}`,
      ),
    );
  }

  const suppressedVacatings = await db
    .select({
      id: vacatingRequests.id,
      bookingCode: bookings.bookingCode,
      suppressed: vacatingRequests.checkoutSettlementSuppressed,
      status: vacatingRequests.status,
    })
    .from(vacatingRequests)
    .innerJoin(bookings, eq(bookings.id, vacatingRequests.bookingId))
    .where(eq(vacatingRequests.customerId, customer.id));

  results.push(
    check(
      'Vacating rows',
      true,
      suppressedVacatings
        .map((v) => `${v.bookingCode}:${v.status}${v.suppressed ? ':suppressed' : ''}`)
        .join(' · ') || 'none',
    ),
  );

  const staleSettlements = await db
    .select({
      id: checkoutSettlements.id,
      status: checkoutSettlements.status,
      bookingCode: bookings.bookingCode,
      suppressed: vacatingRequests.checkoutSettlementSuppressed,
    })
    .from(checkoutSettlements)
    .innerJoin(bookings, eq(bookings.id, checkoutSettlements.bookingId))
    .innerJoin(vacatingRequests, eq(vacatingRequests.id, checkoutSettlements.vacatingRequestId))
    .where(eq(checkoutSettlements.customerId, customer.id))
    .orderBy(desc(checkoutSettlements.updatedAt));

  const visibleStale = staleSettlements.filter(
    (s) => !s.suppressed && !['archived', 'completed', 'refund_paid'].includes(s.status),
  );
  results.push(
    check(
      'No stale operational checkout for prior stay',
      visibleStale.every((s) => s.bookingCode === PRIMARY_BOOKING_CODE),
      staleSettlements
        .map((s) => `${s.bookingCode}:${s.status}${s.suppressed ? ':suppressed' : ''}`)
        .join(' · ') || 'none',
    ),
  );

  const openRefundRequests = await db
    .select({ id: residentRequests.id, status: residentRequests.status, bookingId: residentRequests.bookingId })
    .from(residentRequests)
    .where(
      and(eq(residentRequests.customerId, customer.id), eq(residentRequests.type, 'deposit_refund')),
    );

  results.push(
    check(
      'Open refund requests',
      true,
      openRefundRequests.map((r) => `${r.id.slice(0, 8)}:${r.status}`).join(' · ') || 'none',
    ),
  );

  const bookingPayments = await db
    .select({
      purpose: payments.purpose,
      amountPaise: payments.amountPaise,
      status: payments.status,
      bookingCode: bookings.bookingCode,
    })
    .from(payments)
    .innerJoin(bookings, eq(bookings.id, payments.bookingId))
    .where(eq(bookings.customerId, customer.id))
    .orderBy(desc(payments.createdAt));

  results.push(
    check(
      'Payment history',
      true,
      bookingPayments
        .map((p) => `${p.bookingCode} ${p.purpose} ₹${(p.amountPaise / 100).toFixed(0)} ${p.status}`)
        .join(' · '),
    ),
  );

  console.log('\n=== Dhruv account verification ===\n');
  console.log(`Customer: ${customer.fullName} <${customer.email}>`);
  console.log(`Residency: ${customer.residencyStatus}\n`);

  let pass = 0;
  let fail = 0;
  for (const row of results) {
    const mark = row.ok ? 'PASS' : 'FAIL';
    if (row.ok) pass += 1;
    else fail += 1;
    console.log(`${mark}  ${row.name}`);
    console.log(`      ${row.detail}\n`);
  }

  console.log(`Summary: ${pass} passed · ${fail} failed`);
  await closeDb();
  process.exit(fail > 0 ? 1 : 0);
}

main().catch(async (err) => {
  console.error(err);
  await closeDb().catch(() => undefined);
  process.exit(1);
});
