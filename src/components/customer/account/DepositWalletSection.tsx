import { paiseToInr } from '@/src/lib/format';
import type { DepositCreditSummary } from '@/src/services/depositCredit';

export function DepositWalletSection({
  wallet,
  availableRefundPaise,
}: {
  wallet: DepositCreditSummary;
  /** Refundable balance after deductions — shown even when no payments are on file yet. */
  availableRefundPaise?: number;
}) {
  const refundPaise = availableRefundPaise ?? wallet.availableCreditPaise;

  return (
    <section className="rounded-xl border border-indigo-200 bg-indigo-50/60 p-5 ring-1 ring-indigo-100">
      <h3 className="text-sm font-semibold text-indigo-900">Security deposit balance</h3>
      <p className="mt-1 text-xs text-indigo-800/80">
        Money you paid as deposit — held until checkout, then refunded minus any charges.
      </p>
      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <WalletStat label="Current balance" value={paiseToInr(wallet.totalHeldPaise)} highlight />
        <WalletStat label="Available refund" value={paiseToInr(refundPaise)} highlight />
        <WalletStat label="Total paid in" value={paiseToInr(wallet.totalCollectedPaise)} />
        <WalletStat label="Used on charges" value={paiseToInr(wallet.totalUsedPaise)} />
        <WalletStat label="Sent back to you" value={paiseToInr(wallet.totalRefundedPaise)} />
        <WalletStat label="Deposit credit" value={paiseToInr(wallet.availableCreditPaise)} />
      </div>
    </section>
  );
}

function WalletStat({
  label,
  value,
  highlight = false,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <div
      className={
        'rounded-lg border px-3 py-2 ' +
        (highlight ? 'border-emerald-300 bg-emerald-50' : 'border-indigo-100 bg-white/80')
      }
    >
      <p className="text-[10px] font-medium uppercase tracking-wide text-zinc-500">{label}</p>
      <p
        className={
          'mt-0.5 text-base font-semibold tabular-nums ' +
          (highlight ? 'text-emerald-800' : 'text-zinc-900')
        }
      >
        {value}
      </p>
    </div>
  );
}
