import Link from 'next/link';
import { formatDate, formatDateTime, paiseToInr, titleCase } from '@/src/lib/format';
import { PS4_ADDON_LABEL, PS4_PLANS, type Ps4PlanId } from '@/src/lib/playstation/plans';
import type { PlaystationMembership } from '@/src/db/schema/playstationMemberships';

type Props = {
  membership: PlaystationMembership | null;
  isActiveTenant: boolean;
};

export function MyServicesPanel({ membership, isActiveTenant }: Props) {
  if (!isActiveTenant) return null;

  const now = new Date();
  const active =
    membership &&
    membership.status === 'active' &&
    membership.expiresAt &&
    membership.expiresAt > now;

  return (
    <section
      className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm"
      data-roachie-focus="ps4-service"
    >
      <h2 className="text-lg font-semibold text-zinc-900">My services</h2>
      <p className="mt-1 text-sm text-zinc-500">
        Add-on services for active tenants — separate from rent and electricity.
      </p>

      <div className="mt-4 rounded-lg border border-zinc-200 bg-zinc-50 p-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="text-sm font-semibold text-zinc-900">{PS4_ADDON_LABEL}</h3>
          {membership ? (
            <StatusPill status={active ? 'active' : membership.status} />
          ) : (
            <span className="text-xs text-zinc-500">Not subscribed</span>
          )}
        </div>

        {active && membership ? (
          <dl className="mt-3 grid gap-2 text-xs sm:grid-cols-2">
            <div>
              <dt className="text-zinc-500">Plan</dt>
              <dd className="font-medium">{PS4_PLANS[membership.plan as Ps4PlanId].label}</dd>
            </div>
            <div>
              <dt className="text-zinc-500">Amount</dt>
              <dd className="font-medium">{paiseToInr(membership.amountPaise)}</dd>
            </div>
            <div className="sm:col-span-2">
              <dt className="text-zinc-500">Subscription starts</dt>
              <dd className="font-medium">{formatDateTime(membership.startsAt)}</dd>
            </div>
            <div className="sm:col-span-2">
              <dt className="text-zinc-500">Subscription ends</dt>
              <dd className="font-medium">{formatDateTime(membership.expiresAt)}</dd>
            </div>
          </dl>
        ) : membership?.status === 'pending_payment' ? (
          <p className="mt-2 text-xs text-amber-800">
            Payment pending — complete UPI payment to activate your PS4 add-on.
          </p>
        ) : (
          <p className="mt-2 text-xs text-zinc-600">
            Access the shared PS4 lounge. Choose weekly (₹350), bi-weekly (₹550), or monthly (₹750).
          </p>
        )}

        <div className="mt-3 flex flex-wrap gap-2">
          {membership?.status === 'pending_payment' ? (
            <Link
              href={`/account/resident/pay-ps4/${membership.id}`}
              className="inline-flex items-center rounded-md bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-500"
            >
              Complete payment →
            </Link>
          ) : active && membership ? (
            <>
              <Link
                href={`/account/resident/pay-ps4/${membership.id}?action=renew`}
                className="inline-flex items-center rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50"
              >
                Renew
              </Link>
              {membership.plan !== 'monthly' ? (
                <Link
                  href={`/account/resident/pay-ps4/${membership.id}?action=upgrade`}
                  className="inline-flex items-center rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50"
                >
                  Upgrade plan
                </Link>
              ) : null}
            </>
          ) : (
            <Link
              href="/account/resident/ps4/new"
              className="inline-flex items-center rounded-md bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-500"
            >
              Subscribe to PS4 add-on →
            </Link>
          )}
        </div>
      </div>
    </section>
  );
}

function StatusPill({ status }: { status: string }) {
  const tone =
    status === 'active'
      ? 'bg-emerald-50 text-emerald-700 ring-emerald-200'
      : status === 'pending_payment'
        ? 'bg-amber-50 text-amber-700 ring-amber-200'
        : 'bg-zinc-100 text-zinc-700 ring-zinc-200';
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${tone}`}
    >
      {titleCase(status.replace('_', ' '))}
    </span>
  );
}
