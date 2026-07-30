import { and, eq, sql } from 'drizzle-orm';
import { hairDb } from '@/src/hair/db/client';
import {
  fyhCustomerTimeline,
  fyhCustomers,
  fyhInvoiceLineAttributions,
  fyhInvoiceLines,
  fyhInvoicePayments,
  fyhInvoices,
} from '@/src/hair/db/schema';
import { priceBasket } from '@/src/hair/domain/basket/engine';
import type { Basket } from '@/src/hair/domain/basket/types';
import { validateBasket } from '@/src/hair/domain/basket/validate';
import {
  creditWalletAdvance,
  postLedgerEntries,
  reconcileCustomerWalletCache,
} from '@/src/hair/domain/ledger/service';
import { computeRedemptions } from '@/src/hair/services/invoices';
import { applyPaidSideEffects, nextInvoiceNumberForTx } from '@/src/hair/services/invoices';
import type { PaymentSplitInput } from '@/src/hair/services/invoices';

export type CheckoutFromBasketInput = {
  basket: Basket;
  holdInvoiceId?: string | null;
  invoiceNumberOverride?: string | null;
  notes?: string | null;
  allowUnpaid?: boolean;
};

export type CheckoutFromBasketResult = {
  invoiceId: string;
  pricedGrandTotalPaise: number;
  amountPaidPaise: number;
  advancePaise: number;
  receivablePaise: number;
};

function paymentsFromBasket(basket: Basket): PaymentSplitInput[] {
  return basket.payments
    .filter((p) => p.amountPaise > 0)
    .map((p) => ({ method: p.method, amountPaise: p.amountPaise }));
}

function validateCheckoutPayments(
  grandTotalPaise: number,
  paySum: number,
  flags: Basket['flags'],
  allowUnpaid?: boolean,
): void {
  if (grandTotalPaise === 0) return;
  if (allowUnpaid && paySum === 0) return;
  if (flags.markFullDue) return;
  if (flags.markDue && paySum > 0 && paySum < grandTotalPaise) return;
  if (flags.markDue && paySum === 0) {
    throw new Error('Add a payment or use Mark Full Due');
  }
  if (paySum > grandTotalPaise && !flags.creditOverpayAsAdvance) {
    throw new Error('Overpayment requires marking remaining as advance (Cash/Card only)');
  }
  if (!flags.markDue && paySum < grandTotalPaise) {
    throw new Error(
      `Payment total must cover amount due (₹${(grandTotalPaise / 100).toFixed(2)}). Use Mark as Due for partial payment.`,
    );
  }
}

export async function enrichBasketWithRedemptions(basket: Basket): Promise<Basket> {
  const discountSubtotal = basket.lines
    .filter((l) => l.billableRef.type === 'service' || l.billableRef.type === 'product')
    .reduce((sum, l) => {
      const gross = l.snapshot.unitSellingPricePaise * l.quantity;
      const finalPaise = l.overridePricePaise ?? gross;
      return sum + finalPaise;
    }, 0);
  const serviceIds = basket.lines
    .filter((l) => l.billableRef.type === 'service')
    .map((l) => l.billableRef.id);
  const redemptions = await computeRedemptions(basket.customerId, discountSubtotal, serviceIds);
  return {
    ...basket,
    membershipDiscountPaise: redemptions.membershipDiscountPaise,
  };
}

export async function checkoutFromBasket(input: CheckoutFromBasketInput): Promise<CheckoutFromBasketResult> {
  const err = validateBasket(input.basket);
  if (err) throw new Error(err);

  const enriched = await enrichBasketWithRedemptions(input.basket);
  const priced = priceBasket(enriched);
  const payments = paymentsFromBasket(enriched);
  const paySum = payments.reduce((s, p) => s + p.amountPaise, 0);
  validateCheckoutPayments(priced.totals.grandTotalPaise, paySum, enriched.flags, input.allowUnpaid);

  const defaultStylist =
    priced.lines.find((l) => l.primaryStaffId)?.primaryStaffId ?? null;

  const invoiceId = await hairDb.transaction(async (tx) => {
    const db = tx as unknown as typeof hairDb;

    if (input.holdInvoiceId) {
      const [hold] = await db
        .select()
        .from(fyhInvoices)
        .where(
          and(eq(fyhInvoices.id, input.holdInvoiceId), eq(fyhInvoices.status, 'draft')),
        )
        .limit(1);
      if (!hold) throw new Error('Held bill not found');
      await db
        .delete(fyhInvoiceLineAttributions)
        .where(
          sql`${fyhInvoiceLineAttributions.invoiceLineId} in (select id from fyh_invoice_lines where invoice_id = ${input.holdInvoiceId})`,
        );
      await db.delete(fyhInvoiceLines).where(eq(fyhInvoiceLines.invoiceId, input.holdInvoiceId));
      await db.delete(fyhInvoicePayments).where(eq(fyhInvoicePayments.invoiceId, input.holdInvoiceId));
    }

    const invoiceNumber = input.holdInvoiceId
      ? await nextInvoiceNumberForTx(db)
      : await nextInvoiceNumberForTx(db);

    const finalNumber = invoiceNumber;

    const grandTotal = priced.totals.grandTotalPaise;
    const payApplied = Math.min(paySum, grandTotal);
    const isFullDue = enriched.flags.markFullDue && paySum === 0;
    const isPartial =
      enriched.flags.markDue && paySum > 0 && paySum < grandTotal;
    const paid = payApplied >= grandTotal && grandTotal > 0;
    const status =
      grandTotal === 0
        ? 'paid'
        : paid
          ? 'paid'
          : enriched.flags.markFullDue
            ? 'unpaid'
            : isPartial || payApplied > 0
              ? 'partial'
              : input.allowUnpaid
                ? 'unpaid'
                : 'unpaid';

    const invoiceValues = {
      invoiceNumber: input.holdInvoiceId ? finalNumber : finalNumber,
      customerId: enriched.customerId,
      appointmentId: null as string | null,
      source: 'quick_sale' as const,
      stylistId: defaultStylist,
      status,
      subtotalPaise: priced.totals.subtotalBasePaise,
      discountPaise: priced.totals.lineDiscountPaise,
      taxPaise: priced.totals.taxPaise,
      membershipRedemptionPaise: priced.totals.membershipDiscountPaise,
      packageRedemptionPaise: 0,
      walletRedemptionPaise: 0,
      giftCardRedemptionPaise: 0,
      tipPaise: 0,
      roundOffPaise: 0,
      grandTotalPaise: grandTotal,
      amountPaidPaise: payApplied,
      paidAt: status === 'paid' ? new Date() : null,
      notes: input.notes ?? null,
      posDraft: null,
    };

    let inv;
    if (input.holdInvoiceId) {
      [inv] = await db
        .update(fyhInvoices)
        .set({ ...invoiceValues, updatedAt: new Date() })
        .where(eq(fyhInvoices.id, input.holdInvoiceId))
        .returning();
    } else {
      [inv] = await db.insert(fyhInvoices).values(invoiceValues).returning();
    }
    if (!inv) throw new Error('Failed to create invoice');

    const insertedLines = await db
      .insert(fyhInvoiceLines)
      .values(
        priced.lines.map((line, sortOrder) => ({
          invoiceId: inv.id,
          kind: line.billableRef.type,
          serviceId: line.serviceId,
          productId: line.productId,
          packageId: line.packageId,
          membershipId: line.membershipId,
          staffId: line.primaryStaffId,
          nameSnapshot: line.snapshot.name,
          quantity: line.quantity,
          unitPricePaise: line.snapshot.unitSellingPricePaise,
          discountPaise: line.discountPaise,
          discountBps: line.discountBps,
          gstBps: line.snapshot.gstBps,
          taxPaise: line.gstPaise,
          lineTotalPaise: line.finalLinePaise,
          sortOrder,
        })),
      )
      .returning();

    for (let i = 0; i < insertedLines.length; i++) {
      const row = insertedLines[i]!;
      const attrLine = priced.lines[i]!;
      const lineAttrs = priced.attributions.filter((a) => a.lineId === attrLine.lineId);
      if (!lineAttrs.length) continue;
      await db.insert(fyhInvoiceLineAttributions).values(
        lineAttrs.map((a) => ({
          invoiceLineId: row.id,
          staffId: a.staffId,
          role: a.role,
          shareBps: a.shareBps,
          attributedNetPaise: a.attributedBasePaise,
          revenueMetric: a.revenueMetric,
        })),
      );
    }

    let remaining = grandTotal;
    for (const p of payments) {
      if (p.amountPaise <= 0) continue;
      const applied = Math.min(p.amountPaise, remaining);
      if (applied > 0) {
        await db.insert(fyhInvoicePayments).values({
          invoiceId: inv.id,
          method: p.method,
          amountPaise: applied,
          reference: null,
        });
        remaining -= applied;
      }
    }

    await postLedgerEntries(db, {
      customerId: enriched.customerId,
      invoiceId: inv.id,
      entries: priced.ledgerPlan,
    });

    const overpay = Math.max(0, paySum - grandTotal);
    if (overpay > 0 && enriched.flags.creditOverpayAsAdvance) {
      await creditWalletAdvance(db, {
        customerId: enriched.customerId,
        invoiceId: inv.id,
        amountPaise: overpay,
        reference: `Overpay on ${inv.invoiceNumber}`,
      });
    } else {
      await reconcileCustomerWalletCache(db, enriched.customerId);
    }

    await db.insert(fyhCustomerTimeline).values({
      customerId: enriched.customerId,
      eventType: 'bill',
      title: `Quick Sale · ${inv.invoiceNumber}`,
      body: `Total ₹${(grandTotal / 100).toFixed(2)} · paid ₹${(payApplied / 100).toFixed(2)}`,
      metadata: { invoiceId: inv.id, source: 'quick_sale' },
    });

    if (status === 'paid' || grandTotal === 0) {
      await applyPaidSideEffects(db, inv.id);
    }

    return inv.id;
  });

  const receivablePaise = Math.max(0, priced.totals.grandTotalPaise - Math.min(paySum, priced.totals.grandTotalPaise));
  const advancePaise =
    enriched.flags.creditOverpayAsAdvance
      ? Math.max(0, paySum - priced.totals.grandTotalPaise)
      : 0;

  return {
    invoiceId,
    pricedGrandTotalPaise: priced.totals.grandTotalPaise,
    amountPaidPaise: Math.min(paySum, priced.totals.grandTotalPaise),
    advancePaise,
    receivablePaise: enriched.flags.markFullDue || enriched.flags.markDue ? receivablePaise : 0,
  };
}
