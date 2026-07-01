import Link from 'next/link';
import { ApgCard } from '@/src/components/customer/design-system';
import { formatDate, paiseToInr, titleCase } from '@/src/lib/format';
import { residentTabHref } from '@/src/lib/accountNavigation';
import type { PaymentDueRow } from '@/src/components/customer/account/resident/ResidentPaymentsPanel';

function billKindLabel(row: PaymentDueRow): string {
  if (row.key.startsWith('rent-')) {
    const monthPart = row.label.replace(/^Rent ·\s*/, '');
    return `${monthPart} Rent`;
  }
  if (row.key.startsWith('elec-')) {
    const monthPart = row.label.replace(/^Electricity ·\s*/, '');
    return `${monthPart} Electricity`;
  }
  if (row.key === 'deposit-due') return 'Deposit Due';
  return row.label;
}

function sortBillRows(rows: PaymentDueRow[]): PaymentDueRow[] {
  const order = (key: string) => {
    if (key.startsWith('rent-')) return 0;
    if (key.startsWith('elec-')) return 1;
    if (key === 'deposit-due') return 2;
    return 3;
  };
  return [...rows].sort((a, b) => order(a.key) - order(b.key));
}

/** Itemized outstanding bills — first thing residents see on My Stay. */
export function ResidentOutstandingBillsCard({
  dueRows,
  depositDuePaise,
  depositRequiredPaise,
  depositPaidPaise,
  depositPaymentLinkUrl,
}: {
  dueRows: PaymentDueRow[];
  depositDuePaise?: number;
  depositRequiredPaise?: number;
  depositPaidPaise?: number;
  depositPaymentLinkUrl?: string | null;
}) {
  const billRows = sortBillRows([...dueRows]);
  if (depositDuePaise && depositDuePaise > 0) {
    billRows.push({
      key: 'deposit-due',
      label: 'Security deposit',
      amountPaise: depositDuePaise,
      dueDate: null,
      href: depositPaymentLinkUrl ?? null,
      status: 'Due',
    });
  }

  if (billRows.length === 0) return null;

  const totalOutstanding = billRows.reduce((sum, r) => sum + r.amountPaise, 0);
  const firstRent = billRows.find((r) => r.key.startsWith('rent-') && r.href);
  const firstElec = billRows.find((r) => r.key.startsWith('elec-') && r.href);
  const depositRow = billRows.find((r) => r.key === 'deposit-due');
  const showPayEverything = billRows.filter((r) => r.href).length > 1;

  return (
    <ApgCard tier="account" className="p-5">
      <h2 className="text-base font-semibold text-zinc-900">Outstanding bills</h2>
      <p className="mt-1 text-sm text-zinc-600">
        Everything you owe right now. The total is the sum of each bill below.
      </p>

      <ul className="mt-4 divide-y divide-zinc-100">
        {billRows.map((row) => (
          <li key={row.key} className="flex flex-wrap items-start justify-between gap-3 py-3 first:pt-0">
            <div className="min-w-0">
              <p className="text-sm font-medium text-zinc-900">{billKindLabel(row)}</p>
              {row.key === 'deposit-due' &&
              depositRequiredPaise != null &&
              depositPaidPaise != null ? (
                <p className="mt-0.5 text-xs text-zinc-500">
                  Required {paiseToInr(depositRequiredPaise)} · Paid {paiseToInr(depositPaidPaise)} ·
                  Due {paiseToInr(depositDuePaise ?? row.amountPaise)}
                </p>
              ) : (
                <p className="text-xs text-zinc-500">
                  Status: {titleCase(row.status)}
                  {row.dueDate ? ` · Due ${formatDate(row.dueDate)}` : ''}
                </p>
              )}
            </div>
            <p className="text-sm font-semibold tabular-nums text-zinc-900">
              {paiseToInr(row.amountPaise)}
            </p>
          </li>
        ))}
      </ul>

      <div className="mt-4 rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3">
        <div className="flex items-center justify-between gap-4">
          <span className="text-sm font-medium text-zinc-700">Total outstanding</span>
          <span className="text-lg font-bold tabular-nums text-[#FF5A1F]">
            {paiseToInr(totalOutstanding)}
          </span>
        </div>
      </div>

      <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
        {firstRent?.href ? (
          <Link
            href={firstRent.href}
            className="inline-flex min-h-[44px] flex-1 items-center justify-center rounded-xl bg-[#FF5A1F] px-4 py-2.5 text-sm font-semibold text-white hover:brightness-110"
          >
            Pay rent
          </Link>
        ) : null}
        {firstElec?.href ? (
          <Link
            href={firstElec.href}
            className="inline-flex min-h-[44px] flex-1 items-center justify-center rounded-xl border border-[#FF5A1F] bg-white px-4 py-2.5 text-sm font-semibold text-[#FF5A1F] hover:bg-orange-50"
          >
            Pay electricity
          </Link>
        ) : null}
        {depositRow?.href ? (
          <Link
            href={depositRow.href}
            className="inline-flex min-h-[44px] flex-1 items-center justify-center rounded-xl border border-indigo-400 bg-indigo-50 px-4 py-2.5 text-sm font-semibold text-indigo-800 hover:bg-indigo-100"
          >
            Pay deposit
          </Link>
        ) : null}
        {showPayEverything ? (
          <Link
            href={residentTabHref('payments')}
            className="inline-flex min-h-[44px] flex-1 items-center justify-center rounded-xl border border-zinc-300 bg-white px-4 py-2.5 text-sm font-semibold text-zinc-800 hover:bg-zinc-50"
          >
            Pay everything
          </Link>
        ) : null}
      </div>
    </ApgCard>
  );
}
