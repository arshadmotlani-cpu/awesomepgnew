/**
 * Canonical payment settlement orchestrator — all approval entrypoints route
 * final state mutation through this service so payment, source invoice, and
 * financial_invoices mirror stay consistent in one transaction.
 */
import type { ProviderName } from '@/src/services/payments';
import type { AnyPaymentProvider } from '@/src/services/bookingLifecycle';
import {
  recordElectricityPaymentSuccess,
  type RecordElectricityPaymentSuccessInput,
} from '@/src/services/electricityBilling';
import {
  recordRentPaymentSuccess,
  type RecordRentPaymentSuccessInput,
} from '@/src/services/rentInvoices';

export type ApprovedPaymentPurpose = 'electricity' | 'rent' | 'extension' | 'booking' | 'deposit';

export type ApplyApprovedPaymentAtomicInput = {
  purpose: ApprovedPaymentPurpose;
  invoiceId: string;
  provider: ProviderName;
  offlineProvider?: AnyPaymentProvider;
  providerPaymentId: string;
  providerOrderId?: string | null;
  amountPaise: number;
  paidAt?: Date;
  rawPayload?: unknown;
  historical?: boolean;
};

export type ApplyApprovedPaymentAtomicResult =
  | {
      ok: true;
      paymentId: string;
      invoiceId: string;
      stateChanged: boolean;
      purpose: ApprovedPaymentPurpose;
    }
  | { ok: false; reason: string; purpose: ApprovedPaymentPurpose };

function basePaymentFields(
  input: ApplyApprovedPaymentAtomicInput,
): Pick<
  RecordElectricityPaymentSuccessInput,
  | 'provider'
  | 'offlineProvider'
  | 'providerPaymentId'
  | 'providerOrderId'
  | 'amountPaise'
  | 'paidAt'
  | 'rawPayload'
  | 'historical'
> {
  return {
    provider: input.provider,
    offlineProvider: input.offlineProvider,
    providerPaymentId: input.providerPaymentId,
    providerOrderId: input.providerOrderId,
    amountPaise: input.amountPaise,
    paidAt: input.paidAt,
    rawPayload: input.rawPayload,
    historical: input.historical,
  };
}

/**
 * Single entry point for approved payment settlement across invoice types.
 * Electricity and rent include in-transaction financial_invoices mirror sync.
 */
export async function applyApprovedPaymentAtomic(
  input: ApplyApprovedPaymentAtomicInput,
): Promise<ApplyApprovedPaymentAtomicResult> {
  const common = basePaymentFields(input);

  switch (input.purpose) {
    case 'electricity': {
      const result = await recordElectricityPaymentSuccess({
        ...common,
        invoiceId: input.invoiceId,
      });
      if (!result.ok) {
        return { ok: false, reason: result.reason, purpose: input.purpose };
      }
      return {
        ok: true,
        paymentId: result.paymentId,
        invoiceId: result.invoiceId,
        stateChanged: result.stateChanged,
        purpose: input.purpose,
      };
    }
    case 'rent':
    case 'extension':
    case 'booking':
    case 'deposit': {
      const rentInput: RecordRentPaymentSuccessInput = {
        ...common,
        invoiceId: input.invoiceId,
      };
      const result = await recordRentPaymentSuccess(rentInput);
      if (!result.ok) {
        return { ok: false, reason: result.reason, purpose: input.purpose };
      }
      return {
        ok: true,
        paymentId: result.paymentId,
        invoiceId: result.invoiceId,
        stateChanged: result.stateChanged,
        purpose: input.purpose,
      };
    }
    default: {
      const _exhaustive: never = input.purpose;
      return { ok: false, reason: `unsupported purpose: ${_exhaustive}`, purpose: input.purpose };
    }
  }
}
