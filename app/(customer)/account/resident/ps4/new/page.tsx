import Link from 'next/link';
import { redirect } from 'next/navigation';
import { requireCustomerSession } from '@/src/lib/auth/guards';
import { paiseToInr } from '@/src/lib/format';
import {
  ACCOUNT_BACK_LINK,
  ACCOUNT_PAGE_SUBTITLE,
  ACCOUNT_PAGE_TITLE,
  ACCOUNT_SURFACE_PADDED,
} from '@/src/components/customer/accountStyles';
import {
  PS4_ADDON_LABEL,
  PS4_LOUNGE_HEADLINE,
  PS4_LOUNGE_HOURLY_NOTE,
  PS4_PLANS,
  ps4PlanRatesSummary,
} from '@/src/lib/playstation/plans';
import { isActiveTenant } from '@/src/services/playstationMembership';
import { subscribePs4Action } from './actions';

export const dynamic = 'force-dynamic';

export default async function NewPs4SubscriptionPage() {
  const session = await requireCustomerSession('/account/resident/ps4/new');
  const active = await isActiveTenant(session.customerId);
  if (!active) {
    redirect('/account/resident');
  }

  return (
    <div className="mx-auto w-full max-w-xl space-y-5 px-4 py-10 sm:px-6">
      <header>
        <Link href="/account/resident" className={ACCOUNT_BACK_LINK}>
          ← Back to resident dashboard
        </Link>
        <h1 className={`mt-2 ${ACCOUNT_PAGE_TITLE}`}>Subscribe to PS4 add-on</h1>
        <p className={ACCOUNT_PAGE_SUBTITLE}>{PS4_ADDON_LABEL}</p>
        <p className="mt-2 text-sm font-medium text-zinc-800">{PS4_LOUNGE_HEADLINE}</p>
        <p className="mt-1 text-sm text-zinc-600">{PS4_LOUNGE_HOURLY_NOTE}</p>
        <p className="mt-1 text-xs text-zinc-500">Plans: {ps4PlanRatesSummary()}</p>
      </header>

      <form action={subscribePs4Action} className={`${ACCOUNT_SURFACE_PADDED} space-y-3`}>
        {(Object.values(PS4_PLANS)).map((plan) => (
          <label
            key={plan.id}
            className="flex cursor-pointer items-start gap-3 rounded-lg border border-zinc-200 px-3 py-2.5 hover:bg-zinc-50 has-[:checked]:border-indigo-300 has-[:checked]:bg-indigo-50/40"
          >
            <input type="radio" name="plan" value={plan.id} required className="mt-1" />
            <span className="flex-1 text-sm">
              <span className="font-medium text-zinc-900">{plan.label}</span>
              <span className="block text-xs text-zinc-500">{plan.description}</span>
            </span>
            <span className="text-sm font-semibold text-zinc-900">{paiseToInr(plan.pricePaise)}</span>
          </label>
        ))}
        <p className="text-xs text-zinc-600">
          Payment uses the electricity / daily UPI QR — scan, pay, upload proof; admin verifies before
          lounge access activates (same as PG booking checkout).
        </p>
        <button
          type="submit"
          className="inline-flex w-full items-center justify-center rounded-md bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-500"
        >
          Continue to payment →
        </button>
      </form>
    </div>
  );
}
