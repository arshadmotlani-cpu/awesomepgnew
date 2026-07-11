import { and, eq, sum } from 'drizzle-orm';
import { capitalDb } from '@/src/capital/db/client';
import { acAssets, acPaymentsReceived } from '@/src/capital/db/schema';
import { postLedgerEntry, reverseAllSourceLedger } from './ledger';
import { logActivity } from './activity';
import { assertAssetMutable, recalculateAsset } from './assets';
import { assertAssetAcceptsPayments } from '@/src/capital/lib/assetLifecycle';

export type CreatePaymentInput = {
  assetId?: string;
  receivedAt: string;
  amountPaise: number;
  paymentType: string;
  capitalReturnedPaise: number;
  profitPaise: number;
  adjustmentPaise: number;
  paymentMode: string;
  referenceNumber?: string;
  notes?: string;
};

async function validatePaymentAllocation(input: CreatePaymentInput) {
  if (input.amountPaise <= 0) throw new Error('Payment amount must be positive');

  const splitTotal =
    input.capitalReturnedPaise + input.profitPaise + input.adjustmentPaise;
  if (splitTotal !== input.amountPaise) {
    throw new Error('Payment split must equal total amount');
  }

  if (input.paymentType === 'refund') {
    if (input.capitalReturnedPaise !== 0 || input.profitPaise !== 0) {
      throw new Error('Refunds must be recorded entirely in the adjustment field');
    }
    if (input.adjustmentPaise !== input.amountPaise) {
      throw new Error('Refund amount must equal total payment amount');
    }
    return;
  }

  if (input.paymentType === 'capital_returned' && input.profitPaise + input.adjustmentPaise > 0) {
    throw new Error('Capital return payments must allocate to capital only');
  }
  if (input.paymentType === 'profit' && input.capitalReturnedPaise + input.adjustmentPaise > 0) {
    throw new Error('Profit payments must allocate to profit only');
  }

  if (!input.assetId) return;

  const [asset] = await capitalDb.select().from(acAssets).where(eq(acAssets.id, input.assetId)).limit(1);
  if (!asset) throw new Error('Asset not found');

  const [sums] = await capitalDb
    .select({
      capital: sum(acPaymentsReceived.capitalReturnedPaise),
      profit: sum(acPaymentsReceived.profitPaise),
    })
    .from(acPaymentsReceived)
    .where(and(eq(acPaymentsReceived.assetId, input.assetId), eq(acPaymentsReceived.isReversed, false)));

  const existingCapital = Number(sums?.capital ?? 0);
  const existingProfit = Number(sums?.profit ?? 0);

  if (existingCapital + input.capitalReturnedPaise > asset.totalInvestmentPaise) {
    throw new Error('Capital returned would exceed total investment for this asset');
  }

  if (
    asset.mySharePaise != null &&
    existingProfit + input.profitPaise > Math.max(0, asset.mySharePaise)
  ) {
    throw new Error('Profit received would exceed your share of profit for this asset');
  }
  if (
    asset.mySharePaise == null &&
    asset.profitPaise != null &&
    existingProfit + input.profitPaise > Math.max(0, asset.profitPaise)
  ) {
    throw new Error('Profit received would exceed gross profit for this asset');
  }
}

export async function createPayment(input: CreatePaymentInput) {
  await validatePaymentAllocation(input);

  const isRefund = input.paymentType === 'refund';

  return capitalDb.transaction(async (tx) => {
    if (input.assetId) await assertAssetAcceptsPayments(input.assetId, tx);

    const [row] = await tx
      .insert(acPaymentsReceived)
      .values({
        assetId: input.assetId ?? null,
        receivedAt: input.receivedAt,
        amountPaise: input.amountPaise,
        paymentType: input.paymentType as typeof acPaymentsReceived.$inferInsert.paymentType,
        capitalReturnedPaise: input.capitalReturnedPaise,
        profitPaise: input.profitPaise,
        adjustmentPaise: input.adjustmentPaise,
        paymentMode: input.paymentMode as typeof acPaymentsReceived.$inferInsert.paymentMode,
        referenceNumber: input.referenceNumber,
        notes: input.notes,
      })
      .returning();

    if (isRefund) {
      await postLedgerEntry(
        {
          entryType: 'reversal',
          direction: 'debit',
          amountPaise: input.amountPaise,
          assetId: input.assetId ?? null,
          sourceTable: 'ac_payments_received',
          sourceId: row.id,
          description: `Refund issued: ₹${(input.amountPaise / 100).toLocaleString('en-IN')}`,
          metadata: { paymentType: 'refund' },
        },
        tx,
      );
    } else {
      if (input.capitalReturnedPaise > 0) {
        await postLedgerEntry(
          {
            entryType: 'payment_received',
            direction: 'credit',
            amountPaise: input.capitalReturnedPaise,
            assetId: input.assetId ?? null,
            sourceTable: 'ac_payments_received',
            sourceId: row.id,
            description: `Capital returned: ₹${(input.capitalReturnedPaise / 100).toLocaleString('en-IN')}`,
            metadata: { portion: 'capital' },
          },
          tx,
        );
      }
      if (input.profitPaise > 0) {
        await postLedgerEntry(
          {
            entryType: 'payment_received',
            direction: 'credit',
            amountPaise: input.profitPaise,
            assetId: input.assetId ?? null,
            sourceTable: 'ac_payments_received',
            sourceId: row.id,
            description: `Profit received: ₹${(input.profitPaise / 100).toLocaleString('en-IN')}`,
            metadata: { portion: 'profit' },
          },
          tx,
        );
      }
      if (input.adjustmentPaise > 0) {
        await postLedgerEntry(
          {
            entryType: 'payment_received',
            direction: 'credit',
            amountPaise: input.adjustmentPaise,
            assetId: input.assetId ?? null,
            sourceTable: 'ac_payments_received',
            sourceId: row.id,
            description: `Payment adjustment: ₹${(input.adjustmentPaise / 100).toLocaleString('en-IN')}`,
            metadata: { portion: 'adjustment' },
          },
          tx,
        );
      }
    }

    if (input.assetId) await recalculateAsset(input.assetId, tx);

    await logActivity(
      {
        action: 'payment_created',
        entityType: 'payment',
        entityId: row.id,
        afterState: { amountPaise: input.amountPaise, paymentType: input.paymentType },
      },
      tx,
    );

    return row;
  });
}

export async function reversePayment(paymentId: string, reason: string) {
  return capitalDb.transaction(async (tx) => {
    const [payment] = await tx
      .update(acPaymentsReceived)
      .set({ isReversed: true })
      .where(and(eq(acPaymentsReceived.id, paymentId), eq(acPaymentsReceived.isReversed, false)))
      .returning();

    if (!payment) throw new Error('Payment not found or already reversed');

    await reverseAllSourceLedger(
      'ac_payments_received',
      paymentId,
      `Payment reversal: ${reason}`,
      tx,
    );

    if (payment.assetId) await recalculateAsset(payment.assetId, tx);
    await logActivity(
      {
        action: 'payment_reversed',
        entityType: 'payment',
        entityId: paymentId,
        afterState: { reason },
      },
      tx,
    );
  });
}

export async function listPayments(assetId?: string) {
  if (assetId) {
    return capitalDb
      .select()
      .from(acPaymentsReceived)
      .where(and(eq(acPaymentsReceived.assetId, assetId), eq(acPaymentsReceived.isReversed, false)))
      .orderBy(acPaymentsReceived.receivedAt);
  }
  return capitalDb
    .select()
    .from(acPaymentsReceived)
    .where(eq(acPaymentsReceived.isReversed, false))
    .orderBy(acPaymentsReceived.receivedAt);
}
