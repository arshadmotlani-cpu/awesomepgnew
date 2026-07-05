import Link from 'next/link';
import { paiseToInr } from '@/src/lib/format';
import type { ReferralProgramSnapshot } from '@/src/services/referralAdmin';

export function ReferralAnalyticsPanel({ snapshot }: { snapshot: ReferralProgramSnapshot }) {
  return (
    <section className="rounded-2xl border border-white/10 bg-[#1A1F27] p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-apg-orange">
            Referral program
          </h2>
          <p className="mt-1 text-xs text-apg-silver">Top referrers and withdrawal pipeline</p>
        </div>
        <Link
          href="/admin/revenue/referral-withdrawals"
          className="rounded-lg border border-white/10 px-3 py-1.5 text-xs font-medium text-apg-silver hover:text-white"
        >
          Referral withdrawals →
        </Link>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <Stat label="Withdrawals pending" value={String(snapshot.totalPendingWithdrawals)} />
        <Stat label="Paid" value={String(snapshot.totalPaidWithdrawals)} />
        <Stat label="Rejected" value={String(snapshot.totalRejectedWithdrawals)} />
      </div>

      <div className="mt-5 overflow-x-auto">
        <table className="min-w-full text-left text-sm">
          <thead>
            <tr className="border-b border-white/10 text-xs uppercase text-apg-silver">
              <th className="py-2 pr-3">Referrer</th>
              <th className="py-2 pr-3">Code</th>
              <th className="py-2 pr-3">Referrals</th>
              <th className="py-2 pr-3">Earned</th>
              <th className="py-2 pr-3">Pending</th>
              <th className="py-2">Withdrawn</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {snapshot.topReferrers.length === 0 ? (
              <tr>
                <td colSpan={6} className="py-4 text-apg-silver">
                  No referral earnings yet.
                </td>
              </tr>
            ) : (
              snapshot.topReferrers.map((r) => (
                <tr key={r.customerId}>
                  <td className="py-2 pr-3">
                    <Link
                      href={`/admin/residents/${r.customerId}`}
                      className="text-white hover:text-apg-orange"
                    >
                      {r.customerName}
                    </Link>
                  </td>
                  <td className="py-2 pr-3 font-mono text-apg-silver">{r.referralCode}</td>
                  <td className="py-2 pr-3 text-white">{r.successfulReferrals}</td>
                  <td className="py-2 pr-3 text-white">{paiseToInr(r.totalEarningsPaise)}</td>
                  <td className="py-2 pr-3 text-amber-200">{paiseToInr(r.pendingPaise)}</td>
                  <td className="py-2 text-emerald-200">{paiseToInr(r.withdrawnPaise)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-3">
      <p className="text-[10px] uppercase tracking-wide text-apg-silver">{label}</p>
      <p className="mt-1 text-lg font-semibold text-white">{value}</p>
    </div>
  );
}
