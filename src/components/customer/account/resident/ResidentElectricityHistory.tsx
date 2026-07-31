'use client';

import Link from 'next/link';
import { paiseToInr, formatDate, formatDateTime } from '@/src/lib/format';

export type ResidentElectricityHistoryItem = {
  id: string;
  invoiceNumber: string;
  billingMonth: string;
  roomNumber: string;
  bedCode: string;
  daysCharged: number | null;
  unitsAllocated: number | null;
  billAmountPaise: number;
  paidAmountPaise: number;
  outstandingAmountPaise: number;
  paidAt: Date | string | null;
  paymentStatus: string;
  detailHref: string;
};

export function ResidentElectricityHistory({
  items,
  theme = 'dark',
}: {
  items: ResidentElectricityHistoryItem[];
  theme?: 'light' | 'dark';
}) {
  if (items.length === 0) return null;

  const dark = theme === 'dark';
  const heading = dark ? 'text-white' : 'text-zinc-900';
  const sub = dark ? 'text-apg-silver' : 'text-zinc-500';
  const tableShell = dark
    ? 'overflow-x-auto rounded-xl border border-white/10'
    : 'overflow-x-auto rounded-xl border border-zinc-200';
  const th = dark
    ? 'px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wide text-apg-silver'
    : 'px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wide text-zinc-500';
  const td = dark ? 'px-3 py-3 text-sm text-white' : 'px-3 py-3 text-sm text-zinc-900';
  const rowBorder = dark ? 'border-t border-white/10' : 'border-t border-zinc-100';
  const linkClass = dark
    ? 'font-medium text-apg-cyan hover:text-apg-orange'
    : 'font-medium text-orange-600 hover:underline';

  return (
    <section className="space-y-3">
      <header>
        <h3 className={`text-sm font-semibold ${heading}`}>Electricity history</h3>
        <p className={`mt-1 text-xs ${sub}`}>
          All room electricity bills for your stay — open any invoice for the full breakdown.
        </p>
      </header>

      <div className={tableShell}>
        <table className="min-w-full text-sm">
          <thead className={dark ? 'bg-white/[0.03]' : 'bg-zinc-50'}>
            <tr>
              <th className={th}>Billing month</th>
              <th className={th}>Invoice</th>
              <th className={th}>Room</th>
              <th className={th}>Bed</th>
              <th className={`${th} text-right`}>Days</th>
              <th className={`${th} text-right`}>Units</th>
              <th className={`${th} text-right`}>Bill</th>
              <th className={`${th} text-right`}>Paid</th>
              <th className={`${th} text-right`}>Outstanding</th>
              <th className={th}>Payment date</th>
              <th className={th}>Status</th>
              <th className={th} />
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.id} className={rowBorder}>
                <td className={`${td} whitespace-nowrap`}>{formatDate(item.billingMonth)}</td>
                <td className={`${td} font-mono text-xs`}>{item.invoiceNumber}</td>
                <td className={td}>R{item.roomNumber}</td>
                <td className={td}>{item.bedCode}</td>
                <td className={`${td} text-right tabular-nums`}>
                  {item.daysCharged != null ? item.daysCharged : '—'}
                </td>
                <td className={`${td} text-right tabular-nums`}>
                  {item.unitsAllocated != null ? item.unitsAllocated.toFixed(2) : '—'}
                </td>
                <td className={`${td} text-right tabular-nums`}>{paiseToInr(item.billAmountPaise)}</td>
                <td className={`${td} text-right tabular-nums`}>{paiseToInr(item.paidAmountPaise)}</td>
                <td className={`${td} text-right tabular-nums`}>
                  {paiseToInr(item.outstandingAmountPaise)}
                </td>
                <td className={`${td} text-xs whitespace-nowrap`}>
                  {item.paidAt ? formatDateTime(item.paidAt) : '—'}
                </td>
                <td className={td}>{item.paymentStatus}</td>
                <td className={td}>
                  <Link href={item.detailHref} className={linkClass}>
                    Open →
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
