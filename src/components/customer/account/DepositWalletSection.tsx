import { paiseToInr } from '@/src/lib/format';
import type { DepositCreditSummary } from '@/src/services/depositCredit';

export function DepositWalletSection({ wallet }: { wallet: DepositCreditSummary }) {
  return (
    <section className="rounded-xl border border-indigo-200 bg-indigo-50/60 p-5 ring-1 ring-indigo-100">
      <h3 className="text-sm font-semibold uppercase tracking-wide text-indigo-900">
        Deposit wallet / credit
      </h3>
      <p className="mt-1 text-xs text-indigo-800/80">
        Your deposit is held as credit — only the difference is charged on rebooking or extension.
      </p>
      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <WalletStat label="Total paid" value={paiseToInr(wallet.totalCollectedPaise)} />
        <WalletStat label="Currently held" value={paiseToInr(wallet.totalHeldPaise)} />
        <WalletStat label="Used" value={paiseToInr(wallet.totalUsedPaise)} />
        <WalletStat label="Refunded" value={paiseToInr(wallet.totalRefundedPaise)} />
        <WalletStat
          label="Available credit"
          value={paiseToInr(wallet.availableCreditPaise)}
          highlight
        />
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
        (highlight
          ? 'border-emerald-300 bg-emerald-50'
          : 'border-indigo-100 bg-white/80')
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
