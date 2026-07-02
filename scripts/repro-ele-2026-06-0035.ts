/* eslint-disable no-console */
/**
 * Reproduce electricity payment proof approval for ELE-2026-06-0035 (Angatra Mandal).
 * Usage: npx tsx scripts/repro-ele-2026-06-0035.ts
 */
import { readFileSync } from 'node:fs';
import { and, eq, ilike } from 'drizzle-orm';

const INVOICE_NUMBER = 'ELE-2026-06-0035';

function loadDatabaseUrl(): void {
  if (process.env.DATABASE_URL?.trim()) return;
  for (const path of ['.env.prod.live', '.env.bak', '.env.off', '.env.local']) {
    try {
      const raw = readFileSync(path, 'utf8');
      const match = raw.match(/^DATABASE_URL=(.+)$/m);
      const value = match?.[1]?.trim().replace(/^["']|["']$/g, '');
      if (value) {
        process.env.DATABASE_URL = value;
        console.log(`Using DATABASE_URL from ${path}`);
        return;
      }
    } catch {
      // next
    }
  }
}

loadDatabaseUrl();

const session = {
  kind: 'admin' as const,
  sessionId: 'repro',
  adminId: '00000000-0000-4000-8000-000000000001',
  email: 'repro@test',
  fullName: 'Repro',
  role: 'super_admin' as const,
  pgScope: [] as string[],
  mustChangePassword: false,
  rememberMe: false,
  expiresAt: new Date(Date.now() + 86_400_000),
};

async function main() {
  const { db } = await import('../src/db/client');
  const {
    customers,
    electricityBills,
    electricityInvoices,
    floors,
    payments,
    pgs,
    rooms,
  } = await import('../src/db/schema');
  const { approveElectricityPaymentProof } = await import('../src/services/meterElectricity');
  const { getNextPendingPaymentReviewKey, listPendingPaymentReviews } = await import(
    '../src/services/paymentProofQueue'
  );

  const [row] = await db
    .select({
      invoiceId: electricityInvoices.id,
      invoiceNumber: electricityInvoices.invoiceNumber,
      status: electricityInvoices.status,
      amountPaise: electricityInvoices.amountPaise,
      paidPaise: electricityInvoices.paidPaise,
      paymentProofUrl: electricityInvoices.paymentProofUrl,
      paymentId: electricityInvoices.paymentId,
      customerId: electricityInvoices.customerId,
      bookingId: electricityInvoices.bookingId,
      billingMonth: electricityInvoices.billingMonth,
      customerName: customers.fullName,
      roomNumber: rooms.roomNumber,
      pgId: electricityBills.pgId,
      pgName: pgs.name,
    })
    .from(electricityInvoices)
    .innerJoin(customers, eq(customers.id, electricityInvoices.customerId))
    .innerJoin(electricityBills, eq(electricityBills.id, electricityInvoices.electricityBillId))
    .innerJoin(rooms, eq(rooms.id, electricityBills.roomId))
    .innerJoin(floors, eq(floors.id, rooms.floorId))
    .innerJoin(pgs, eq(pgs.id, floors.pgId))
    .where(eq(electricityInvoices.invoiceNumber, INVOICE_NUMBER))
    .limit(1);

  if (!row) {
    console.error(`Invoice ${INVOICE_NUMBER} not found`);
    process.exit(1);
  }

  console.log('\n=== Invoice snapshot ===');
  console.log(JSON.stringify(row, null, 2));

  const reviewKey = `elec-${row.invoiceId}`;
  const queueBefore = await listPendingPaymentReviews(session);
  const inQueue = queueBefore.find((i) => i.key === reviewKey);
  console.log('\n=== Queue before ===');
  console.log('in queue:', Boolean(inQueue));
  if (inQueue) {
    console.log('review item:', {
      key: inQueue.key,
      amountPaise: inQueue.amountPaise,
      invoiceAmountPaise: inQueue.invoiceAmountPaise,
      status: row.status,
    });
  }

  if (row.status === 'paid') {
    console.log('\nInvoice already paid — checking payments...');
    if (row.paymentId) {
      const [pay] = await db
        .select()
        .from(payments)
        .where(eq(payments.id, row.paymentId))
        .limit(1);
      console.log('payment:', pay);
    }
  }

  if (row.status !== 'pending' || !row.paymentProofUrl) {
    console.log('\nSkipping approval — not pending with proof');
    process.exit(0);
  }

  console.log('\n=== Step 1: approveElectricityPaymentProof ===');
  try {
    const approve = await approveElectricityPaymentProof(session, row.invoiceId);
    console.log('approve result:', approve);
  } catch (err) {
    console.error('\n!!! THREW in approveElectricityPaymentProof !!!');
    console.error(err);
    if (err instanceof Error) {
      console.error('stack:', err.stack);
    }
    process.exit(1);
  }

  const [after] = await db
    .select({
      status: electricityInvoices.status,
      paidPaise: electricityInvoices.paidPaise,
      paymentId: electricityInvoices.paymentId,
    })
    .from(electricityInvoices)
    .where(eq(electricityInvoices.id, row.invoiceId))
    .limit(1);
  console.log('\n=== Invoice after approval ===');
  console.log(after);

  console.log('\n=== Step 2: getNextPendingPaymentReviewKey (server action tail) ===');
  try {
    const nextKey = await getNextPendingPaymentReviewKey(session, reviewKey);
    console.log('nextKey:', nextKey);
  } catch (err) {
    console.error('\n!!! THREW in getNextPendingPaymentReviewKey !!!');
    console.error(err);
    if (err instanceof Error) {
      console.error('stack:', err.stack);
    }
    process.exit(1);
  }

  console.log('\n=== Step 3: listPendingPaymentReviews (post-approval refresh) ===');
  try {
    const queueAfter = await listPendingPaymentReviews(session);
    console.log('pending count:', queueAfter.length);
  } catch (err) {
    console.error('\n!!! THREW in listPendingPaymentReviews !!!');
    console.error(err);
    if (err instanceof Error) {
      console.error('stack:', err.stack);
    }
    process.exit(1);
  }

  await db.$client.end?.();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
