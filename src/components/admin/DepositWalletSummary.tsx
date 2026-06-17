import { paiseToInr } from '@/src/lib/format';
import type { DepositSummary } from '@/src/services/deposits';

export function DepositWalletSummary({
  wallet,
  bookingId,
  compact = false,
  title = 'Deposit wallet',
}: {
  wallet: DepositSummary;
  bookingId?: string;
  compact?: boolean;
  title?: string;
}) {
  const balancePaise = wallet.refundableBalancePaise;

  return (
    <section
      className={
        compact
          ? 'rounded-xl border border-sky-500/25 bg-sky-500/5 p-3'
          : 'rounded-xl border border-sky-500/30 bg-sky-500/10 p-4 ring-1 ring-sky-500/15'
      }
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="text-xs font-semibold uppercase tracking-wide text-sky-200">
            {title}
          </h3>
          <p className="mt-0.5 text-[10px] text-apg-silver">
            Computed from deposit_ledger — collected − deducted − refunded
          </p>
        </div>
        {bookingId ? (
          <a
            href={`/admin/deposits/${bookingId}`}
            className="text-[10px] font-medium text-sky-300 hover:underline"
          >
            Full ledger →
          </a>
        ) : null}
      </div>

      <dl className={`mt-3 grid gap-3 ${compact ? 'grid-cols-2 sm:grid-cols-4' : 'sm:grid-cols-2 lg:grid-cols-4'}`}>
        <WalletStat label="Total collected" value={paiseToInr(wallet.collectedPaise)} />
        <WalletStat label="Total deducted" value={paiseToInr(wallet.deductedPaise)} />
        <WalletStat label="Total refunded" value={paiseToInr(wallet.refundedPaise)} />
        <WalletStat
          label="Current balance"
          value={paiseToInr(balancePaise)}
          highlight
        />
      </dl>
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
          ? 'border-emerald-400/40 bg-emerald-500/10'
          : 'border-white/10 bg-black/20')
      }
    >
      <dt className="text-[10px] font-medium uppercase tracking-wide text-apg-silver">{label}</dt>
      <dd
        className={
          'mt-0.5 text-base font-semibold tabular-nums ' +
          (highlight ? 'text-emerald-300' : 'text-white')
        }
      >
        {value}
      </dd>
    </div>
  );
}
