import Link from 'next/link';
import type { CheckoutSettlementDetail } from '@/src/services/checkoutSettlement';

const PRIMARY =
  'inline-flex items-center justify-center rounded-lg bg-[#FF5A1F] px-4 py-2.5 text-sm font-semibold text-white hover:brightness-110';
const SECONDARY =
  'inline-flex items-center justify-center rounded-lg border border-white/15 px-4 py-2.5 text-sm font-medium text-white hover:bg-white/5';

export function CheckoutSettlementPrimaryActions({ detail }: { detail: CheckoutSettlementDetail }) {
  const zeroRefund = detail.preview.finalRefundPaise <= 0;
  const electricityReady =
    detail.preview.electricityDeductionPaise > 0 ||
    detail.meterPhotoMissing ||
    Boolean(detail.electricityMeterPhotoUrl) ||
    detail.electricityUseAverage;
  const canApprove =
    detail.status === 'awaiting_admin_review' ||
    (zeroRefund && detail.status === 'awaiting_resident_details' && electricityReady);
  const canMarkPaid = detail.status === 'refund_pending' && !zeroRefund;

  return (
    <section className="mb-8 rounded-2xl border border-white/10 bg-[#1A1F27] p-5">
      <h2 className="text-base font-semibold text-white">What to do next</h2>
      <p className="mt-1 text-sm text-apg-silver">
        {canApprove
          ? zeroRefund
            ? 'Deductions consume the full deposit — complete checkout to apply ledger entries and release the bed.'
            : 'Check electricity and notice fee below, then approve the final refund.'
          : canMarkPaid
            ? 'Send the refund to the resident’s UPI ID, then mark it paid with the transaction reference.'
            : detail.status === 'awaiting_resident_details'
              ? zeroRefund
                ? 'Electricity must be settled, then use Complete checkout — no UPI required when refund is ₹0.'
                : 'Waiting for the resident to submit UPI details and meter information.'
              : 'This checkout is finished or waiting on another step.'}
      </p>
      <div className="mt-4 flex flex-wrap gap-2">
        {canApprove ? (
          <a href="#approve-settlement" className={PRIMARY}>
            {zeroRefund ? 'Complete checkout' : 'Approve refund amount'}
          </a>
        ) : null}
        {canMarkPaid ? (
          <a href="#mark-refund-paid" className={PRIMARY}>
            Mark refund sent
          </a>
        ) : null}
        <Link href={`/admin/residents/${detail.customerId}`} className={SECONDARY}>
          Resident profile
        </Link>
        <Link href={`/admin/deposits/${detail.bookingId}`} className={SECONDARY}>
          Security deposit
        </Link>
        <Link href="/admin/vacating?status=approved" className={SECONDARY}>
          Move-out requests
        </Link>
      </div>
    </section>
  );
}
