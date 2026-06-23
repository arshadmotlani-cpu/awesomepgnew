/* eslint-disable no-console */
/**
 * Booking Payment E2E — staging verification (service layer).
 *
 * Scenarios:
 *   1. Full QR proof → admin approve
 *   2. Overpayment + wallet_credit disposition
 *   3. Offline admin payment (recordPaymentSuccess via cash provider)
 *
 * Usage:
 *   DATABASE_URL=... npx tsx scripts/verify-booking-payment-e2e.ts
 *
 * Outputs JSON summary to stdout and docs/testing/booking-payment-e2e-results.json
 */
import 'dotenv/config';
import { randomUUID } from 'crypto';
import { and, desc, eq } from 'drizzle-orm';
import { closeDb, db } from '../src/db/client';
import {
  auditLog,
  bedReservations,
  bookings,
  depositLedger,
  emailDeliveryLog,
  payments,
} from '../src/db/schema';
import { isResidentDashboardUnlocked } from '../src/lib/bookingApproval';
import { hasDatabaseUrl, getDatabaseHost } from '../src/lib/db/env';
import type { AdminSession } from '../src/lib/auth/session';
import { createBooking } from '../src/services/booking';
import { recordPaymentSuccess } from '../src/services/bookingLifecycle';
import { isBedAvailable } from '../src/services/availability';
import { submitBookingPaymentRecord, reviewPaymentRecord } from '../src/services/qrPayments';
import { getDepositSummaryForBooking } from '../src/services/deposits';

type ScenarioResult = {
  name: string;
  status: 'PASS' | 'FAIL';
  bookingId?: string;
  bookingCode?: string;
  paymentId?: string;
  ledgerEntryIds?: string[];
  auditLogIds?: string[];
  pgPaymentRecordId?: string;
  checks: Record<string, boolean | string | number | null>;
  errors: string[];
};

const adminSession: AdminSession = {
  kind: 'admin',
  sessionId: 'e2e-verify',
  adminId: '00000000-0000-4000-8000-000000000001',
  email: 'e2e@awesomepg.internal',
  fullName: 'Booking Payment E2E',
  role: 'super_admin',
  pgScope: [],
  mustChangePassword: false,
  rememberMe: false,
  expiresAt: new Date(Date.now() + 3600_000),
};

async function pickFreeBed(start: Date, end: Date): Promise<string> {
  const { beds } = await import('../src/db/schema');
  const candidates = await db
    .select({ id: beds.id })
    .from(beds)
    .where(eq(beds.status, 'available'))
    .limit(64);
  for (const c of candidates) {
    if (await isBedAvailable({ bedId: c.id, startDate: start, endDate: end })) return c.id;
  }
  throw new Error('No free bed for test window');
}

function windowDates() {
  const jitter = Math.floor(Math.random() * 200) + 100;
  const start = new Date(Date.now() + jitter * 86400_000);
  const end = new Date(start.getTime() + 30 * 86400_000);
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  return { start, end, startStr: fmt(start), endStr: fmt(end) };
}

async function createTestBooking(label: string) {
  const { start, end, startStr, endStr } = windowDates();
  const bedId = await pickFreeBed(start, end);
  const ts = Date.now();
  const created = await createBooking({
    bedIds: [bedId],
    startDate: startStr,
    endDate: endStr,
    durationMode: 'monthly',
    customer: {
      fullName: `E2E ${label} ${ts}`,
      email: `e2e-bp-${label}-${ts}@awesomepg.local`,
      phone: `+9199${String(ts).slice(-8)}`,
      gender: 'other',
    },
  });
  if (!created.ok) throw new Error(`createBooking failed: ${JSON.stringify(created)}`);
  return created;
}

async function assertScenarioChecks(input: {
  bookingId: string;
  customerId: string;
  paymentId: string;
  expectDepositLedger: boolean;
  expectOverpayLedger?: boolean;
}): Promise<{
  checks: Record<string, boolean | string | number | null>;
  ledgerEntryIds: string[];
  auditLogIds: string[];
  errors: string[];
}> {
  const errors: string[] = [];
  const checks: Record<string, boolean | string | number | null> = {};

  const [booking] = await db
    .select({
      status: bookings.status,
      depositCollectionStatus: bookings.depositCollectionStatus,
    })
    .from(bookings)
    .where(eq(bookings.id, input.bookingId))
    .limit(1);

  checks.bookingStatus = booking?.status ?? null;
  if (booking?.status !== 'confirmed') errors.push(`booking status expected confirmed, got ${booking?.status}`);

  const [reservation] = await db
    .select({ status: bedReservations.status })
    .from(bedReservations)
    .where(
      and(eq(bedReservations.bookingId, input.bookingId), eq(bedReservations.kind, 'primary')),
    )
    .limit(1);
  checks.reservationStatus = reservation?.status ?? null;
  if (reservation?.status !== 'active') {
    errors.push(`reservation expected active, got ${reservation?.status}`);
  }

  const [payment] = await db
    .select({ id: payments.id, purpose: payments.purpose, status: payments.status, amountPaise: payments.amountPaise })
    .from(payments)
    .where(eq(payments.id, input.paymentId))
    .limit(1);
  checks.paymentPurpose = payment?.purpose ?? null;
  checks.paymentStatus = payment?.status ?? null;
  if (payment?.purpose !== 'booking' || payment?.status !== 'succeeded') {
    errors.push('payments row missing or wrong purpose/status');
  }

  const ledgerRows = await db
    .select()
    .from(depositLedger)
    .where(eq(depositLedger.bookingId, input.bookingId))
    .orderBy(desc(depositLedger.createdAt));
  checks.depositLedgerRowCount = ledgerRows.length;
  const ledgerEntryIds = ledgerRows.map((r) => r.id);
  if (input.expectDepositLedger && ledgerRows.filter((r) => r.entryKind === 'collected').length === 0) {
    errors.push('expected deposit_ledger collected row');
  }
  if (input.expectOverpayLedger) {
    const overpay = ledgerRows.filter((r) =>
      r.reason.includes('BOOKING_OVERPAYMENT_WALLET_CREDIT'),
    );
    if (overpay.length === 0) errors.push('expected overpayment wallet_credit ledger row');
  }

  const summary = await getDepositSummaryForBooking(input.bookingId);
  checks.depositCollectedPaise = summary?.collectedPaise ?? null;

  const auditRows = await db
    .select()
    .from(auditLog)
    .where(eq(auditLog.entityId, input.bookingId))
    .orderBy(desc(auditLog.createdAt))
    .limit(20);
  const auditLogIds = auditRows.map((r) => r.id);
  checks.auditPaymentSucceeded = auditRows.some((r) => r.action === 'payment_succeeded');
  if (!checks.auditPaymentSucceeded) errors.push('missing audit_log payment_succeeded');

  const emails = await db
    .select({ id: emailDeliveryLog.id, notificationKind: emailDeliveryLog.notificationKind, status: emailDeliveryLog.status })
    .from(emailDeliveryLog)
    .where(eq(emailDeliveryLog.customerId, input.customerId))
    .orderBy(desc(emailDeliveryLog.createdAt))
    .limit(10);
  checks.notificationCount = emails.length;
  checks.bookingConfirmedEmail = emails.some((e) => e.notificationKind === 'booking_confirmed');
  checks.paymentReceiptEmail = emails.some((e) => e.notificationKind === 'payment_receipt');

  checks.residentDashboardUnlocked = await isResidentDashboardUnlocked(input.customerId);
  if (!checks.residentDashboardUnlocked) errors.push('resident dashboard not unlocked');

  checks.revenueRentInvoiceCreated = false;
  const { rentInvoices } = await import('../src/db/schema');
  const rentRows = await db
    .select({ id: rentInvoices.id })
    .from(rentInvoices)
    .where(eq(rentInvoices.bookingId, input.bookingId))
    .limit(1);
  checks.revenueRentInvoiceCreated = rentRows.length > 0;

  return { checks, ledgerEntryIds, auditLogIds, errors };
}

async function scenario1FullApproval(): Promise<ScenarioResult> {
  const result: ScenarioResult = {
    name: 'Full booking payment approval (QR proof)',
    status: 'FAIL',
    checks: {},
    errors: [],
  };
  try {
    const created = await createTestBooking('full');
    result.bookingId = created.bookingId;
    result.bookingCode = created.bookingCode;

    await submitBookingPaymentRecord({
      bookingCode: created.bookingCode,
      customerId: created.customerId,
      amountPaise: created.totalPaise,
      paymentScreenshotUrl: 'https://example.com/e2e-proof.jpg',
      transactionRef: `E2E-${Date.now()}`,
    });

    const { pgPaymentRecords } = await import('../src/db/schema');
    const [proof] = await db
      .select({ id: pgPaymentRecords.id, pgId: pgPaymentRecords.pgId })
      .from(pgPaymentRecords)
      .where(
        and(
          eq(pgPaymentRecords.bookingId, created.bookingId),
          eq(pgPaymentRecords.status, 'pending'),
        ),
      )
      .limit(1);
    if (!proof) throw new Error('pending pg_payment_record not found');
    result.pgPaymentRecordId = proof.id;

    await reviewPaymentRecord(adminSession, proof.id, 'approved');

    const [payment] = await db
      .select({ id: payments.id })
      .from(payments)
      .where(eq(payments.bookingId, created.bookingId))
      .orderBy(desc(payments.paidAt))
      .limit(1);
    if (!payment) throw new Error('payments row not found');
    result.paymentId = payment.id;

    const verified = await assertScenarioChecks({
      bookingId: created.bookingId,
      customerId: created.customerId,
      paymentId: payment.id,
      expectDepositLedger: true,
    });
    result.checks = verified.checks;
    result.ledgerEntryIds = verified.ledgerEntryIds;
    result.auditLogIds = verified.auditLogIds;
    result.errors = verified.errors;
    result.status = verified.errors.length === 0 ? 'PASS' : 'FAIL';
  } catch (err) {
    result.errors.push(err instanceof Error ? err.message : String(err));
    result.status = 'FAIL';
  }
  return result;
}

async function scenario2OverpaymentWalletCredit(): Promise<ScenarioResult> {
  const result: ScenarioResult = {
    name: 'Overpayment with wallet_credit',
    status: 'FAIL',
    checks: {},
    errors: [],
  };
  try {
    const created = await createTestBooking('overpay');
    result.bookingId = created.bookingId;
    result.bookingCode = created.bookingCode;

    const overpayPaise = 5_000;
    const submitAmount = created.totalPaise + overpayPaise;

    await submitBookingPaymentRecord({
      bookingCode: created.bookingCode,
      customerId: created.customerId,
      amountPaise: submitAmount,
      paymentScreenshotUrl: 'https://example.com/e2e-overpay-proof.jpg',
      transactionRef: `E2E-OP-${Date.now()}`,
    });

    const { pgPaymentRecords } = await import('../src/db/schema');
    const [proof] = await db
      .select({ id: pgPaymentRecords.id })
      .from(pgPaymentRecords)
      .where(
        and(
          eq(pgPaymentRecords.bookingId, created.bookingId),
          eq(pgPaymentRecords.status, 'pending'),
        ),
      )
      .limit(1);
    if (!proof) throw new Error('pending proof not found');
    result.pgPaymentRecordId = proof.id;

    await reviewPaymentRecord(adminSession, proof.id, 'approved', {
      reviewMeta: { overpaymentDisposition: 'wallet_credit' },
    });

    const [payment] = await db
      .select({ id: payments.id })
      .from(payments)
      .where(eq(payments.bookingId, created.bookingId))
      .limit(1);
    if (!payment) throw new Error('payment not found');
    result.paymentId = payment.id;

    const verified = await assertScenarioChecks({
      bookingId: created.bookingId,
      customerId: created.customerId,
      paymentId: payment.id,
      expectDepositLedger: true,
      expectOverpayLedger: true,
    });
    result.checks = verified.checks;
    result.ledgerEntryIds = verified.ledgerEntryIds;
    result.auditLogIds = verified.auditLogIds;
    result.errors = verified.errors;

    const overpayAudit = await db
      .select({ id: auditLog.id })
      .from(auditLog)
      .where(
        and(
          eq(auditLog.entityId, created.bookingId),
          eq(auditLog.action, 'booking_overpayment_wallet_credit'),
        ),
      )
      .limit(1);
    result.checks.overpayAuditPresent = overpayAudit.length > 0;
    if (!result.checks.overpayAuditPresent) result.errors.push('missing overpayment wallet audit');

    const emails = await db
      .select({ notificationKind: emailDeliveryLog.notificationKind })
      .from(emailDeliveryLog)
      .where(eq(emailDeliveryLog.customerId, created.customerId));
    result.checks.overpayWalletEmail = emails.some(
      (e) => e.notificationKind === 'overpayment_wallet_credit',
    );

    result.status = result.errors.length === 0 ? 'PASS' : 'FAIL';
  } catch (err) {
    result.errors.push(err instanceof Error ? err.message : String(err));
    result.status = 'FAIL';
  }
  return result;
}

async function scenario3OfflinePayment(): Promise<ScenarioResult> {
  const result: ScenarioResult = {
    name: 'Offline admin payment',
    status: 'FAIL',
    checks: {},
    errors: [],
  };
  try {
    const created = await createTestBooking('offline');
    result.bookingId = created.bookingId;
    result.bookingCode = created.bookingCode;

    const providerPaymentId = `offline_e2e_${randomUUID()}`;
    const paid = await recordPaymentSuccess({
      provider: 'cash',
      providerPaymentId,
      amountPaise: created.totalPaise,
      bookingCode: created.bookingCode,
      recordedByAdminId: adminSession.adminId,
      rawPayload: { recordedBy: 'admin', reference: providerPaymentId },
    });
    if (!paid.ok) throw new Error(paid.reason ?? 'recordPaymentSuccess failed');
    result.paymentId = paid.paymentId;

    const verified = await assertScenarioChecks({
      bookingId: created.bookingId,
      customerId: created.customerId,
      paymentId: paid.paymentId,
      expectDepositLedger: true,
    });
    result.checks = verified.checks;
    result.ledgerEntryIds = verified.ledgerEntryIds;
    result.auditLogIds = verified.auditLogIds;
    result.errors = verified.errors;

    const adminAudit = await db
      .select({ actorType: auditLog.actorType, action: auditLog.action })
      .from(auditLog)
      .where(
        and(eq(auditLog.entityId, created.bookingId), eq(auditLog.action, 'payment_succeeded')),
      )
      .limit(1);
    result.checks.auditActorAdmin = adminAudit[0]?.actorType === 'admin';
    if (!result.checks.auditActorAdmin) {
      result.errors.push('expected admin actor on payment_succeeded audit');
    }

    result.status = result.errors.length === 0 ? 'PASS' : 'FAIL';
  } catch (err) {
    result.errors.push(err instanceof Error ? err.message : String(err));
    result.status = 'FAIL';
  }
  return result;
}

async function main() {
  if (!hasDatabaseUrl()) {
    console.error('BLOCKED: DATABASE_URL not configured. Set DATABASE_URL and re-run.');
    process.exit(2);
  }

  console.log(`Booking Payment E2E — DB host: ${getDatabaseHost() ?? 'unknown'}\n`);

  const scenarios = [
    await scenario1FullApproval(),
    await scenario2OverpaymentWalletCredit(),
    await scenario3OfflinePayment(),
  ];

  const allPass = scenarios.every((s) => s.status === 'PASS');
  const summary = {
    runAt: new Date().toISOString(),
    dbHost: getDatabaseHost(),
    overall: allPass ? 'VERIFIED_PASS' : 'FAIL',
    scenarios,
  };

  console.log(JSON.stringify(summary, null, 2));

  const fs = await import('node:fs');
  const path = await import('node:path');
  const outPath = path.join(process.cwd(), 'docs/testing/booking-payment-e2e-results.json');
  fs.writeFileSync(outPath, JSON.stringify(summary, null, 2));
  console.log(`\nWrote ${outPath}`);

  await closeDb();
  process.exit(allPass ? 0 : 1);
}

main().catch(async (err) => {
  console.error(err);
  await closeDb().catch(() => undefined);
  process.exit(1);
});
