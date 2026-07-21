import Link from 'next/link';

type Props = {
  billingMonth: string;
  tab: string;
  needsBillCount: number;
  unpaidRentCount: number;
  unpaidElectricityCount: number;
  roomsMissingElectricity: number;
  isMonthEnd: boolean;
};

export function BillingWorkflowGuide({
  billingMonth,
  tab,
  needsBillCount,
  unpaidRentCount,
  unpaidElectricityCount,
  roomsMissingElectricity,
  isMonthEnd,
}: Props) {
  const monthLabel = billingMonth.slice(0, 7);
  const monthParam = billingMonth;

  return (
    <section className="mb-6 rounded-2xl border border-[#FF5A1F]/25 bg-[#FF5A1F]/5 p-5">
      <h2 className="text-base font-semibold text-white">How billing works</h2>
      <p className="mt-1 text-sm text-apg-silver">
        Rent is created automatically on each resident&apos;s billing anniversary (daily scheduler).
        Enter room meters at month-end for electricity — never bulk-generate rent from this page.
      </p>

      <ol className="mt-4 grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
        <li className="rounded-xl border border-white/10 bg-[#1A1F27] p-3">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-[#FF5A1F]">1 · Rent</p>
          <p className="mt-1 text-apg-silver">
            Auto-generated on billing anniversary.{' '}
            {needsBillCount > 0 ? (
              <strong className="text-amber-200">{needsBillCount} exception(s) in queue</strong>
            ) : (
              <span className="text-emerald-300">Scheduler up to date</span>
            )}
          </p>
          <Link
            href={`/admin/billing?tab=dashboard`}
            className="mt-2 inline-block text-xs font-semibold text-[#FF5A1F] hover:underline"
          >
            View upcoming schedule →
          </Link>
        </li>

        <li className="rounded-xl border border-white/10 bg-[#1A1F27] p-3">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-[#FF5A1F]">
            2 · Electricity
          </p>
          <p className="mt-1 text-apg-silver">
            You enter meter units per room — not automatic.{' '}
            {roomsMissingElectricity > 0 ? (
              <strong className="text-amber-200">{roomsMissingElectricity} room(s) not billed</strong>
            ) : (
              <span className="text-emerald-300">All rooms billed for {monthLabel}</span>
            )}
          </p>
          <Link
            href={`/admin/electricity/new?month=${monthLabel}`}
            className="mt-2 inline-block text-xs font-semibold text-[#FF5A1F] hover:underline"
          >
            Create electricity bill →
          </Link>
        </li>

        <li className="rounded-xl border border-white/10 bg-[#1A1F27] p-3">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-[#FF5A1F]">3 · Send</p>
          <p className="mt-1 text-apg-silver">
            Use <strong className="text-white">Send all</strong> on Rent or Electricity tabs — opens
            WhatsApp with payment link for each resident.
          </p>
          <Link
            href={`/admin/revenue/billing?tab=${tab === 'electricity' ? 'electricity' : 'rent'}&month=${monthParam}`}
            className="mt-2 inline-block text-xs font-semibold text-[#FF5A1F] hover:underline"
          >
            Open {tab === 'electricity' ? 'electricity' : 'rent'} send tab →
          </Link>
        </li>

        <li className="rounded-xl border border-white/10 bg-[#1A1F27] p-3">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-[#FF5A1F]">
            4 · Check-ins
          </p>
          <p className="mt-1 text-apg-silver">
            See everyone&apos;s move-in date on the Residents list. Change check-in on a resident
            profile if needed.
          </p>
          <Link
            href="/admin/residents"
            className="mt-2 inline-block text-xs font-semibold text-[#FF5A1F] hover:underline"
          >
            Residents list →
          </Link>
        </li>
      </ol>

      {isMonthEnd && roomsMissingElectricity > 0 ? (
        <p className="mt-4 rounded-lg border border-amber-400/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-100">
          <strong>Month-end:</strong> {roomsMissingElectricity} room
          {roomsMissingElectricity === 1 ? '' : 's'} still need an electricity bill for {monthLabel}.
          Go to{' '}
          <Link href={`/admin/electricity/new?month=${monthLabel}`} className="font-semibold underline">
            Create electricity bill
          </Link>{' '}
          — previous meter reading is pre-filled (0 if first time).
        </p>
      ) : null}

      {unpaidElectricityCount > 0 && tab !== 'electricity' ? (
        <p className="mt-3 text-xs text-apg-silver">
          {unpaidElectricityCount} unpaid electricity bill
          {unpaidElectricityCount === 1 ? '' : 's'} ready to send —{' '}
          <Link
            href={`/admin/revenue/billing?tab=electricity&month=${monthParam}`}
            className="font-semibold text-[#FF5A1F] hover:underline"
          >
            Electricity tab
          </Link>
        </p>
      ) : null}
    </section>
  );
}
