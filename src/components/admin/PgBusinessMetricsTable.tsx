import Link from 'next/link';
import type { PgBusinessMetrics } from '@/src/db/queries/admin';
import { paiseToInr } from '@/src/lib/format';

function CollectionCell({
  total,
  qr,
  invoice,
}: {
  total: number;
  qr: number;
  invoice: number;
}) {
  if (total === 0) {
    return <span className="text-zinc-500">—</span>;
  }

  return (
    <div>
      <span className="font-medium text-emerald-700">{paiseToInr(total)}</span>
      <p className="mt-0.5 text-xs text-zinc-500">
        QR {paiseToInr(qr)} · Invoice {paiseToInr(invoice)}
      </p>
    </div>
  );
}

export function PgBusinessMetricsTable({
  rows,
  totals,
}: {
  rows: PgBusinessMetrics[];
  totals?: Pick<
    PgBusinessMetrics,
    | 'incomeRentPaise'
    | 'incomeRentQrPaise'
    | 'incomeRentInvoicePaise'
    | 'incomeElectricityPaise'
    | 'incomeElectricityQrPaise'
    | 'incomeElectricityInvoicePaise'
    | 'incomeTotalPaise'
    | 'expectedMonthlyRentPaise'
  >;
}) {
  if (rows.length === 0) {
    return <p className="text-sm text-zinc-400">No PG listings yet.</p>;
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-zinc-200 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
      <table className="min-w-full text-sm">
        <thead className="text-left text-xs uppercase tracking-wide text-zinc-500">
          <tr className="border-b border-zinc-200">
            <th className="px-4 py-3">PG</th>
            <th className="px-4 py-3">Occupancy</th>
            <th className="px-4 py-3">Beds</th>
            <th className="px-4 py-3">Expected rent / mo</th>
            <th className="px-4 py-3">Rent collected</th>
            <th className="px-4 py-3">Electricity collected</th>
            <th className="px-4 py-3">Total collected</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-zinc-100 text-zinc-700">
          {rows.map((row) => (
            <tr key={row.pgId} className="hover:bg-zinc-50">
              <td className="px-4 py-3">
                <Link
                  href={`/admin/pgs/${row.pgId}/map`}
                  className="font-medium text-zinc-900 hover:text-[#FF5A1F]"
                >
                  {row.pgName}
                </Link>
              </td>
              <td className="px-4 py-3">
                <span className="font-semibold text-zinc-900">{row.occupancyPct}%</span>
                <span className="ml-2 text-xs text-zinc-500">
                  {row.occupiedBeds}/{row.totalBeds} occupied
                </span>
              </td>
              <td className="px-4 py-3 text-zinc-500">
                {row.availableBeds} available
                {row.blockedBeds > 0 ? ` · ${row.blockedBeds} blocked` : ''}
              </td>
              <td className="px-4 py-3">{paiseToInr(row.expectedMonthlyRentPaise)}</td>
              <td className="px-4 py-3">
                <CollectionCell
                  total={row.incomeRentPaise}
                  qr={row.incomeRentQrPaise}
                  invoice={row.incomeRentInvoicePaise}
                />
              </td>
              <td className="px-4 py-3">
                <CollectionCell
                  total={row.incomeElectricityPaise}
                  qr={row.incomeElectricityQrPaise}
                  invoice={row.incomeElectricityInvoicePaise}
                />
              </td>
              <td className="px-4 py-3 font-semibold text-zinc-900">
                {paiseToInr(row.incomeTotalPaise)}
              </td>
            </tr>
          ))}
        </tbody>
        {totals ? (
          <tfoot className="border-t border-zinc-200 bg-zinc-50 text-sm font-semibold text-zinc-900">
            <tr>
              <td className="px-4 py-3" colSpan={3}>
                All PGs
              </td>
              <td className="px-4 py-3">{paiseToInr(totals.expectedMonthlyRentPaise)}</td>
              <td className="px-4 py-3">
                <CollectionCell
                  total={totals.incomeRentPaise}
                  qr={totals.incomeRentQrPaise}
                  invoice={totals.incomeRentInvoicePaise}
                />
              </td>
              <td className="px-4 py-3">
                <CollectionCell
                  total={totals.incomeElectricityPaise}
                  qr={totals.incomeElectricityQrPaise}
                  invoice={totals.incomeElectricityInvoicePaise}
                />
              </td>
              <td className="px-4 py-3">{paiseToInr(totals.incomeTotalPaise)}</td>
            </tr>
          </tfoot>
        ) : null}
      </table>
    </div>
  );
}
