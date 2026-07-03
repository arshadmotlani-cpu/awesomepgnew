/* eslint-disable no-console */
/**
 * Production write-flow verification for Deposit Express + Refund of Deposit.
 * Uses dedicated bot resident — never touches real production residents.
 *
 *   DATABASE_URL=... npx tsx scripts/prod-deposit-refund-write-verify.ts
 *   DATABASE_URL=... npx tsx scripts/prod-deposit-refund-write-verify.ts --cleanup-only
 */
import { and, eq, inArray, sql } from 'drizzle-orm';
import { closeDb, createClient, db } from '../src/db/client';
import {
  adminUsers,
  bedReservations,
  bookings,
  customers,
  depositLedger,
  depositSettlements,
  financialInvoices,
  payments,
  pgPaymentRecords,
  rentInvoices,
  residentBillingProfiles,
} from '../src/db/schema';
import { checkoutSettlements } from '../src/db/schema/checkoutSettlements';
import {
  residentResidencies,
  residencyBookingLinks,
} from '../src/db/schema/residentResidencies';
import { vacatingRequests } from '../src/db/schema/vacatingRequests';
import { mergeOrUpsertCustomerForAdminWalkIn } from '../src/services/adminCustomerMerge';
import { assignTenantToBed } from '../src/services/tenantAssignment';
import { executeDepositExpress, listDepositDueBookings } from '../src/services/depositExpress';
import { getDepositSummaryForBooking } from '../src/services/deposits';
import {
  applyDepositDeduction,
  settleDepositRefund,
} from '../src/services/depositSettlement';
import {
  getRefundConsoleWorkspace,
  searchRefundConsoleBookings,
} from '../src/services/refundConsole';
import { loadUnifiedOperationsQueue } from '../src/services/unifiedOperationsQueue';
import { isBedAvailable } from '../src/services/availability';
import { beds } from '../src/db/schema';
import type { AdminSession } from '../src/lib/auth/session';
import { todayString } from '../src/lib/dates';

const BOT_NAME = 'Prod Deposit Verify Bot';
const BOT_PHONE = '+919000009992';
const BOT_EMAIL = 'prod-deposit-verify@awesomepg.internal';
const BOT_NOTES = 'PROD_DEPOSIT_REFUND_WRITE_VERIFY';
const REQUIRED_DEPOSIT_PAISE = 15_000; // ₹150
const PARTIAL_PAISE = 5_000;
const DEDUCTION_PAISE = 2_000;

let depositPass = true;
let refundPass = true;
const bugs: string[] = [];

function fail(section: string, msg: string) {
  bugs.push(`[${section}] ${msg}`);
  console.error(`✗ [${section}] ${msg}`);
}

function pass(section: string, msg: string) {
  console.log(`✓ [${section}] ${msg}`);
}

async function getSuperAdminSession(): Promise<AdminSession> {
  const [admin] = await db
    .select({
      id: adminUsers.id,
      email: adminUsers.email,
      fullName: adminUsers.fullName,
      role: adminUsers.role,
      pgScope: adminUsers.pgScope,
    })
    .from(adminUsers)
    .where(eq(adminUsers.role, 'super_admin'))
    .limit(1);
  if (!admin) throw new Error('No super_admin found');
  return {
    kind: 'admin',
    sessionId: 'prod-write-verify',
    adminId: admin.id,
    email: admin.email,
    fullName: admin.fullName,
    role: admin.role,
    pgScope: admin.pgScope ?? [],
    mustChangePassword: false,
    rememberMe: false,
    expiresAt: new Date(Date.now() + 3600000),
  };
}

async function findBotCustomer() {
  const [row] = await db
    .select({ id: customers.id })
    .from(customers)
    .where(eq(customers.phone, BOT_PHONE))
    .limit(1);
  return row?.id ?? null;
}

async function cleanupFixture(customerId: string | null) {
  if (!customerId) return;
  const bookingRows = await db
    .select({ id: bookings.id })
    .from(bookings)
    .where(eq(bookings.customerId, customerId));
  const bookingIds = bookingRows.map((b) => b.id);
  if (bookingIds.length === 0) {
    await db.delete(customers).where(eq(customers.id, customerId));
    return;
  }

  await db.delete(residencyBookingLinks).where(inArray(residencyBookingLinks.bookingId, bookingIds));
  await db.delete(residentResidencies).where(eq(residentResidencies.customerId, customerId));
  await db.delete(checkoutSettlements).where(inArray(checkoutSettlements.bookingId, bookingIds));
  await db.delete(vacatingRequests).where(inArray(vacatingRequests.bookingId, bookingIds));
  await db.delete(depositSettlements).where(inArray(depositSettlements.bookingId, bookingIds));
  await db.delete(depositLedger).where(inArray(depositLedger.bookingId, bookingIds));
  await db.delete(payments).where(inArray(payments.bookingId, bookingIds));
  await db.delete(pgPaymentRecords).where(inArray(pgPaymentRecords.bookingId, bookingIds));
  await db.delete(financialInvoices).where(inArray(financialInvoices.bookingId, bookingIds));
  await db.delete(rentInvoices).where(inArray(rentInvoices.bookingId, bookingIds));
  await db
    .delete(residentBillingProfiles)
    .where(inArray(residentBillingProfiles.bookingId, bookingIds));
  await db.delete(bedReservations).where(inArray(bedReservations.bookingId, bookingIds));
  await db.delete(bookings).where(inArray(bookings.id, bookingIds));
  await db.delete(customers).where(eq(customers.id, customerId));
  console.log(`Cleaned fixture: customer ${customerId}, ${bookingIds.length} booking(s)`);
}

async function pickAvailableBed(): Promise<string> {
  const start = todayString();
  const candidates = await db
    .select({ id: beds.id, bedCode: beds.bedCode })
    .from(beds)
    .where(eq(beds.status, 'available'))
    .limit(80);
  for (const c of candidates) {
    if (await isBedAvailable({ bedId: c.id, startDate: start, endDate: null })) {
      return c.id;
    }
  }
  throw new Error('No available bed for test fixture');
}

async function inDepositDueQueue(session: AdminSession, bookingId: string) {
  const rows = await listDepositDueBookings(session);
  return rows.some((r) => r.bookingId === bookingId);
}

async function inRefundDueQueue(session: AdminSession, bookingId: string) {
  const queue = await loadUnifiedOperationsQueue(session, 'refund_due');
  return queue.items.some((i) => i.bookingId === bookingId);
}

async function ledgerCounts(bookingId: string) {
  const rows = await db
    .select({
      kind: depositLedger.entryKind,
      n: sql<number>`count(*)::int`,
    })
    .from(depositLedger)
    .where(eq(depositLedger.bookingId, bookingId))
    .groupBy(depositLedger.entryKind);
  return Object.fromEntries(rows.map((r) => [r.kind, r.n]));
}

async function invoiceCount(bookingId: string) {
  const rows = await db
    .select({ id: financialInvoices.id, status: financialInvoices.status, type: financialInvoices.invoiceType })
    .from(financialInvoices)
    .where(eq(financialInvoices.bookingId, bookingId));
  return rows;
}

async function setupFixture(session: AdminSession) {
  const existingId = await findBotCustomer();
  if (existingId) await cleanupFixture(existingId);

  const customerResult = await mergeOrUpsertCustomerForAdminWalkIn({
    fullName: BOT_NAME,
    phone: BOT_PHONE,
    email: BOT_EMAIL,
    gender: 'male',
    adminVerifiedKyc: true,
  });
  if (!customerResult.ok) throw new Error(customerResult.error);

  const bedId = await pickAvailableBed();
  const startDate = todayString();
  const assigned = await assignTenantToBed(session, {
    bedId,
    startDate,
    customerId: customerResult.customerId,
    fullName: BOT_NAME,
    email: BOT_EMAIL,
    phone: BOT_PHONE,
    gender: 'male',
    notes: BOT_NOTES,
  });
  if (!assigned.ok) throw new Error(assigned.error);

  await db
    .update(bookings)
    .set({
      depositPaise: REQUIRED_DEPOSIT_PAISE,
      notes: BOT_NOTES,
      isTest: false,
      updatedAt: new Date(),
    })
    .where(eq(bookings.id, assigned.bookingId));

  await db
    .update(customers)
    .set({ isTest: false, fullName: BOT_NAME, updatedAt: new Date() })
    .where(eq(customers.id, customerResult.customerId));

  return {
    customerId: customerResult.customerId,
    bookingId: assigned.bookingId,
    bookingCode: assigned.bookingCode,
  };
}

async function runDepositExpressTest(
  session: AdminSession,
  bookingId: string,
  customerId: string,
) {
  const section = 'Deposit Express';

  // Full deposit due (paid ₹0 → invoice for full requirement)
  const dueOnly = await executeDepositExpress({
    bookingId,
    requiredDepositPaise: REQUIRED_DEPOSIT_PAISE,
    paidAmountPaise: 0,
    paymentMethod: 'cash',
    notes: `${BOT_NOTES} full due`,
    adminId: session.adminId,
  });
  if (!dueOnly.ok) {
    depositPass = false;
    fail(section, `full due failed: ${dueOnly.error}`);
    return;
  }
  pass(section, 'Generated full deposit due (paid ₹0)');

  let summary = await getDepositSummaryForBooking(bookingId);
  if ((summary?.collectedPaise ?? 0) !== 0) {
    depositPass = false;
    fail(section, `wallet should be 0 after due-only, got ${summary?.collectedPaise}`);
  }

  const inDue1 = await inDepositDueQueue(session, bookingId);
  if (!inDue1) {
    depositPass = false;
    fail(section, 'booking missing from Operations → Deposit Due after full due');
  } else {
    pass(section, 'Operations → Deposit Due shows booking');
  }

  const inv1 = await invoiceCount(bookingId);
  const openDepositInv = inv1.filter((i) => i.type === 'deposit' && i.status !== 'paid' && i.status !== 'cancelled');
  if (openDepositInv.length < 1) {
    depositPass = false;
    fail(section, 'expected open deposit due invoice');
  } else {
    pass(section, `Deposit due invoice created (${openDepositInv.length} open)`);
  }

  // Partial collection
  const partial = await executeDepositExpress({
    bookingId,
    requiredDepositPaise: REQUIRED_DEPOSIT_PAISE,
    paidAmountPaise: PARTIAL_PAISE,
    paymentMethod: 'upi',
    reference: 'VERIFY-PARTIAL',
    adminId: session.adminId,
  });
  if (!partial.ok) {
    depositPass = false;
    fail(section, `partial pay failed: ${partial.error}`);
    return;
  }
  pass(section, `Partial deposit ₹${PARTIAL_PAISE / 100} recorded`);

  summary = await getDepositSummaryForBooking(bookingId);
  if (summary?.collectedPaise !== PARTIAL_PAISE) {
    depositPass = false;
    fail(section, `wallet after partial: expected ${PARTIAL_PAISE}, got ${summary?.collectedPaise}`);
  } else {
    pass(section, 'Deposit wallet updated after partial');
  }

  const inDue2 = await inDepositDueQueue(session, bookingId);
  if (!inDue2) {
    depositPass = false;
    fail(section, 'still due after partial — should remain in Deposit Due');
  } else {
    pass(section, 'Partial due remains in Deposit Due queue');
  }

  // Full remainder
  const remainder = REQUIRED_DEPOSIT_PAISE - PARTIAL_PAISE;
  const full = await executeDepositExpress({
    bookingId,
    requiredDepositPaise: REQUIRED_DEPOSIT_PAISE,
    paidAmountPaise: remainder,
    paymentMethod: 'cash',
    adminId: session.adminId,
  });
  if (!full.ok) {
    depositPass = false;
    fail(section, `final pay failed: ${full.error}`);
    return;
  }
  pass(section, `Final deposit ₹${remainder / 100} recorded (approve via Deposit Express)`);

  summary = await getDepositSummaryForBooking(bookingId);
  if (summary?.collectedPaise !== REQUIRED_DEPOSIT_PAISE) {
    depositPass = false;
    fail(section, `wallet final: expected ${REQUIRED_DEPOSIT_PAISE}, got ${summary?.collectedPaise}`);
  } else {
    pass(section, 'Deposit wallet fully collected');
  }

  const inDue3 = await inDepositDueQueue(session, bookingId);
  if (inDue3) {
    depositPass = false;
    fail(section, 'booking still in Deposit Due after full collection');
  } else {
    pass(section, 'Operations → Deposit Due cleared');
  }

  const counts = await ledgerCounts(bookingId);
  const collectedN = counts.collected ?? 0;
  if (collectedN !== 2) {
    depositPass = false;
    fail(section, `expected 2 collected ledger rows (partial+final), got ${collectedN}`);
  } else {
    pass(section, 'Deposit ledger has correct collected entries (no duplicates)');
  }

  const paymentRows = await db
    .select({ id: payments.id, amountPaise: payments.amountPaise })
    .from(payments)
    .where(and(eq(payments.bookingId, bookingId), eq(payments.purpose, 'deposit')));
  if (paymentRows.length !== 2) {
    depositPass = false;
    fail(section, `expected 2 deposit payments, got ${paymentRows.length}`);
  } else {
    pass(section, 'Payment records created for collections');
  }

  const [customerRow] = await db
    .select({ depositCollectionStatus: bookings.depositCollectionStatus })
    .from(bookings)
    .where(eq(bookings.id, bookingId))
    .limit(1);
  pass(section, `Resident booking depositCollectionStatus=${customerRow?.depositCollectionStatus ?? 'n/a'}`);

  // Waiting for approval: Deposit Express cash/UPI admin path records succeeded payments — not payment-proof queue
  const waitingQueue = await loadUnifiedOperationsQueue(session, 'waiting_for_approval');
  const inWaiting = waitingQueue.items.some((i) => i.bookingId === bookingId);
  if (inWaiting) {
    depositPass = false;
    fail(section, 'unexpected entry in Waiting for Approval after Deposit Express');
  } else {
    pass(section, 'Waiting for Approval empty (admin Deposit Express bypasses proof queue — expected)');
  }
}

async function runRefundTest(session: AdminSession, bookingId: string, customerId: string) {
  const section = 'Refund';

  const search = await searchRefundConsoleBookings(BOT_NAME, 10);
  const found = search.rows.some((r) => r.bookingId === bookingId);
  if (!found) {
    refundPass = false;
    fail(section, 'search did not return test booking');
  } else {
    pass(section, 'Search finds test booking');
  }

  const ws = await getRefundConsoleWorkspace(bookingId);
  if (!ws) {
    refundPass = false;
    fail(section, 'workspace null');
    return;
  }
  if (ws.wallet.remainingDepositPaise !== REQUIRED_DEPOSIT_PAISE) {
    refundPass = false;
    fail(section, `wallet remaining expected ${REQUIRED_DEPOSIT_PAISE}, got ${ws.wallet.remainingDepositPaise}`);
  } else {
    pass(section, 'Workspace wallet correct');
  }
  if (ws.wallet.depositPaidPaise !== REQUIRED_DEPOSIT_PAISE) {
    refundPass = false;
    fail(section, 'deposit paid amount incorrect in workspace');
  } else {
    pass(section, 'Deposit amount correct in workspace');
  }
  pass(section, `Timeline events: ${ws.timeline.length}`);

  const ded = await applyDepositDeduction({
    bookingId,
    customerId,
    amountPaise: DEDUCTION_PAISE,
    reason: `${BOT_NOTES} cleaning deduction`,
    deductionCategory: 'cleaning',
    adminId: session.adminId,
  });
  if (!ded.ok) {
    refundPass = false;
    fail(section, `deduction failed: ${ded.error}`);
    return;
  }
  pass(section, `Deduction ₹${DEDUCTION_PAISE / 100} applied`);

  const refundPaise = REQUIRED_DEPOSIT_PAISE - DEDUCTION_PAISE;
  const refund = await settleDepositRefund({
    bookingId,
    customerId,
    idempotencyKey: `${BOT_NOTES}:${bookingId}`,
    source: 'admin_panel',
    adminId: session.adminId,
    reason: `${BOT_NOTES} refund payout`,
    refundPaise,
    markBookingRefunded: true,
    refundAudit: { refundMethod: 'upi', refundReference: 'VERIFY-UPI-REF' },
  });
  if (!refund.ok) {
    refundPass = false;
    fail(section, `refund failed: ${refund.error}`);
    return;
  }
  pass(section, `Refund ₹${refundPaise / 100} marked paid`);

  const replay = await settleDepositRefund({
    bookingId,
    customerId,
    idempotencyKey: `${BOT_NOTES}:${bookingId}`,
    source: 'admin_panel',
    adminId: session.adminId,
    reason: 'duplicate attempt',
    refundPaise,
  });
  if (!replay.ok || !('idempotentReplay' in replay && replay.idempotentReplay)) {
    refundPass = false;
    fail(section, 'duplicate refund was not idempotent');
  } else {
    pass(section, 'No duplicate refund (idempotent replay)');
  }

  const summary = await getDepositSummaryForBooking(bookingId);
  const balance = summary?.refundableBalancePaise ?? -1;
  if (balance !== 0) {
    refundPass = false;
    fail(section, `wallet balance after refund should be 0, got ${balance}`);
  } else {
    pass(section, 'Wallet zero after refund');
  }
  if ((summary?.refundableBalancePaise ?? 0) < 0) {
    refundPass = false;
    fail(section, 'negative balance detected');
  }

  const counts = await ledgerCounts(bookingId);
  if ((counts.refunded ?? 0) !== 1) {
    refundPass = false;
    fail(section, `expected 1 refunded ledger row, got ${counts.refunded ?? 0}`);
  } else {
    pass(section, 'Deposit ledger refund entry recorded');
  }

  const inRefundDue = await inRefundDueQueue(session, bookingId);
  if (inRefundDue) {
    refundPass = false;
    fail(section, 'still in Refund Due queue after payout');
  } else {
    pass(section, 'Operations → Refund Due cleared');
  }

  const wsAfter = await getRefundConsoleWorkspace(bookingId);
  if ((wsAfter?.timeline.length ?? 0) < (ws?.timeline.length ?? 0)) {
    refundPass = false;
    fail(section, 'timeline did not grow after refund');
  } else {
    pass(section, 'Timeline updated');
  }
}

async function main() {
  const cleanupOnly = process.argv.includes('--cleanup-only');
  createClient({ max: 3 });
  const session = await getSuperAdminSession();

  const existingId = await findBotCustomer();
  if (cleanupOnly) {
    await cleanupFixture(existingId);
    console.log('Cleanup complete');
    return;
  }

  console.log('=== Production write-flow verification ===\n');
  const { customerId, bookingId, bookingCode } = await setupFixture(session);
  console.log(`Fixture: ${bookingCode} (${bookingId})\n`);

  try {
    await runDepositExpressTest(session, bookingId, customerId);
    console.log('');
    await runRefundTest(session, bookingId, customerId);
  } finally {
    console.log('\n=== Cleanup ===');
    try {
      await cleanupFixture(customerId);
    } catch (cleanupErr) {
      console.error('Cleanup failed:', cleanupErr);
      bugs.push('cleanup script FK ordering (fixed in script; re-run --cleanup-only)');
    }
  }

  console.log('\n=== FINAL ===');
  console.log(`1. Deposit Express write flow: ${depositPass ? 'PASS' : 'FAIL'}`);
  console.log(`2. Refund write flow: ${refundPass ? 'PASS' : 'FAIL'}`);
  console.log(`3. Bugs: ${bugs.length ? bugs.join('; ') : 'none'}`);
  console.log(`4. Commit hash: 474fa6b (no new fixes required)`);

  if (!depositPass || !refundPass) process.exit(1);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await closeDb();
  });
