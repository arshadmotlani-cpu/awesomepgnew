import Link from 'next/link';
import { formatDate, paiseToInr, titleCase } from '@/src/lib/format';
import type { PaymentDueRow } from '@/src/components/customer/account/resident/ResidentPaymentsPanel';

/** Prominent electricity alert — residents must see this without scrolling or searching. */
export function ResidentElectricityDueBanner({ row }: { row: PaymentDueRow }) {
  if (!row.href) return null;

  const monthPart = row.label.replace(/^Electricity ·\s*/, '');

  return (
    <section
      className="rounded-2xl border-2 border-amber-400 bg-gradient-to-br from-amber-50 to-orange-50 p-4 shadow-sm ring-1 ring-amber-200/80"
      role="alert"
      aria-label="Electricity bill due"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-bold uppercase tracking-wide text-amber-800">Electricity due</p>
          <p className="mt-1 text-base font-semibold text-zinc-900">
            You have an electricity bill · {monthPart}
          </p>
          <p className="mt-1 text-sm text-zinc-600">
            Status: {titleCase(row.status)}
            {row.dueDate ? ` · Due ${formatDate(row.dueDate)}` : ''}
          </p>
        </div>
        <p className="text-2xl font-bold tabular-nums text-[#FF5A1F]">{paiseToInr(row.amountPaise)}</p>
      </div>
      <Link
        href={row.href}
        className="mt-4 inline-flex min-h-[48px] w-full items-center justify-center rounded-xl bg-[#FF5A1F] px-4 py-2.5 text-sm font-semibold text-white hover:brightness-110 sm:w-auto"
      >
        Pay electricity now
      </Link>
    </section>
  );
}
