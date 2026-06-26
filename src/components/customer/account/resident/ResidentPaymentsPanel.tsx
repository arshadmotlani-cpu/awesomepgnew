import Link from 'next/link';
import { formatDate, paiseToInr, titleCase } from '@/src/lib/format';
import { ACCOUNT_SURFACE } from '@/src/components/customer/accountStyles';
import { residentTabHref } from '@/src/lib/accountNavigation';

export type PaymentDueRow = {
  key: string;
  label: string;
  amountPaise: number;
  dueDate: string | null;
  href: string | null;
  status: string;
  invoiceNumber?: string;
};

export function ResidentPaymentsSummary({
  totalDuePaise,
  billCount,
  nextDueDate,
}: {
  totalDuePaise: number;
  billCount: number;
  nextDueDate: string | null;
}) {
  return (
    <section className={`${ACCOUNT_SURFACE} p-5`}>
      <h2 className="text-base font-semibold text-zinc-900">Payments summary</h2>
      <p className="mt-1 text-sm text-zinc-600">What you owe right now and when it is due.</p>
      <dl className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-3">
          <dt className="text-[10px] font-medium uppercase text-zinc-500">Amount due</dt>
          <dd className="mt-1 text-xl font-semibold tabular-nums text-[#FF5A1F]">
            {paiseToInr(totalDuePaise)}
          </dd>
        </div>
        <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-3">
          <dt className="text-[10px] font-medium uppercase text-zinc-500">Bills waiting</dt>
          <dd className="mt-1 text-xl font-semibold text-zinc-900">{billCount}</dd>
        </div>
        <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-3 col-span-2 sm:col-span-1">
          <dt className="text-[10px] font-medium uppercase text-zinc-500">Next due date</dt>
          <dd className="mt-1 text-sm font-semibold text-zinc-900">
            {nextDueDate ? formatDate(nextDueDate) : 'None'}
          </dd>
        </div>
      </dl>
    </section>
  );
}

export function ResidentPaymentsPrimaryActions({
  firstPayHref,
  totalDuePaise,
  historyHref,
}: {
  firstPayHref: string | null;
  totalDuePaise: number;
  historyHref: string | null;
}) {
  return (
    <section className={`${ACCOUNT_SURFACE} p-5`}>
      <h2 className="text-base font-semibold text-zinc-900">What to do next</h2>
      <p className="mt-1 text-sm text-zinc-600">
        Pay with UPI or card on the payment page. Keep proof if you pay offline at the office.
      </p>
      <div className="mt-4 flex flex-wrap gap-2">
        {firstPayHref && totalDuePaise > 0 ? (
          <Link
            href={firstPayHref}
            className="inline-flex min-h-[44px] items-center justify-center rounded-lg bg-[#FF5A1F] px-4 py-2.5 text-sm font-semibold text-white hover:brightness-110"
          >
            Pay {paiseToInr(totalDuePaise)} now
          </Link>
        ) : (
          <Link
            href={residentTabHref('home')}
            className="inline-flex min-h-[44px] items-center justify-center rounded-lg bg-[#FF5A1F] px-4 py-2.5 text-sm font-semibold text-white hover:brightness-110"
          >
            All paid — back to home
          </Link>
        )}
        {historyHref ? (
          <Link
            href={historyHref}
            className="inline-flex min-h-[44px] items-center justify-center rounded-lg border border-zinc-300 bg-white px-4 py-2.5 text-sm font-medium text-zinc-800 hover:bg-zinc-50"
          >
            Payment history
          </Link>
        ) : null}
        <Link
          href={residentTabHref('wallet')}
          className="inline-flex min-h-[44px] items-center justify-center rounded-lg border border-zinc-300 bg-white px-4 py-2.5 text-sm font-medium text-zinc-800 hover:bg-zinc-50"
        >
          Wallet
        </Link>
      </div>
    </section>
  );
}

export function ResidentBillsList({
  rows,
  title = 'Your bills',
}: {
  rows: PaymentDueRow[];
  title?: string;
}) {
  if (rows.length === 0) {
    return null;
  }

  return (
    <section className={`${ACCOUNT_SURFACE} p-5`}>
      <h2 className="text-base font-semibold text-zinc-900">{title}</h2>
      <ul className="mt-4 divide-y divide-zinc-200">
        {rows.map((row) => (
          <li key={row.key} className="flex flex-wrap items-center justify-between gap-2 py-3 first:pt-0">
            <div>
              <p className="text-sm font-medium text-zinc-900">{row.label}</p>
              <p className="text-xs text-zinc-500">
                {row.dueDate ? `Due ${formatDate(row.dueDate)}` : 'Due soon'} · {titleCase(row.status)}
              </p>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-sm font-semibold tabular-nums">{paiseToInr(row.amountPaise)}</span>
              {row.href ? (
                <Link
                  href={row.href}
                  className="inline-flex min-h-[44px] items-center rounded-lg bg-[#FF5A1F] px-3 py-2 text-xs font-semibold text-white"
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
