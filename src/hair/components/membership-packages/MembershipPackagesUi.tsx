import Link from 'next/link';
import type { FyhPackagePlan } from '@/src/hair/db/schema';
import { formatInrFromPaise } from '@/src/hair/lib/money';

export function MembershipPackagesList({ packages }: { packages: FyhPackagePlan[] }) {
  return (
    <div className="space-y-4">
      <div>
        <p className="fyh-section-eyebrow">Configuration</p>
        <h1 className="fyh-display mt-1 text-3xl font-semibold">Membership Packages</h1>
        <p className="mt-1 text-sm text-fyh-text-secondary">
          Session bundles and prepaid packages sold at checkout. Full create/edit flows ship in a
          follow-up — plans are listed from the salon catalog.
        </p>
      </div>

      {packages.length === 0 ? (
        <div className="fyh-glass px-6 py-16 text-center">
          <p className="fyh-display text-xl font-semibold">No membership packages yet</p>
          <p className="mt-2 text-sm text-fyh-text-muted">
            Seed package plans in the database or add them in a future release. Loyalty checkout
            still credits matching services when plans exist.
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
                <th className="px-4 py-3 font-medium">Package</th>
                <th className="px-4 py-3 font-medium">Sessions</th>
                <th className="px-4 py-3 font-medium">Validity</th>
                <th className="px-4 py-3 font-medium text-right">Price</th>
              </tr>
            </thead>
            <tbody>
              {packages.map((pkg) => (
                <tr
                  key={pkg.id}
                  className="border-t border-[color:var(--fyh-border)] text-fyh-text"
                >
                  <td className="px-4 py-3 font-medium">{pkg.name}</td>
                  <td className="px-4 py-3">{pkg.totalSessions}</td>
                  <td className="px-4 py-3">{pkg.validityDays} days</td>
                  <td className="px-4 py-3 text-right">{formatInrFromPaise(pkg.pricePaise)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
