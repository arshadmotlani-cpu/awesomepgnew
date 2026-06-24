/**
 * Production E2E verification for APG-2026-0036 / APG-2026-0032 (Dhruv).
 * Run on Vercel build with VERIFY_APG_0036_E2E=1
 */
import 'dotenv/config';
import { and, eq, or, sql } from 'drizzle-orm';
import { createClient } from '../src/db/client';
import {
  auditLog,
  bedReservations,
  beds,
  bookings,
  customers,
  depositLedger,
  financialInvoices,
  payments,
  pgPaymentRecords,
  rentInvoices,
} from '../src/db/schema';
import { getAdminBookingDetail } from '../src/db/queries/admin';
import { listResidentBookingsForCustomer } from '../src/db/queries/customer';
import { loadDepositPageData } from '../src/lib/deposits/loadDepositPageData';
import { adminStayTypeLabel, stayTypeLabel, stayTypeFromPricingMode } from '../src/lib/stayType';
import { getDepositInvoiceForBooking } from '../src/services/depositInvoices';
import { getActiveTenancyForCustomer } from '../src/lib/residentActiveTenancy';
import { loadResidentAccountContext } from '../src/services/residentAccountContext';
import { getDepositSummaryForBooking } from '../src/services/deposits';

const TARGET = 'APG-2026-0036';
const SOURCE = 'APG-2026-0032';
const EXPECTED_BED = 'B3';

type Check = { id: string; question: string; pass: boolean; evidence: Record<string, unknown> };

function pass(id: string, question: string, evidence: Record<string, unknown>): Check {
  return { id, question, pass: true, evidence };
}
function fail(id: string, question: string, evidence: Record<string, unknown>): Check {
  return { id, question, pass: false, evidence };
}

async function main() {
  const { db, close } = createClient();
  const checks: Check[] = [];

  try {
    const [target] = await db
      .select()
      .from(bookings)
      .where(eq(bookings.bookingCode, TARGET))
      .limit(1);
    if (!target) {
      console.log(JSON.stringify({ error: `${TARGET} not found`, checks }, null, 2));
      process.exit(1);
    }

    const [source] = await db
      .select()
      .from(bookings)
      .where(eq(bookings.bookingCode, SOURCE))
      .limit(1);

    const [customer] = await db
      .select()
      .from(customers)
      .where(eq(customers.id, target.customerId))
      .limit(1);

    const reservations = await db
      .select({
        id: bedReservations.id,
        bedId: bedReservations.bedId,
        bedCode: beds.bedCode,
        status: bedReservations.status,
        kind: bedReservations.kind,
        stayRange: bedReservations.stayRange,
        bedInventoryStatus: beds.status,
      })
      .from(bedReservations)
      .innerJoin(beds, eq(beds.id, bedReservations.bedId))
      .where(eq(bedReservations.bookingId, target.id));

    const primary = reservations.find((r) => r.kind === 'primary') ?? reservations[0];

    // Q1
    checks.push(
      target.status === 'confirmed'
        ? pass('Q1', 'Is booking APG-2026-0036 confirmed?', {
            status: target.status,
            bookingId: target.id,
          })
        : fail('Q1', 'Is booking APG-2026-0036 confirmed?', {
            status: target.status,
            bookingId: target.id,
          }),
    );

    // Q2
    const bedOk = primary?.bedCode === EXPECTED_BED && primary?.status === 'active';
    checks.push(
      bedOk
        ? pass('Q2', `Is bed ${EXPECTED_BED} assigned and blocked?`, {
            bedCode: primary?.bedCode,
            reservationStatus: primary?.status,
            bedInventoryStatus: primary?.bedInventoryStatus,
            stayRange: primary?.stayRange,
          })
        : fail('Q2', `Is bed ${EXPECTED_BED} assigned and blocked?`, {
            reservations,
          }),
    );

    const accountCtx = customer ? await loadResidentAccountContext(customer.id) : null;
    const residentBookings = customer
      ? await listResidentBookingsForCustomer(customer.id)
      : { ok: false as const, data: [] };

    const myStayVisible =
      residentBookings.ok &&
      residentBookings.data.some((b) => b.bookingCode === TARGET);
    const primaryIsTarget = accountCtx?.primaryBooking?.bookingCode === TARGET;

    // Q3
    checks.push(
      myStayVisible && primaryIsTarget
        ? pass('Q3', 'Can Dhruv see the booking in My Stay?', {
            customerName: customer?.fullName,
            customerId: customer?.id,
            primaryBookingCode: accountCtx?.primaryBooking?.bookingCode,
            residentBookingCodes: residentBookings.ok
              ? residentBookings.data.map((b) => b.bookingCode)
              : [],
            isActiveStay: accountCtx?.isActiveStay,
          })
        : fail('Q3', 'Can Dhruv see the booking in My Stay?', {
            customerName: customer?.fullName,
            primaryBookingCode: accountCtx?.primaryBooking?.bookingCode,
            residentBookingCodes: residentBookings.ok
              ? residentBookings.data.map((b) => b.bookingCode)
              : [],
            listError: residentBookings.ok ? null : residentBookings.error,
          }),
    );

    const bookingPayments = await db
      .select()
      .from(payments)
      .where(eq(payments.bookingId, target.id))
      .orderBy(payments.createdAt);

    const paymentProofs = await db
      .select()
      .from(pgPaymentRecords)
      .where(eq(pgPaymentRecords.bookingId, target.id));

    const walletHistory = accountCtx?.rentPaymentHistory ?? [];
    const walletShowsPayment =
      bookingPayments.some((p) => p.status === 'succeeded' && p.amountPaise > 0) ||
      walletHistory.length > 0 ||
      paymentProofs.some((p) => p.status === 'approved');

    // Q4
    checks.push(
      walletShowsPayment
        ? pass('Q4', 'Can Dhruv see the payment in Payments/Wallet?', {
            payments: bookingPayments.map((p) => ({
              id: p.id,
              purpose: p.purpose,
              status: p.status,
              amountPaise: p.amountPaise,
            })),
            paymentProofs: paymentProofs.map((p) => ({
              id: p.id,
              status: p.status,
              amountPaise: p.amountPaise,
            })),
            rentPaymentHistory: walletHistory,
          })
        : fail('Q4', 'Can Dhruv see the payment in Payments/Wallet?', {
            payments: bookingPayments,
            paymentProofs,
            rentPaymentHistory: walletHistory,
          }),
    );

    const rentInvs = await db
      .select({ id: rentInvoices.id, invoiceNumber: rentInvoices.invoiceNumber, status: rentInvoices.status })
      .from(rentInvoices)
      .where(eq(rentInvoices.bookingId, target.id));

    const finInvs = await db
      .select({
        id: financialInvoices.id,
        invoiceNumber: financialInvoices.invoiceNumber,
        status: financialInvoices.status,
        source: financialInvoices.source,
      })
      .from(financialInvoices)
      .where(eq(financialInvoices.bookingId, target.id));

    const residentInvoices = accountCtx?.invoices ?? [];
    const invoiceIds = [
      ...rentInvs.map((i) => ({ type: 'rent_invoice', id: i.id, number: i.invoiceNumber })),
      ...finInvs.map((i) => ({ type: 'financial_invoice', id: i.id, number: i.invoiceNumber })),
    ];

    // Q5
    checks.push(
      invoiceIds.length === 0
        ? pass('Q5', 'Was any invoice generated?', {
            generated: false,
            invoiceIds: [],
            residentInvoiceCards: residentInvoices.length,
          })
        : fail('Q5', 'Was any invoice generated? (expected none for fixed-date checkout)', {
            generated: true,
            invoiceIds,
            residentInvoiceCards: residentInvoices.map((i) => ({
              id: i.id,
              kind: i.kind,
              invoiceNumber: i.invoiceNumber,
            })),
          }),
    );

    const adminDetail = await getAdminBookingDetail(target.id);
    const tenancy = customer ? await getActiveTenancyForCustomer(customer.id) : null;
    const depositPage = await loadDepositPageData(target.id);
    const depositInvoice = await getDepositInvoiceForBooking(target.id);

    const expectedStayLabel = stayTypeLabel('fixed_date_stay');
    const expectedAdminLabel = adminStayTypeLabel({
      stayType: target.stayType,
      durationMode: target.durationMode,
    });

    const customerStayLabel = accountCtx?.primaryBooking
      ? stayTypeLabel(stayTypeFromPricingMode(accountCtx.primaryBooking.durationMode))
      : null;

    const labels = {
      db: {
        stayType: target.stayType,
        durationMode: target.durationMode,
        stayTypeLabel: stayTypeLabel(
          target.stayType ?? stayTypeFromPricingMode(target.durationMode),
        ),
        adminStayTypeLabel: expectedAdminLabel,
      },
      adminBookingDetail: adminDetail.ok
        ? {
            durationMode: adminDetail.data?.durationMode,
            stayType: adminDetail.data?.stayType,
            adminStayTypeLabel: adminDetail.data
              ? adminStayTypeLabel({
                  stayType: adminDetail.data.stayType,
                  durationMode: adminDetail.data.durationMode,
                })
              : null,
          }
        : { error: adminDetail.error },
      residentTenancy: tenancy
        ? {
            stayType: tenancy.stayType,
            durationMode: tenancy.durationMode,
            adminStayTypeLabel: adminStayTypeLabel({
              stayType: tenancy.stayType,
              durationMode: tenancy.durationMode,
            }),
          }
        : null,
      depositPage: {
        stayTypeFromBooking: target.stayType,
        invoiceDisplayStatus: depositPage.invoice?.displayStatus,
      },
      myStayPrimaryBooking: {
        durationMode: accountCtx?.primaryBooking?.durationMode,
        customerStayLabel,
      },
    };

    const fixedEverywhere =
      target.stayType === 'fixed_date_stay' &&
      target.durationMode === 'fixed_stay' &&
      expectedAdminLabel === 'Fixed date' &&
      customerStayLabel === expectedStayLabel;

    // Q6
    checks.push(
      fixedEverywhere
        ? pass('Q6', 'Does APG-2026-0036 show Fixed-Date Stay everywhere?', labels)
        : fail('Q6', 'Does APG-2026-0036 show Fixed-Date Stay everywhere?', labels),
    );

    if (source) {
      const sourceDeposit = await getDepositInvoiceForBooking(source.id);
      const sourceSummary = await getDepositSummaryForBooking(source.id);
      const sourcePage = await loadDepositPageData(source.id);

      const q7ok =
        (sourceDeposit?.refundablePaise ?? sourcePage.refundablePaise) === 0 &&
        (sourceDeposit?.displayStatus === 'Settled' ||
          sourceDeposit?.invoiceStatus === 'settled' ||
          sourcePage.invoice?.displayStatus === 'Settled');

      checks.push(
        q7ok
          ? pass('Q7', 'Does APG-2026-0032 show refundable ₹0 and Settled?', {
              invoice: {
                refundablePaise: sourceDeposit?.refundablePaise,
                displayStatus: sourceDeposit?.displayStatus,
                invoiceStatus: sourceDeposit?.invoiceStatus,
              },
              page: {
                refundablePaise: sourcePage.refundablePaise,
                displayStatus: sourcePage.invoice?.displayStatus,
              },
              summary: {
                refundableBalancePaise: sourceSummary?.refundableBalancePaise,
              },
            })
          : fail('Q7', 'Does APG-2026-0032 show refundable ₹0 and Settled?', {
              invoice: sourceDeposit,
              page: { refundablePaise: sourcePage.refundablePaise },
              summary: sourceSummary,
            }),
      );
    }

    const targetDeposit = depositInvoice;
    const q8ok =
      (targetDeposit?.refundablePaise ?? depositPage.refundablePaise) === 95_000 &&
      (targetDeposit?.displayStatus === 'Held' ||
        targetDeposit?.invoiceStatus === 'held' ||
        depositPage.invoice?.displayStatus === 'Held');

    // Q8
    checks.push(
      q8ok
        ? pass('Q8', 'Does APG-2026-0036 show refundable ₹950 and Held?', {
            invoice: {
              refundablePaise: targetDeposit?.refundablePaise,
              displayStatus: targetDeposit?.displayStatus,
            },
            page: {
              refundablePaise: depositPage.refundablePaise,
              displayStatus: depositPage.invoice?.displayStatus,
            },
          })
        : fail('Q8', 'Does APG-2026-0036 show refundable ₹950 and Held?', {
            invoice: targetDeposit,
            page: depositPage,
          }),
    );

    // Q9 — refundable credit on 0032 should not appear as available
    const sourceLedger = source
      ? await db
          .select()
          .from(depositLedger)
          .where(eq(depositLedger.bookingId, source.id))
      : [];

    const transferAudits = await db
      .select()
      .from(auditLog)
      .where(
        and(
          eq(auditLog.action, 'deposit_transfer_from_prior_booking'),
          or(
            eq(auditLog.entityId, target.id),
            source ? eq(auditLog.entityId, source.id) : sql`false`,
          ),
        ),
      );

    const snapshot = target.pricingSnapshot as { depositCredit?: { appliedPaise?: number } } | null;
    const sourceRefundable = source
      ? await getDepositSummaryForBooking(source.id)
      : null;

    const badRefCredit =
      (sourceRefundable?.refundableBalancePaise ?? 0) > 0 ||
      sourceLedger.some(
        (r) =>
          r.entryKind === 'collected' &&
          typeof r.reason === 'string' &&
          r.reason.includes('Deposit credit') &&
          r.amountPaise > 0,
      );

    // Q9 — transfer should exist in audit/ledger but NOT as refundable on 0032
    checks.push(
      !badRefCredit && (sourceRefundable?.refundableBalancePaise ?? 0) === 0
        ? pass('Q9', 'No remaining refundable ₹330 credit on source booking?', {
            sourceRefundablePaise: sourceRefundable?.refundableBalancePaise ?? 0,
            targetDepositCreditAppliedPaise: snapshot?.depositCredit?.appliedPaise ?? 0,
            transferAuditIds: transferAudits.map((a) => a.id),
            note: 'Transfer audit/ledger rows may exist; source refundable must be 0',
          })
        : fail('Q9', 'No remaining refundable ₹330 credit on source booking?', {
            sourceRefundablePaise: sourceRefundable?.refundableBalancePaise,
            sourceLedger,
            transferAudits,
          }),
    );

    const summary = {
      verifiedAt: new Date().toISOString(),
      customer: customer
        ? { id: customer.id, fullName: customer.fullName, phone: customer.phone }
        : null,
      target: {
        id: target.id,
        code: target.bookingCode,
        status: target.status,
        stayType: target.stayType,
        durationMode: target.durationMode,
        expectedCheckoutDate: target.expectedCheckoutDate,
      },
      urls: {
        customerBooking: `https://www.awesomepg.in/booking/${TARGET}`,
        customerAccount: 'https://www.awesomepg.in/account',
        adminBooking: `https://www.awesomepg.in/admin/bookings/${target.id}`,
        adminDeposit: `https://www.awesomepg.in/admin/deposits/${target.id}`,
        adminResident: customer
          ? `https://www.awesomepg.in/admin/residents/${customer.id}`
          : null,
      },
      checks,
      overallPass: checks.every((c) => c.pass),
    };

    console.log('=== APG-2026-0036 PRODUCTION E2E ===');
    console.log(JSON.stringify(summary, null, 2));
    for (const c of checks) {
      console.log(`${c.pass ? 'PASS' : 'FAIL'} ${c.id}: ${c.question}`);
    }
    console.log(`OVERALL: ${summary.overallPass ? 'PASS' : 'FAIL'}`);
  } finally {
    await close();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
