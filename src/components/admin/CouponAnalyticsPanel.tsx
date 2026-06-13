import { paiseToInr } from '@/src/lib/format';
import type { DateCouponAnalyticsRow } from '@/src/services/dateCouponAdmin';

export function CouponAnalyticsPanel({ rows }: { rows: DateCouponAnalyticsRow[] }) {
  if (rows.length === 0) {
    return (
      <section className="rounded-xl border border-white/10 bg-[#1A1F27] p-4 text-sm text-apg-silver">
        <h2 className="text-sm font-semibold text-white">Coupon usage</h2>
        <p className="mt-2">No date-coupon redemptions recorded yet.</p>
      </section>
    );
  }

  return (
    <section className="rounded-xl border border-white/10 bg-[#1A1F27] p-4">
      <h2 className="text-sm font-semibold text-white">Coupon usage (last 14 days)</h2>
      <p className="mt-1 text-xs text-apg-silver">
        Date-based rent coupons — conversion impact vs bookings started
      </p>
      <div className="mt-4 overflow-x-auto">
        <table className="min-w-full text-left text-sm">
          <thead>
            <tr className="border-b border-white/10 text-xs uppercase text-apg-silver">
              <th className="py-2 pr-4">Date</th>
              <th className="py-2 pr-4">Redemptions</th>
              <th className="py-2">Discount given</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {rows.map((r) => (
              <tr key={r.couponDate}>
                <td className="py-2 pr-4 text-white">{r.couponDate}</td>
                <td className="py-2 pr-4 text-apg-silver">{r.redemptionCount}</td>
                <td className="py-2 text-white">{paiseToInr(r.totalDiscountPaise)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
