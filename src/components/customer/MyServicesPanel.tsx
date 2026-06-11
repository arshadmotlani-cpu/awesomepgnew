import Link from 'next/link';
import { formatDateTime, paiseToInr, titleCase } from '@/src/lib/format';
import { PS4_ADDON_LABEL, PS4_PLANS, type Ps4PlanId } from '@/src/lib/playstation/plans';
import type { PlaystationMembership } from '@/src/db/schema/playstationMemberships';
import {
  ACCOUNT_SURFACE_PADDED,
} from '@/src/components/customer/accountStyles';

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
      className={`${ACCOUNT_SURFACE_PADDED}`}
      data-roachie-focus="ps4-service"
    >
      <h2 className="text-lg font-semibold text-zinc-900">My services</h2>
      <p className="mt-1 text-sm text-zinc-600">
        Add-on services for active tenants — separate from rent and electricity.
      </p>

      <div className="mt-4 rounded-lg border border-zinc-200 bg-zinc-50 p-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="text-sm font-semibold text-zinc-900">{PS4_ADDON_LABEL}</h3>
          {membership ? (
            <StatusPill status={active ? 'active' : membership.status} />
          ) : (
            <span className="text-xs font-medium text-zinc-600">Not subscribed</span>
          )}
        </div>

        {active && membership ? (
          <div className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 p-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-emerald-900">
              Active subscription
            </p>
            <dl className="mt-2 grid gap-3 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-xs font-medium text-emerald-800">Plan</dt>
                <dd className="mt-0.5 font-semibold text-emerald-950">
                  {PS4_PLANS[membership.plan as Ps4PlanId].label}
                </dd>
              </div>
              <div>
                <dt className="text-xs font-medium text-emerald-800">Amount paid</dt>
                <dd className="mt-0.5 font-semibold text-emerald-950">
                  {paiseToInr(membership.amountPaise)}
                </dd>
              </div>
              <div className="sm:col-span-2">
                <dt className="text-xs font-medium text-emerald-800">Subscription starts</dt>
                <dd className="mt-0.5 font-semibold text-emerald-950">
                  {formatDateTime(membership.startsAt)}
                </dd>
              </div>
              <div className="sm:col-span-2">
                <dt className="text-xs font-medium text-emerald-800">Subscription ends</dt>
                <dd className="mt-0.5 font-semibold text-emerald-950">
                  {formatDateTime(membership.expiresAt)}
                </dd>
              </div>
            </dl>
          </div>
        ) : membership?.status === 'pending_payment' ? (
          <p className="mt-2 text-sm font-medium text-amber-900">
            Payment pending — complete UPI payment to activate your PS4 add-on.
          </p>
        ) : (
          <p className="mt-2 text-sm text-zinc-700">
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
                className="inline-flex items-center rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-xs font-medium text-zinc-800 hover:bg-zinc-100"
              >
                Renew
              </Link>
              {membership.plan !== 'monthly' ? (
                <Link
                  href={`/account/resident/pay-ps4/${membership.id}?action=upgrade`}
                  className="inline-flex items-center rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-xs font-medium text-zinc-800 hover:bg-zinc-100"
                >
                  Upgrade plan
                </Link>
              ) : null}
            </>
          ) : (
            <Link
              href="/account/resident/ps4/new"
              className={`inline-flex items-center rounded-md bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-500`}
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
      ? 'bg-emerald-100 text-emerald-900 ring-emerald-300'
      : status === 'pending_payment'
        ? 'bg-amber-100 text-amber-900 ring-amber-300'
        : 'bg-zinc-200 text-zinc-800 ring-zinc-300';
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ring-1 ring-inset ${tone}`}
    >
      {titleCase(status.replace('_', ' '))}
    </span>
  );
}
