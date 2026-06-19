import Link from 'next/link';
import { formatDate, paiseToInr } from '@/src/lib/format';
import type { PaymentDueRow } from '@/src/components/customer/account/resident/ResidentPaymentsPanel';

export function ResidentPaymentsNextBill({
  nextBill,
  totalDuePaise,
}: {
  nextBill: PaymentDueRow | null;
  totalDuePaise: number;
}) {
  if (!nextBill || totalDuePaise <= 0) {
    return (
      <section className="rounded-2xl border border-emerald-200 bg-gradient-to-br from-emerald-50 to-white p-6">
        <h2 className="text-xl font-bold text-zinc-900">Nothing due right now</h2>
        <p className="mt-1 text-sm text-zinc-600">New bills appear here when rent or electricity is ready to pay.</p>
      </section>
    );
  }

  return (
    <section className="rounded-2xl border border-[#FF5A1F]/30 bg-gradient-to-br from-orange-50 to-white p-6">
      <p className="text-xs font-semibold uppercase tracking-wide text-[#FF5A1F]">Pay this first</p>
      <h2 className="mt-1 text-3xl font-bold tabular-nums text-zinc-900">{paiseToInr(nextBill.amountPaise)}</h2>
      <p className="mt-1 text-sm text-zinc-700">{nextBill.label}</p>
      <p className="text-sm text-zinc-500">
        {nextBill.dueDate ? `Due ${formatDate(nextBill.dueDate)}` : 'Due soon'}
      </p>
      {nextBill.href ? (
        <Link
          href={nextBill.href}
          className="mt-5 inline-flex min-h-[52px] w-full items-center justify-center rounded-xl bg-[#FF5A1F] text-base font-semibold text-white hover:brightness-110 sm:w-auto sm:px-10"
        >
          Pay {paiseToInr(nextBill.amountPaise)}
        </Link>
      ) : null}
    </section>
  );
}
