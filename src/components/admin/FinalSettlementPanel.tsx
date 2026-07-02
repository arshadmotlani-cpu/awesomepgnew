import Link from 'next/link';
import { DepositWalletSummary } from '@/src/components/admin/DepositWalletSummary';
import { CheckoutRefundReceiptFromDetail } from '@/src/components/admin/checkout/CheckoutRefundReceipt';
import { paiseToInr } from '@/src/lib/format';
import { refundConsoleHref } from '@/src/lib/refund/refundConsoleLinks';
import type { DepositSummary } from '@/src/services/deposits';
import type { CheckoutSettlementDetail } from '@/src/services/checkoutSettlement';
import type { SettledTenancy } from '@/src/services/residentAdmin';

export function FinalSettlementPanel({
  customerName,
  settledTenancy,
  depositWallet,
  checkoutDetail,
}: {
  customerName: string;
  settledTenancy: SettledTenancy;
  depositWallet: DepositSummary | null;
  checkoutDetail?: CheckoutSettlementDetail | null;
}) {
  const collected = depositWallet?.collectedPaise ?? 0;
  const deducted = depositWallet?.deductedPaise ?? 0;
  const refunded = depositWallet?.refundedPaise ?? 0;
  const balance = depositWallet?.refundableBalancePaise ?? 0;

  return (
    <div className="mb-8 space-y-4">
      <div className="rounded-2xl border border-amber-400/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
        <p className="font-semibold">Vacated — final settlement only</p>
        <p className="mt-1 text-xs text-amber-200/90">
          {customerName} has completed checkout from {settledTenancy.pgName} · Room{' '}
          {settledTenancy.roomNumber} · {settledTenancy.bedCode}. Operational billing and
          collections are closed; only deposit settlement is shown below.
        </p>
      </div>

      {depositWallet ? (
        <DepositWalletSummary
          wallet={depositWallet}
          bookingId={settledTenancy.bookingId}
          title="Final deposit settlement"
        />
      ) : (
        <div className="rounded-2xl border border-white/10 bg-[#1A1F27] p-5">
          <p className="text-sm font-semibold text-white">Final deposit settlement</p>
          <p className="mt-2 text-xs text-apg-silver">No deposit ledger entries on file.</p>
        </div>
      )}

      {checkoutDetail ? (
        <CheckoutRefundReceiptFromDetail detail={checkoutDetail} compact />
      ) : null}

      <div className="rounded-2xl border border-white/10 bg-[#1A1F27] p-5">
        <p className="text-sm font-semibold text-white">Checkout summary</p>
        <dl className="mt-3 grid gap-2 text-xs sm:grid-cols-2">
          <div>
            <dt className="text-apg-silver">Booking</dt>
            <dd className="font-mono text-white">{settledTenancy.bookingCode}</dd>
          </div>
          {settledTenancy.vacatingDate ? (
            <div>
              <dt className="text-apg-silver">Vacating date</dt>
              <dd className="text-white">{settledTenancy.vacatingDate}</dd>
            </div>
          ) : null}
          {settledTenancy.deductionPaise != null && settledTenancy.deductionPaise > 0 ? (
            <div>
              <dt className="text-apg-silver">Vacating adjustment</dt>
              <dd className="text-rose-300">−{paiseToInr(settledTenancy.deductionPaise)}</dd>
            </div>
          ) : null}
          {settledTenancy.depositRefundPaise != null ? (
            <div>
              <dt className="text-apg-silver">Refund processed</dt>
              <dd className="text-emerald-300">{paiseToInr(settledTenancy.depositRefundPaise)}</dd>
            </div>
          ) : null}
          <div>
            <dt className="text-apg-silver">Collected</dt>
            <dd className="text-white">{paiseToInr(collected)}</dd>
          </div>
          <div>
            <dt className="text-apg-silver">Total deducted</dt>
            <dd className="text-white">{paiseToInr(deducted)}</dd>
          </div>
          <div>
            <dt className="text-apg-silver">Total refunded</dt>
            <dd className="text-white">{paiseToInr(refunded)}</dd>
          </div>
          <div>
            <dt className="text-apg-silver">Remaining balance</dt>
            <dd className="font-semibold text-emerald-300">{paiseToInr(balance)}</dd>
          </div>
        </dl>
        <div className="mt-4 flex flex-wrap gap-2">
          <Link
            href={refundConsoleHref(settledTenancy.bookingId)}
            className="rounded-lg bg-[#FF5A1F] px-3 py-2 text-xs font-semibold text-white hover:brightness-110"
          >
            Open Refund Console →
          </Link>
          <Link
            href={`/admin/deposits/${settledTenancy.bookingId}`}
            className="rounded-lg border border-white/10 px-3 py-2 text-xs text-apg-silver hover:text-white"
          >
            Deposit ledger →
          </Link>
        </div>
      </div>
    </div>
  );
}
