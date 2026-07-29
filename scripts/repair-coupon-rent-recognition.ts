/**
 * Repair coupon checkout rent invoices that never reached status=paid
 * because mark-paid compared net principal to gross rent.
 *
 * Dry-run (default):
 *   npx tsx scripts/repair-coupon-rent-recognition.ts
 *
 * Apply:
 *   npx tsx scripts/repair-coupon-rent-recognition.ts --execute
 */
import { and, eq, gt, inArray, ne } from 'drizzle-orm';
import { createClient } from '../src/db/client';
import { bookings, payments, rentInvoices } from '../src/db/schema';
import { paiseToInr } from '../src/lib/format';
import { loadScriptEnv } from '../src/lib/scripts/loadScriptEnv';
import {
  computeRentDuePaise,
  resolveRentInvoicePaymentApplication,
} from '../src/services/rentInvoices';

loadScriptEnv();

type Candidate = {
  bookingId: string;
  bookingCode: string;
  paymentId: string;
  invoiceId: string;
  rentPaise: number;
  invoiceDiscountPaise: number;
  bookingDiscountPaise: number;
  paidPrincipalPaise: number;
  invoiceStatus: string;
  paymentPaidAt: Date | null;
  paymentCreatedAt: Date;
  effectiveDiscountPaise: number;
  rentDuePaise: number;
  wouldFullyPay: boolean;
};

async function main() {
  const execute = process.argv.includes('--execute');
  const { db, close } = createClient();

  try {
    const rows = await db
      .select({
        bookingId: bookings.id,
        bookingCode: bookings.bookingCode,
        bookingDiscountPaise: bookings.discountPaise,
        pricingSnapshot: bookings.pricingSnapshot,
        paymentId: payments.id,
        paymentPaidAt: payments.paidAt,
        paymentCreatedAt: payments.createdAt,
        invoiceId: rentInvoices.id,
        rentPaise: rentInvoices.rentPaise,
        invoiceDiscountPaise: rentInvoices.discountPaise,
        paidPrincipalPaise: rentInvoices.paidPrincipalPaise,
        invoiceStatus: rentInvoices.status,
      })
      .from(payments)
      .innerJoin(bookings, eq(bookings.id, payments.bookingId))
      .innerJoin(
        rentInvoices,
        and(eq(rentInvoices.bookingId, bookings.id), ne(rentInvoices.status, 'paid')),
      )
      .where(
        and(
          eq(payments.status, 'succeeded'),
          eq(payments.purpose, 'booking'),
          gt(bookings.discountPaise, 0),
          gt(rentInvoices.paidPrincipalPaise, 0),
          inArray(rentInvoices.status, ['pending', 'overdue', 'payment_in_progress']),
        ),
      );

    const candidates: Candidate[] = [];
    for (const row of rows) {
      const effectiveDiscountPaise = Math.max(
        row.invoiceDiscountPaise ?? 0,
        row.bookingDiscountPaise ?? 0,
      );
      const rentDuePaise = computeRentDuePaise(row.rentPaise, effectiveDiscountPaise);
      const applied = resolveRentInvoicePaymentApplication({
        principalPaise: row.paidPrincipalPaise,
        rentPaise: row.rentPaise,
        discountPaise: effectiveDiscountPaise,
      });
      if (!applied.fullyPaid) continue;
      candidates.push({
        bookingId: row.bookingId,
        bookingCode: row.bookingCode,
        paymentId: row.paymentId,
        invoiceId: row.invoiceId,
        rentPaise: row.rentPaise,
        invoiceDiscountPaise: row.invoiceDiscountPaise ?? 0,
        bookingDiscountPaise: row.bookingDiscountPaise ?? 0,
        paidPrincipalPaise: row.paidPrincipalPaise,
        invoiceStatus: row.invoiceStatus,
        paymentPaidAt: row.paymentPaidAt,
        paymentCreatedAt: row.paymentCreatedAt,
        effectiveDiscountPaise,
        rentDuePaise,
        wouldFullyPay: true,
      });
    }

    console.log('═'.repeat(72));
    console.log('COUPON RENT RECOGNITION REPAIR');
    console.log(`Mode: ${execute ? 'EXECUTE' : 'DRY-RUN'}`);
    console.log(`Candidates: ${candidates.length}`);
    console.log('═'.repeat(72));

    let repaired = 0;
    for (const c of candidates) {
      console.log(
        `  ${c.bookingCode} | invoice ${c.invoiceId.slice(0, 8)}… | status=${c.invoiceStatus} | ` +
          `gross ${paiseToInr(c.rentPaise)} − disc ${paiseToInr(c.effectiveDiscountPaise)} ` +
          `= due ${paiseToInr(c.rentDuePaise)} | paid_principal ${paiseToInr(c.paidPrincipalPaise)}`,
      );

      if (!execute) continue;

      const paidAt = c.paymentPaidAt ?? c.paymentCreatedAt;
      const snap = await db
        .select({ pricingSnapshot: bookings.pricingSnapshot })
        .from(bookings)
        .where(eq(bookings.id, c.bookingId))
        .limit(1);
      const promoCode =
        snap[0]?.pricingSnapshot?.appliedDiscount?.code ??
        snap[0]?.pricingSnapshot?.dateCoupon?.code ??
        null;

      await db
        .update(rentInvoices)
        .set({
          discountPaise: c.effectiveDiscountPaise,
          ...(promoCode ? { promoCode } : {}),
          status: 'paid',
          paymentId: c.paymentId,
          paidAt,
          paidPrincipalPaise: c.rentDuePaise,
          paidLateFeePaise: 0,
          lateFeeLockedPaise: 0,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(rentInvoices.id, c.invoiceId),
            inArray(rentInvoices.status, ['pending', 'overdue', 'payment_in_progress']),
          ),
        );

      try {
        const { syncRentInvoiceToUnified } = await import('../src/services/unifiedInvoices');
        await syncRentInvoiceToUnified(c.invoiceId);
      } catch (err) {
        console.warn(`    sync failed for ${c.invoiceId}:`, err);
      }
      repaired += 1;
    }

    console.log('');
    console.log(
      execute
        ? `Repaired ${repaired} invoice(s). Re-check admin Overview Today Rent / MTD.`
        : `Dry-run complete. Re-run with --execute to repair ${candidates.length} invoice(s).`,
    );
    console.log('═'.repeat(72));
    process.exit(0);
  } finally {
    await close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
