import { eq } from 'drizzle-orm';
import { db } from '@/src/db/client';
import {
  electricityInvoices,
  paymentLinks,
  pgPaymentRecords,
  rentInvoices,
  stayExtensions,
} from '@/src/db/schema';
import type { PendingPaymentReviewItem } from '@/src/lib/operations/paymentReviewTypes';

export async function loadTransactionRefForPaymentReview(
  kind: PendingPaymentReviewItem['kind'],
  entityId: string,
): Promise<string | null> {
  switch (kind) {
    case 'qr': {
      const [row] = await db
        .select({ ref: pgPaymentRecords.transactionRef })
        .from(pgPaymentRecords)
        .where(eq(pgPaymentRecords.id, entityId))
        .limit(1);
      return row?.ref ?? null;
    }
    case 'rent': {
      const [row] = await db
        .select({ ref: rentInvoices.paymentProofTransactionRef })
        .from(rentInvoices)
        .where(eq(rentInvoices.id, entityId))
        .limit(1);
      return row?.ref ?? null;
    }
    case 'electricity': {
      const [row] = await db
        .select({ ref: electricityInvoices.paymentProofTransactionRef })
        .from(electricityInvoices)
        .where(eq(electricityInvoices.id, entityId))
        .limit(1);
      return row?.ref ?? null;
    }
    case 'extension': {
      const [row] = await db
        .select({ ref: stayExtensions.paymentProofTransactionRef })
        .from(stayExtensions)
        .where(eq(stayExtensions.id, entityId))
        .limit(1);
      return row?.ref ?? null;
    }
    case 'deposit_link': {
      const [row] = await db
        .select({ ref: paymentLinks.paymentProofTransactionRef })
        .from(paymentLinks)
        .where(eq(paymentLinks.id, entityId))
        .limit(1);
      return row?.ref ?? null;
    }
    default:
      return null;
  }
}
