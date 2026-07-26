import { and, asc, eq } from 'drizzle-orm';
import { capitalDb } from '@/src/capital/db/client';
import {
  acAssets,
  acSellerPayments,
  acVehicleActivities,
  type SellerPaymentKind,
} from '@/src/capital/db/schema';
import type { CapitalDbClient } from '@/src/capital/lib/db/types';
import {
  remainingPurchaseFromSellerPayments,
  sumSellerPaymentsPaise,
  SELLER_PAYMENT_KIND_LABELS,
  SELLER_PAYMENT_INSTRUMENT_LABELS,
} from '@/src/capital/lib/threeLedgers';
import { postLedgerEntry } from '@/src/capital/services/ledger';
import { logActivity } from '@/src/capital/services/activity';
import { assertAssetMutable, recalculateAsset } from '@/src/capital/services/assets';

export type PaymentInstrument = 'cash' | 'upi' | 'neft' | 'rtgs' | 'cheque' | 'bank';

export type RecordSellerPaymentInput = {
  assetId: string;
  amountPaise: number;
  paidAt: string;
  instrument: PaymentInstrument;
  referenceNumber?: string | null;
  notes?: string | null;
  /** Force kind; otherwise derived from remaining. */
  kind?: SellerPaymentKind;
};

export async function listSellerPayments(assetId: string, db: CapitalDbClient = capitalDb) {
  return db
    .select()
    .from(acSellerPayments)
    .where(
      and(eq(acSellerPayments.assetId, assetId), eq(acSellerPayments.isReversed, false)),
    )
    .orderBy(asc(acSellerPayments.paidAt), asc(acSellerPayments.createdAt));
}

export async function sumSellerPaidPaise(assetId: string, db: CapitalDbClient = capitalDb) {
  const rows = await listSellerPayments(assetId, db);
  return sumSellerPaymentsPaise(rows);
}

/**
 * Record cash paid to the seller (Seller Payments ledger).
 * Tracks instrument (how paid) — not internal funding sources.
 * Projects a timeline activity for display compatibility.
 */
export async function recordSellerPayment(input: RecordSellerPaymentInput) {
  const amountPaise = Math.round(input.amountPaise);
  if (amountPaise <= 0) throw new Error('Payment amount must be positive');

  await assertAssetMutable(input.assetId);

  const [asset] = await capitalDb
    .select()
    .from(acAssets)
    .where(eq(acAssets.id, input.assetId))
    .limit(1);
  if (!asset) throw new Error('Asset not found');
  if (asset.purchasePricePaise <= 0) {
    throw new Error('Set purchase price before recording purchase payments');
  }

  const paid = await sumSellerPaidPaise(input.assetId);
  const remaining = remainingPurchaseFromSellerPayments(asset.purchasePricePaise, paid);
  if (remaining == null) {
    throw new Error('Set purchase price before recording purchase payments');
  }
  if (remaining <= 0) throw new Error('Purchase price is already fully paid');
  if (amountPaise > remaining) {
    throw new Error(
      `Payment exceeds remaining ₹${(remaining / 100).toLocaleString('en-IN')} toward purchase price`,
    );
  }

  const kind: SellerPaymentKind =
    input.kind ?? (amountPaise === remaining ? 'final' : 'purchase');

  return capitalDb.transaction(async (tx) => {
    const [payment] = await tx
      .insert(acSellerPayments)
      .values({
        assetId: input.assetId,
        amountPaise,
        paidAt: input.paidAt,
        instrument: input.instrument,
        kind,
        referenceNumber: input.referenceNumber ?? null,
        notes: input.notes ?? null,
      })
      .returning();

    const activityType =
      kind === 'token'
        ? 'token_paid'
        : kind === 'final'
          ? 'final_purchase_payment'
          : 'purchase_payment';

    const [activity] = await tx
      .insert(acVehicleActivities)
      .values({
        assetId: input.assetId,
        activityType,
        activityAt: input.paidAt,
        amountPaise,
        title: SELLER_PAYMENT_KIND_LABELS[kind],
        notes: input.notes ?? null,
        metadata: {
          fromSellerPaymentLedger: true,
          sellerPaymentId: payment.id,
          instrument: input.instrument,
        },
      })
      .returning();

    const entry = await postLedgerEntry(
      {
        entryType: 'adjustment',
        direction: 'debit',
        amountPaise,
        assetId: input.assetId,
        sourceTable: 'ac_seller_payments',
        sourceId: payment.id,
        description: `${SELLER_PAYMENT_KIND_LABELS[kind]} (${SELLER_PAYMENT_INSTRUMENT_LABELS[input.instrument]}): ₹${(amountPaise / 100).toLocaleString('en-IN')}`,
      },
      tx,
    );

    await tx
      .update(acSellerPayments)
      .set({
        activityId: activity.id,
        ledgerEntryId: entry.id,
        updatedAt: new Date(),
      })
      .where(eq(acSellerPayments.id, payment.id));

    await tx
      .update(acVehicleActivities)
      .set({ ledgerEntryId: entry.id, updatedAt: new Date() })
      .where(eq(acVehicleActivities.id, activity.id));

    await logActivity(
      {
        action: 'seller_payment_recorded',
        entityType: 'asset',
        entityId: input.assetId,
        afterState: {
          sellerPaymentId: payment.id,
          kind,
          instrument: input.instrument,
          amountPaise,
          remainingAfterPaise: remaining - amountPaise,
        },
      },
      tx,
    );

    await recalculateAsset(input.assetId, tx);
    return payment;
  });
}

export async function recordPurchasePayment(input: {
  assetId: string;
  amountPaise: number;
  paidAt: string;
  instrument?: PaymentInstrument;
  referenceNumber?: string | null;
  notes?: string | null;
}) {
  return recordSellerPayment({
    assetId: input.assetId,
    amountPaise: input.amountPaise,
    paidAt: input.paidAt,
    instrument: input.instrument ?? 'bank',
    referenceNumber: input.referenceNumber,
    notes: input.notes,
  });
}
