import Link from 'next/link';
import { ApgCard } from '@/src/components/customer/design-system';
import { StatusChip } from '@/src/components/customer/design-system';

export function ResidentPaymentSuccess({
  amountLabel,
  checklist,
  backHref,
}: {
  amountLabel: string;
  checklist: string[];
  backHref: string;
}) {
  return (
    <ApgCard tier="account" className="p-5">
      <div className="flex flex-wrap items-center gap-2">
        <StatusChip status="paid" />
        <span className="text-sm font-medium text-zinc-600">Payment submitted</span>
      </div>
      <h2 className="mt-3 text-xl font-bold text-zinc-900">Payment received</h2>
      <p className="mt-1 text-sm text-zinc-600">
        We got your payment proof for <span className="font-semibold text-zinc-900">{amountLabel}</span>.
        Your bill status will update after verification.
      </p>

      <section className="mt-5 rounded-lg border border-zinc-200 bg-zinc-50 p-4">
        <h3 className="text-sm font-semibold text-zinc-900">What happens next</h3>
        <ul className="mt-2 space-y-2">
          {checklist.map((item) => (
            <li key={item} className="flex gap-2 text-sm text-zinc-600">
              <span className="text-emerald-600" aria-hidden>
                ✓
              </span>
              {item}
            </li>
          ))}
        </ul>
      </section>

      <Link
        href={backHref}
        className="mt-5 inline-flex min-h-[44px] w-full items-center justify-center rounded-xl bg-[#FF5A1F] px-4 py-2.5 text-sm font-semibold text-white hover:brightness-110"
      >
        Back to payments
      </Link>
    </ApgCard>
  );
}
