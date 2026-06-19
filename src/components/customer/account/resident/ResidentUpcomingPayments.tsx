import Link from 'next/link';
import { formatDate, paiseToInr } from '@/src/lib/format';
import { ACCOUNT_SURFACE } from '@/src/components/customer/accountStyles';

export type UpcomingPaymentRow = {
  key: string;
  label: string;
  amountPaise: number;
  dueDate: string | null;
  href: string | null;
  status: string;
};

export function ResidentUpcomingPayments({ rows }: { rows: UpcomingPaymentRow[] }) {
  if (rows.length === 0) {
    return (
      <section className={`${ACCOUNT_SURFACE} p-5`}>
        <h2 className="text-base font-semibold text-zinc-900">Upcoming payments</h2>
        <p className="mt-2 text-sm text-zinc-600">No bills waiting right now. New rent bills appear on the 1st of each month.</p>
      </section>
    );
  }

  return (
    <section className={`${ACCOUNT_SURFACE} p-5`}>
      <h2 className="text-base font-semibold text-zinc-900">Upcoming payments</h2>
      <p className="mt-1 text-sm text-zinc-600">What you owe soon — tap Pay to open the payment page.</p>
      <ul className="mt-4 divide-y divide-zinc-200">
        {rows.slice(0, 5).map((row) => (
          <li key={row.key} className="flex flex-wrap items-center justify-between gap-2 py-3 first:pt-0">
            <div>
              <p className="text-sm font-medium text-zinc-900">{row.label}</p>
              <p className="text-xs text-zinc-500">
                {row.dueDate ? `Due ${formatDate(row.dueDate)}` : 'Due soon'} · {row.status}
              </p>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-sm font-semibold tabular-nums text-zinc-900">
                {paiseToInr(row.amountPaise)}
              </span>
              {row.href ? (
                <Link
                  href={row.href}
                  className="inline-flex min-h-[44px] items-center rounded-lg bg-[#FF5A1F] px-3 py-2 text-xs font-semibold text-white hover:brightness-110"
                >
                  Pay
                </Link>
              ) : null}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
