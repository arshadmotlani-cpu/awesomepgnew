import Link from 'next/link';
import {
  GenerateInvoicesButton,
  MarkOverdueButton,
} from '@/src/components/admin/RentBillingActions';
import { CollectionsMonthPicker } from '@/src/components/admin/CollectionsMonthPicker';
import { moduleHref } from '@/src/lib/admin/navigation';

export function CollectionsBillingTools({
  billingMonth,
  canGenerateRent,
}: {
  billingMonth: string;
  canGenerateRent: boolean;
}) {
  const monthLabel = billingMonth.slice(0, 7);

  return (
    <section className="mb-6 rounded-xl border border-white/10 bg-[#1A1F27] p-5">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-sm font-semibold text-white">Billing tools</h2>
          <p className="mt-1 max-w-2xl text-sm text-apg-silver">
            Generate monthly rent for all eligible tenants, create electricity bills per room, and
            manage security deposits — all from one place.
          </p>
        </div>
      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-3">
        <div className="rounded-xl border border-white/10 bg-[#12161D]/60 p-4">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-apg-orange">
            Rent — all tenants
          </h3>
          <p className="mt-2 text-xs leading-relaxed text-apg-silver">
            Creates one rent invoice per active open-ended / monthly booking for the selected month.
            Safe to run again — skips bookings that already have an invoice.
          </p>
          <div className="mt-4 space-y-3">
            <CollectionsMonthPicker billingMonth={billingMonth} />
            {canGenerateRent ? (
              <div className="flex flex-wrap items-end gap-2">
                <GenerateInvoicesButton billingMonth={billingMonth} />
                <MarkOverdueButton />
              </div>
            ) : (
              <p className="text-xs text-apg-silver">
                Rent generation requires <span className="text-white">rent:write</span> permission.
              </p>
            )}
          </div>
          <p className="mt-3 text-[11px] text-apg-silver">
            Cron also runs on the 1st if configured. Generated for{' '}
            <span className="text-white">{monthLabel}</span>.
          </p>
        </div>

        <div className="rounded-xl border border-white/10 bg-[#12161D]/60 p-4">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-apg-orange">
            Electricity — per room
          </h3>
          <p className="mt-2 text-xs leading-relaxed text-apg-silver">
            Enter meter readings for one room; the bill splits across active residents in that room
            for the billing month.
          </p>
          <div className="mt-4 flex flex-col gap-2">
            <Link
              href={`/admin/electricity/new?month=${monthLabel}`}
              className="inline-flex items-center justify-center rounded-lg bg-[#FF5A1F] px-3 py-2 text-xs font-semibold text-white hover:brightness-110"
            >
              New electricity bill →
            </Link>
            <Link
              href={moduleHref('pgs')}
              className="inline-flex items-center justify-center rounded-lg border border-white/10 px-3 py-2 text-xs font-medium text-apg-silver hover:text-white"
            >
              PG rooms &amp; meters →
            </Link>
          </div>
        </div>

        <div className="rounded-xl border border-white/10 bg-[#12161D]/60 p-4">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-apg-orange">
            Deposits
          </h3>
          <p className="mt-2 text-xs leading-relaxed text-apg-silver">
            Deposits are set at booking checkout. Record offline payments, view balances, and
            process refunds here.
          </p>
          <div className="mt-4 flex flex-col gap-2">
            <Link
              href={moduleHref('deposits')}
              className="inline-flex items-center justify-center rounded-lg bg-[#FF5A1F] px-3 py-2 text-xs font-semibold text-white hover:brightness-110"
            >
              All deposits →
            </Link>
            <Link
              href="/admin/deposits/add"
              className="inline-flex items-center justify-center rounded-lg border border-white/10 px-3 py-2 text-xs font-medium text-apg-silver hover:text-white"
            >
              Add deposit payment →
            </Link>
            <Link
              href="/admin/deposits?filter=due"
              className="inline-flex items-center justify-center rounded-lg border border-white/10 px-3 py-2 text-xs font-medium text-apg-silver hover:text-white"
            >
              Outstanding deposits →
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
