import Link from 'next/link';
import { redirect } from 'next/navigation';
import { uploadPaymentScreenshotAction } from '@/app/(admin)/admin/pgs/payment-actions';
import { Ps4PaymentProofForm } from '@/src/components/customer/Ps4PaymentProofForm';
import { requireCustomerSession } from '@/src/lib/auth/guards';
import { formatDate, paiseToInr } from '@/src/lib/format';
import {
  DEFAULT_ELECTRICITY_DAILY_QR_PATH,
  DEFAULT_ELECTRICITY_DAILY_UPI_ID,
} from '@/src/lib/payments/defaultQr';
import { PS4_ADDON_LABEL, PS4_PLANS, type Ps4PlanId } from '@/src/lib/playstation/plans';
import {
  ensureDefaultPaymentCategoriesForPg,
  getElectricityDailyCategory,
} from '@/src/services/pgPaymentDefaults';
import {
  getActiveMembership,
  renewMembership,
  upgradeMembership,
} from '@/src/services/playstationMembership';
import { db } from '@/src/db/client';
import { eq } from 'drizzle-orm';
import { playstationMemberships } from '@/src/db/schema';

export const dynamic = 'force-dynamic';

export default async function PayPs4Page({
  params,
  searchParams,
}: {
  params: Promise<{ membershipId: string }>;
  searchParams: Promise<{ action?: string; plan?: string }>;
}) {
  const { membershipId } = await params;
  const sp = await searchParams;
  const session = await requireCustomerSession(`/account/resident/pay-ps4/${membershipId}`);

  if (sp.action === 'renew') {
    await renewMembership(membershipId, session.customerId);
    redirect(`/account/resident/pay-ps4/${membershipId}`);
  }
  if (sp.action === 'upgrade' && sp.plan && sp.plan in PS4_PLANS) {
    await upgradeMembership(membershipId, session.customerId, sp.plan as Ps4PlanId);
    redirect(`/account/resident/pay-ps4/${membershipId}`);
  }

  const [membership] = await db
    .select()
    .from(playstationMemberships)
    .where(eq(playstationMemberships.id, membershipId))
    .limit(1);
  if (!membership || membership.customerId !== session.customerId) {
    redirect('/account/resident');
  }

  await ensureDefaultPaymentCategoriesForPg(membership.pgId);
  const elecCategory = await getElectricityDailyCategory(membership.pgId);
  const plan = PS4_PLANS[membership.plan];
  const active = await getActiveMembership(session.customerId);
  const qrImageUrl = elecCategory?.qrCodeImageUrl ?? DEFAULT_ELECTRICITY_DAILY_QR_PATH;
  const upiId = elecCategory?.upiId ?? DEFAULT_ELECTRICITY_DAILY_UPI_ID;

  return (
    <div className="mx-auto w-full max-w-xl space-y-5 px-4 py-10 sm:px-6">
      <header>
        <Link
          href="/account/resident"
          className="text-xs font-medium text-indigo-600 hover:text-indigo-500"
        >
          ← Back to resident dashboard
        </Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-zinc-900">
          Pay PS4 add-on
        </h1>
        <p className="mt-1 text-sm text-zinc-500">{PS4_ADDON_LABEL}</p>
      </header>

      <section className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm">
        <dl className="grid grid-cols-2 gap-2 text-sm">
          <dt className="text-zinc-500">Plan</dt>
          <dd className="text-right font-medium">{plan.label}</dd>
          <dt className="text-zinc-500">Duration</dt>
          <dd className="text-right">{plan.durationDays} days</dd>
          <dt className="text-zinc-500">Status</dt>
          <dd className="text-right capitalize">{membership.status.replace('_', ' ')}</dd>
          {membership.expiresAt ? (
            <>
              <dt className="text-zinc-500">Current expiry</dt>
              <dd className="text-right">{formatDate(membership.expiresAt)}</dd>
            </>
          ) : null}
          <dt className="text-base font-semibold text-zinc-900">Amount due</dt>
          <dd className="text-right text-base font-semibold">{paiseToInr(membership.amountPaise)}</dd>
        </dl>
      </section>

      {sp.action === 'upgrade' && !sp.plan ? (
        <section className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-zinc-900">Upgrade plan</h2>
          <ul className="mt-3 space-y-2">
            {(['biweekly', 'monthly'] as const)
              .filter((p) => p !== membership.plan)
              .map((p) => (
                <li key={p}>
                  <Link
                    href={`/account/resident/pay-ps4/${membershipId}?action=upgrade&plan=${p}`}
                    className="flex justify-between rounded-lg border border-zinc-200 px-3 py-2 text-sm hover:bg-zinc-50"
                  >
                    <span>{PS4_PLANS[p].label}</span>
                    <span className="font-semibold">{paiseToInr(PS4_PLANS[p].pricePaise)}</span>
                  </Link>
                </li>
              ))}
          </ul>
        </section>
      ) : membership.status === 'pending_payment' ? (
        membership.paymentProofUrl ? (
          <div className="space-y-3">
            <div className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900 ring-1 ring-inset ring-amber-200">
              Payment proof received — lounge access activates once admin verifies your UPI payment
              (usually within a few hours).
            </div>
            <a
              href={membership.paymentProofUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm font-medium text-indigo-600 hover:underline"
            >
              View uploaded screenshot →
            </a>
          </div>
        ) : (
          <Ps4PaymentProofForm
            membershipId={membership.id}
            amountLabel={paiseToInr(membership.amountPaise)}
            uploadScreenshot={uploadPaymentScreenshotAction}
            qrImageUrl={qrImageUrl}
            upiId={upiId}
          />
        )
      ) : active?.id === membership.id ? (
        <p className="rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
          Your PS4 add-on is active until {formatDate(membership.expiresAt!)}.
        </p>
      ) : null}
    </div>
  );
}
