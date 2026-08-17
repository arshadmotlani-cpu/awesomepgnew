import Link from 'next/link';
import type { FyhMembershipPlan } from '@/src/hair/db/schema';
import { formatInrFromPaise } from '@/src/hair/lib/money';

export function MembershipsList({ memberships }: { memberships: FyhMembershipPlan[] }) {
  return (
    <div className="space-y-4">
      <div>
        <p className="fyh-section-eyebrow">Configuration</p>
        <h1 className="fyh-display mt-1 font-semibold">Memberships</h1>
        <p className="mt-1 text-sm text-fyh-text-secondary">
          Subscription plans with recurring benefits — validity periods, discounts, priority booking,
          and member perks. Separate from one-time service packages.
        </p>
      </div>

      {memberships.length === 0 ? (
        <div className="fyh-glass px-6 py-16 text-center">
          <p className="fyh-display text-xl font-semibold">No memberships yet</p>
          <p className="mt-2 text-sm text-fyh-text-muted">
            Seed membership plans in the database or add them in a future release.
          </p>
          <Link
            href="/loyalty"
            className="mt-6 inline-block text-sm font-medium text-fyh-accent hover:underline"
          >
            Open Loyalty & Ops
          </Link>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-[color:var(--fyh-border)]">
          <table className="w-full text-left text-sm">
            <thead className="bg-[color:var(--fyh-surface-muted)] text-fyh-text-secondary">
              <tr>
                <th className="px-4 py-3 font-medium">Plan</th>
                <th className="px-4 py-3 font-medium">Tier</th>
                <th className="px-4 py-3 font-medium">Discount</th>
                <th className="px-4 py-3 font-medium">Validity</th>
                <th className="px-4 py-3 font-medium text-right">Price</th>
              </tr>
            </thead>
            <tbody>
              {memberships.map((plan) => (
                <tr
                  key={plan.id}
                  className="border-t border-[color:var(--fyh-border)] text-fyh-text"
                >
                  <td className="px-4 py-3 font-medium">{plan.name}</td>
                  <td className="px-4 py-3 capitalize">{plan.tier}</td>
                  <td className="px-4 py-3">{plan.discountBps / 100}%</td>
                  <td className="px-4 py-3">{plan.validityDays} days</td>
                  <td className="px-4 py-3 text-right">{formatInrFromPaise(plan.pricePaise)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
