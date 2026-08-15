import { toIsoTimestampSafe } from '@/src/lib/dates';
import type { PaymentProofRejectionHistoryRow } from '@/src/services/paymentProofRejectionService';

/** Client-safe payment proof rejection row — ISO timestamps for RSC → client boundary. */
export type PaymentProofRejectionHistoryRowClient = Omit<
  PaymentProofRejectionHistoryRow,
  'rejectedAt' | 'createdAt' | 'updatedAt'
> & {
  rejectedAt: string;
  createdAt: string;
  updatedAt: string;
};

export function toClientPaymentProofRejectionHistoryRow(
  row: PaymentProofRejectionHistoryRow,
): PaymentProofRejectionHistoryRowClient {
  return {
    ...row,
    rejectedAt: toIsoTimestampSafe(row.rejectedAt) ?? '',
    createdAt: toIsoTimestampSafe(row.createdAt) ?? '',
    updatedAt: toIsoTimestampSafe(row.updatedAt) ?? '',
  };
}

export function toClientPaymentProofRejectionHistoryRows(
  rows: PaymentProofRejectionHistoryRow[],
): PaymentProofRejectionHistoryRowClient[] {
  return rows.map(toClientPaymentProofRejectionHistoryRow);
}
