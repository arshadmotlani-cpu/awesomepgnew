import Link from 'next/link';
import {
  GenerateInvoicesButton,
  MarkOverdueButton,
} from '@/src/components/admin/RentBillingActions';
import { CollectionsHistoricalPaymentPanel } from '@/src/components/admin/CollectionsHistoricalPaymentPanel';
import { CollectionsMonthPicker } from '@/src/components/admin/CollectionsMonthPicker';
import { moduleHref } from '@/src/lib/admin/navigation';

function ModuleBadge({ kind }: { kind: 'invoice' | 'payment' }) {
  const isInvoice = kind === 'invoice';
  return (
    <span
      className={
        'inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ' +
        (isInvoice
          ? 'bg-sky-500/15 text-sky-300 ring-1 ring-sky-500/30'
          : 'bg-emerald-500/15 text-emerald-300 ring-1 ring-emerald-500/30')
      }
    >
      {isInvoice ? 'Invoice' : 'Payment'}
    </span>
  );
}

export function CollectionsBillingTools({
  billingMonth,
  canGenerateRent,
}: {
  billingMonth: string;
  canGenerateRent: boolean;
}) {
  const monthLabel = billingMonth.slice(0, 7);

  return (
    <div className="mb-6 space-y-6">
      <section className="rounded-xl border border-white/10 bg-[#1A1F27] p-5">
        <div className="flex flex-wrap items-center gap-2">
          <ModuleBadge kind="invoice" />
          <h2 className="text-sm font-semibold text-white">Create bills (system)</h2>
        </div>
        <p className="mt-2 max-w-3xl text-sm text-apg-silver">
          Creates <strong className="text-white">bills</strong> — amounts residents owe. No money is
          recorded here. Rent is per <strong className="text-white">resident</strong>; electricity
          is per <strong className="text-white">room</strong> then split automatically.
        </p>

        <div className="mt-5 grid gap-4 lg:grid-cols-2">
          <div className="rounded-xl border border-white/10 bg-[#12161D]/60 p-4">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-sky-300">
              A · Rent bills
            </h3>
            <p className="mt-2 text-xs leading-relaxed text-apg-silver">
              Created automatically per <strong className="text-white">resident</strong> from
              move-in date and billing month.
            </p>
            <ul className="mt-3 space-y-1 text-xs text-apg-silver">
              <li>· One bill per resident per month</li>
              <li>· Based on booking move-in — not per room</li>
            </ul>
            <div className="mt-4 space-y-3">
              <CollectionsMonthPicker billingMonth={billingMonth} />
              {canGenerateRent ? (
                <div className="flex flex-wrap items-end gap-2">
                  <GenerateInvoicesButton billingMonth={billingMonth} forceAll />
                  <MarkOverdueButton />
                </div>
              ) : (
                <p className="text-xs text-apg-silver">
                  Rent generation requires <span className="text-white">rent:write</span> permission.
                </p>
              )}
            </div>
            <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
              <Link
                href={`/admin/revenue/billing?tab=billing&month=${monthLabel}-01`}
                className="inline-flex items-center justify-center rounded-lg border border-white/10 px-3 py-2 text-xs font-medium text-apg-silver hover:text-white"
              >
                View bills needing attention →
              </Link>
              <Link
                href={`/admin/revenue/billing?tab=rent`}
                className="inline-flex items-center justify-center rounded-lg border border-white/10 px-3 py-2 text-xs font-medium text-apg-silver hover:text-white"
              >
                All rent bills →
              </Link>
            </div>
            <p className="mt-3 text-[11px] text-apg-silver">
              Undo mistakes from <strong className="text-white">Advanced tools</strong> below for{' '}
              <span className="text-white">{monthLabel}</span>.
            </p>
          </div>

          <div className="rounded-xl border border-white/10 bg-[#12161D]/60 p-4">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-sky-300">
              B · Electricity bills
            </h3>
            <p className="mt-2 text-xs leading-relaxed text-apg-silver">
              Always <strong className="text-white">room-based</strong>. Enter a meter reading for
              one room; the system splits cost among active residents in that room and creates
              individual tenant invoices.
            </p>
            <ol className="mt-3 list-decimal space-y-1 pl-4 text-xs text-apg-silver">
              <li>Select room</li>
              <li>Enter meter reading</li>
              <li>System splits &amp; creates per-resident bills</li>
            </ol>
            <div className="mt-4 flex flex-col gap-2">
              <Link
                href={`/admin/electricity/new?month=${monthLabel}`}
                className="inline-flex items-center justify-center rounded-lg bg-[#FF5A1F] px-3 py-2 text-xs font-semibold text-white hover:brightness-110"
              >
                Create electricity invoice →
              </Link>
              <Link
                href="/admin/electricity"
                className="inline-flex items-center justify-center rounded-lg border border-white/10 px-3 py-2 text-xs font-medium text-apg-silver hover:text-white"
              >
                View room meter history →
              </Link>
              <Link
                href={`/admin/revenue/billing?tab=electricity&month=${monthLabel}-01`}
                className="inline-flex items-center justify-center rounded-lg border border-white/10 px-3 py-2 text-xs font-medium text-apg-silver hover:text-white"
              >
                Electricity bill queue →
              </Link>
            </div>
          </div>
        </div>
      </section>

      <section className="rounded-xl border border-white/10 bg-[#1A1F27] p-5">
        <div className="flex flex-wrap items-center gap-2">
          <ModuleBadge kind="payment" />
          <h2 className="text-sm font-semibold text-white">Payments &amp; collections (manual)</h2>
        </div>
        <p className="mt-2 max-w-3xl text-sm text-apg-silver">
          Records <strong className="text-white">payments</strong> — money already received. Does not
          create bills or change billing cycles.
        </p>

        <div className="mt-5 grid gap-4 lg:grid-cols-2">
          <div className="rounded-xl border border-white/10 bg-[#12161D]/60 p-4">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-emerald-300">
              A · Deposits
            </h3>
            <p className="mt-2 text-xs leading-relaxed text-apg-silver">
              View deposit balances per <strong className="text-white">tenant</strong>. Record offline
              deposit payments and process refunds — separate from invoice generation.
            </p>
            <div className="mt-4 flex flex-col gap-2">
              <Link
                href={moduleHref('deposits')}
                className="inline-flex items-center justify-center rounded-lg bg-[#FF5A1F] px-3 py-2 text-xs font-semibold text-white hover:brightness-110"
              >
                View deposit balances →
              </Link>
              <Link
                href="/admin/deposits/add"
                className="inline-flex items-center justify-center rounded-lg border border-white/10 px-3 py-2 text-xs font-medium text-apg-silver hover:text-white"
              >
                Record offline deposit payment →
              </Link>
              <Link
                href="/admin/deposits?filter=due"
                className="inline-flex items-center justify-center rounded-lg border border-white/10 px-3 py-2 text-xs font-medium text-apg-silver hover:text-white"
              >
                Unpaid security deposits →
              </Link>
            </div>
          </div>

          <CollectionsHistoricalPaymentPanel />
        </div>
      </section>
    </div>
  );
}
