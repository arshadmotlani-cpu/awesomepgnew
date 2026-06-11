import Link from 'next/link';
import { formatDateTime, paiseToInr, titleCase } from '@/src/lib/format';
import { PS4_ADDON_LABEL, PS4_PLANS, type Ps4PlanId } from '@/src/lib/playstation/plans';
import type { PlaystationMembership } from '@/src/db/schema/playstationMemberships';

type Props = {
  membership: PlaystationMembership | null;
  isActiveTenant: boolean;
};

/** Dark glass panel — avoids light text inheriting onto white cards on the charcoal shell. */
export function MyServicesPanel({ membership, isActiveTenant }: Props) {
  if (!isActiveTenant) return null;

  const now = new Date();
  const isActiveStatus = membership?.status === 'active';
  const isCurrentlyValid =
    isActiveStatus &&
    membership.expiresAt != null &&
    membership.expiresAt > now;

  const showSubscriptionDetails = isActiveStatus && membership != null;

  return (
    <section
      className="apg-glass rounded-2xl p-5"
      data-roachie-focus="ps4-service"
    >
      <h2 className="text-lg font-semibold text-white">My services</h2>
      <p className="mt-1 text-sm text-zinc-300">
        Add-on services for active tenants — separate from rent and electricity.
      </p>

      <div className="mt-4 rounded-xl border border-white/10 bg-black/20 p-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="text-sm font-semibold text-white">{PS4_ADDON_LABEL}</h3>
          {membership ? (
            <StatusPill
              status={
                isCurrentlyValid ? 'active' : membership.status === 'active' ? 'expired' : membership.status
              }
            />
          ) : (
            <span className="text-xs font-medium text-zinc-300">Not subscribed</span>
          )}
        </div>

        {showSubscriptionDetails ? (
          <div className="mt-4 rounded-xl border border-emerald-400/50 bg-emerald-950/40 p-4">
            <p className="text-xs font-bold uppercase tracking-wider text-emerald-300">
              {isCurrentlyValid ? 'Active subscription' : 'Subscription'}
            </p>
            <div className="mt-3 grid gap-4 sm:grid-cols-2">
              <SubscriptionField
                label="Plan"
                value={PS4_PLANS[membership.plan as Ps4PlanId].label}
              />
              <SubscriptionField
                label="Amount paid"
                value={paiseToInr(membership.amountPaise)}
              />
              <SubscriptionField
                className="sm:col-span-2"
                label="Subscription starts"
                value={formatDateTime(membership.startsAt)}
              />
              <SubscriptionField
                className="sm:col-span-2"
                label="Subscription ends"
                value={formatDateTime(membership.expiresAt)}
              />
            </div>
          </div>
        ) : membership?.status === 'pending_payment' ? (
          <p className="mt-3 text-sm font-medium text-amber-200">
            Payment pending — complete UPI payment to activate your PS4 add-on.
          </p>
        ) : (
          <p className="mt-3 text-sm text-zinc-300">
            Access the shared PS4 lounge. Choose weekly (₹350), bi-weekly (₹550), or monthly (₹750).
          </p>
        )}

        <div className="mt-4 flex flex-wrap gap-2">
          {membership?.status === 'pending_payment' ? (
            <Link
              href={`/account/resident/pay-ps4/${membership.id}`}
              className="inline-flex items-center rounded-md bg-[#FF5A1F] px-3 py-1.5 text-xs font-semibold text-white hover:brightness-110"
            >
              Complete payment →
            </Link>
          ) : isCurrentlyValid && membership ? (
            <>
              <Link
                href={`/account/resident/pay-ps4/${membership.id}?action=renew`}
                className="inline-flex items-center rounded-md border border-white/30 bg-white/10 px-3 py-1.5 text-xs font-semibold text-white hover:bg-white/20"
              >
                Renew
              </Link>
              {membership.plan !== 'monthly' ? (
                <Link
                  href={`/account/resident/pay-ps4/${membership.id}?action=upgrade`}
                  className="inline-flex items-center rounded-md border border-white/30 bg-white/10 px-3 py-1.5 text-xs font-semibold text-white hover:bg-white/20"
                >
                  Upgrade plan
                </Link>
              ) : null}
            </>
          ) : (
            <Link
              href="/account/resident/ps4/new"
              className="inline-flex items-center rounded-md bg-[#FF5A1F] px-3 py-1.5 text-xs font-semibold text-white hover:brightness-110"
            >
              Subscribe to PS4 add-on →
            </Link>
          )}
        </div>
      </div>
    </section>
  );
}

function SubscriptionField({
  label,
  value,
  className = '',
}: {
  label: string;
  value: string;
  className?: string;
}) {
  return (
    <div className={className}>
      <div className="text-[11px] font-semibold uppercase tracking-wider text-emerald-200/90">
        {label}
      </div>
      <div
        className="mt-1 text-base font-bold leading-snug text-white"
        style={{ color: '#ffffff', WebkitTextFillColor: '#ffffff' }}
      >
        {value}
      </div>
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  const tone =
    status === 'active'
      ? 'bg-emerald-500/20 text-emerald-200 ring-emerald-400/40'
      : status === 'expired'
        ? 'bg-zinc-500/20 text-zinc-200 ring-zinc-400/40'
        : status === 'pending_payment'
          ? 'bg-amber-500/20 text-amber-200 ring-amber-400/40'
          : 'bg-zinc-500/20 text-zinc-200 ring-zinc-400/40';
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset ${tone}`}
    >
      {titleCase(status.replace('_', ' '))}
    </span>
  );
}
