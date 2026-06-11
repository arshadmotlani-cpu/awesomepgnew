import Link from 'next/link';
import type { PgBusinessMetrics } from '@/src/db/queries/admin';
import { paiseToInr } from '@/src/lib/format';

export function PgBusinessMetricsTable({ rows }: { rows: PgBusinessMetrics[] }) {
  if (rows.length === 0) {
    return <p className="text-sm text-zinc-400">No PG listings yet.</p>;
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-white/10 bg-[#1A1F27]">
      <table className="min-w-full text-sm">
        <thead className="text-left text-xs uppercase tracking-wide text-zinc-500">
          <tr className="border-b border-white/10">
            <th className="px-4 py-3">PG</th>
            <th className="px-4 py-3">Occupancy</th>
            <th className="px-4 py-3">Beds</th>
            <th className="px-4 py-3">Expected rent / mo</th>
            <th className="px-4 py-3">Collected this month</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-white/5 text-zinc-300">
          {rows.map((row) => (
            <tr key={row.pgId} className="hover:bg-white/[0.02]">
              <td className="px-4 py-3">
                <Link
                  href={`/admin/pgs/${row.pgId}/edit`}
                  className="font-medium text-white hover:text-[#FF5A1F]"
                >
                  {row.pgName}
                </Link>
              </td>
              <td className="px-4 py-3">
                <span className="font-semibold text-white">{row.occupancyPct}%</span>
                <span className="ml-2 text-xs text-zinc-500">
                  {row.occupiedBeds}/{row.totalBeds} occupied
                </span>
              </td>
              <td className="px-4 py-3 text-zinc-400">
                {row.availableBeds} available
                {row.blockedBeds > 0 ? ` · ${row.blockedBeds} blocked` : ''}
              </td>
              <td className="px-4 py-3">{paiseToInr(row.expectedMonthlyRentPaise)}</td>
              <td className="px-4 py-3">
                <span className="font-medium text-emerald-400">
                  {paiseToInr(row.incomeThisMonthPaise)}
                </span>
                {row.incomeThisMonthPaise > 0 ? (
                  <p className="mt-0.5 text-xs text-zinc-500">
                    QR {paiseToInr(row.incomeQrPaise)} · Rent {paiseToInr(row.incomeRentPaise)} ·
                    Elec {paiseToInr(row.incomeElectricityPaise)}
                  </p>
                ) : (
                  <p className="mt-0.5 text-xs text-zinc-500">No approved payments this month</p>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
