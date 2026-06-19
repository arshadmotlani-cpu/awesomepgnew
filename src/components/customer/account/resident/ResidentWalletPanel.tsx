import Link from 'next/link';
import { paiseToInr } from '@/src/lib/format';
import { ACCOUNT_SURFACE } from '@/src/components/customer/accountStyles';
import { GlossaryTip } from '@/src/components/customer/account/resident/GlossaryTip';
import type { ResidentFinancialSummary } from '@/src/lib/billing/residentFinancialTypes';
import type { DepositCreditSummary } from '@/src/services/depositCredit';
import { residentTabHref } from '@/src/lib/accountNavigation';

export function ResidentWalletSummary({
  financialSummary,
  wallet,
  refundStatusLabel,
}: {
  financialSummary: ResidentFinancialSummary;
  wallet: DepositCreditSummary;
  refundStatusLabel?: string | null;
}) {
  return (
    <section className={`${ACCOUNT_SURFACE} p-5`}>
      <header className="mb-4">
        <h2 className="text-base font-semibold text-zinc-900">Balance summary</h2>
        <p className="mt-1 text-sm text-zinc-600">
          Money you owe, money held for you, and deposit credit.
        </p>
      </header>
      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Amount due" value={paiseToInr(financialSummary.totals.outstandingPaise)} accent="due" />
        <Stat
          label="Deposit held"
          value={paiseToInr(wallet.totalHeldPaise)}
        />
        <Stat
          label="Available credit"
          value={paiseToInr(wallet.availableCreditPaise)}
          accent="credit"
        />
        <Stat
          label="Refund status"
          value={refundStatusLabel ?? 'Not started'}
          compact
        />
      </dl>
      <p className="mt-3 text-xs text-zinc-600">
        <GlossaryTip term="Security deposit money that can return to you after checkout, minus any charges.">
          Refundable deposit
        </GlossaryTip>
        : {paiseToInr(financialSummary.deposit.refundablePaise)}
      </p>
    </section>
  );
}

export function ResidentWalletPrimaryActions({
  amountDuePaise,
}: {
  amountDuePaise: number;
}) {
  return (
    <section className={`${ACCOUNT_SURFACE} p-5`}>
      <h2 className="text-base font-semibold text-zinc-900">What to do next</h2>
      <p className="mt-1 text-sm text-zinc-600">
        {amountDuePaise > 0
          ? 'Pay bills from the Payments tab. Deposit activity is listed below.'
          : 'You are caught up. Scroll for deposit history and refund status.'}
      </p>
      <div className="mt-4 flex flex-wrap gap-2">
        {amountDuePaise > 0 ? (
          <Link
            href={residentTabHref('payments')}
            className="inline-flex min-h-[44px] items-center justify-center rounded-lg bg-[#FF5A1F] px-4 py-2.5 text-sm font-semibold text-white hover:brightness-110"
          >
            Pay {paiseToInr(amountDuePaise)} due
          </Link>
        ) : null}
        <Link
          href={residentTabHref('home')}
          className="inline-flex min-h-[44px] items-center justify-center rounded-lg border border-zinc-300 bg-white px-4 py-2.5 text-sm font-medium text-zinc-800 hover:bg-zinc-50"
        >
          Back to home
        </Link>
      </div>
    </section>
  );
}

function Stat({
  label,
  value,
  accent,
  compact,
}: {
  label: string;
  value: string;
  accent?: 'due' | 'credit';
  compact?: boolean;
}) {
  const valueClass =
    accent === 'due' ? 'text-[#FF5A1F]' : accent === 'credit' ? 'text-emerald-700' : 'text-zinc-900';

  return (
    <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-3">
      <dt className="text-[10px] font-medium uppercase tracking-wide text-zinc-500">{label}</dt>
      <dd
        className={
          'mt-1 font-semibold ' +
          (compact ? 'text-sm leading-snug ' : 'text-lg tabular-nums ') +
          valueClass
        }
      >
        {value}
      </dd>
    </div>
  );
}
