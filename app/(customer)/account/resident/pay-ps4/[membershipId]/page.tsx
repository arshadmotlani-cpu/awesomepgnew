import Link from 'next/link';
import { redirect } from 'next/navigation';
import { uploadPaymentScreenshotAction } from '@/app/(admin)/admin/pgs/payment-actions';
import { Ps4PaymentProofForm } from '@/src/components/customer/Ps4PaymentProofForm';
import { requireCustomerSession } from '@/src/lib/auth/guards';
import { formatDateTime, paiseToInr } from '@/src/lib/format';
import { ACCOUNT_RESIDENT_HREF } from '@/src/lib/accountNavigation';
import { ACCOUNT_BACK_LINK } from '@/src/components/customer/accountStyles';
import {
  DEFAULT_ELECTRICITY_DAILY_QR_PATH,
  DEFAULT_ELECTRICITY_DAILY_UPI_ID,
} from '@/src/lib/payments/defaultQr';
import { customerPaymentProofViewUrl } from '@/src/lib/payments/proofResponse';
import { PS4_ADDON_LABEL, PS4_LOUNGE_HEADLINE, PS4_LOUNGE_HOURLY_NOTE, PS4_PLANS, type Ps4PlanId } from '@/src/lib/playstation/plans';
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
    redirect(ACCOUNT_RESIDENT_HREF);
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
        <Link href={ACCOUNT_RESIDENT_HREF} className={ACCOUNT_BACK_LINK}>
          ← Back to resident area
        </Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-white">
          Pay PS4 add-on
        </h1>
        <p className="mt-1 text-sm text-apg-silver">{PS4_ADDON_LABEL}</p>
        <p className="mt-2 text-sm font-medium text-white">{PS4_LOUNGE_HEADLINE}</p>
        <p className="mt-1 text-xs text-zinc-300">{PS4_LOUNGE_HOURLY_NOTE}</p>
      </header>

      <section className="apg-glass rounded-2xl p-5">
        <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
          <dt className="text-zinc-300">Plan</dt>
          <dd className="text-right font-semibold text-white">{plan.label}</dd>
          <dt className="text-zinc-300">Duration</dt>
          <dd className="text-right font-semibold text-white">{plan.durationDays} days</dd>
          <dt className="text-zinc-300">Status</dt>
          <dd className="text-right font-semibold capitalize text-white">
            {membership.status.replace('_', ' ')}
          </dd>
          {membership.startsAt ? (
            <>
              <dt className="text-zinc-300">Subscription starts</dt>
              <dd className="text-right font-semibold text-white">{formatDateTime(membership.startsAt)}</dd>
            </>
          ) : null}
          {membership.expiresAt ? (
            <>
              <dt className="text-zinc-300">Subscription ends</dt>
              <dd className="text-right font-semibold text-white">{formatDateTime(membership.expiresAt)}</dd>
            </>
          ) : null}
          <dt className="pt-2 text-base font-semibold text-white">Amount due</dt>
          <dd className="pt-2 text-right text-base font-semibold text-[#FF5A1F]">
            {paiseToInr(membership.amountPaise)}
          </dd>
        </dl>
      </section>

      {sp.action === 'upgrade' && !sp.plan ? (
        <section className="apg-glass rounded-2xl p-5">
          <h2 className="text-sm font-semibold text-white">Upgrade plan</h2>
          <ul className="mt-3 space-y-2">
            {(['biweekly', 'monthly'] as const)
              .filter((p) => p !== membership.plan)
              .map((p) => (
                <li key={p}>
                  <Link
                    href={`/account/resident/pay-ps4/${membershipId}?action=upgrade&plan=${p}`}
                    className="flex justify-between rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white hover:border-[#FF5A1F]/40"
                  >
                    <span>{PS4_PLANS[p].label}</span>
                    <span className="font-semibold text-[#FF5A1F]">
                      {paiseToInr(PS4_PLANS[p].pricePaise)}
                    </span>
                  </Link>
                </li>
              ))}
          </ul>
        </section>
      ) : membership.status === 'pending_payment' ? (
        membership.paymentProofUrl ? (
          <div className="space-y-3">
            <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
              Payment proof received — lounge access activates once admin verifies your UPI payment
              (usually within a few hours).
            </div>
            <a
              href={customerPaymentProofViewUrl('playstation', membership.id)}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm font-medium text-[#FF5A1F] hover:underline"
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
        <p className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">
          Your PS4 add-on is active
          {membership.startsAt && membership.expiresAt ? (
            <>
              {' '}
              from {formatDateTime(membership.startsAt)} until {formatDateTime(membership.expiresAt)}.
            </>
          ) : membership.expiresAt ? (
            <> until {formatDateTime(membership.expiresAt)}.</>
          ) : (
            <>.</>
          )}
        </p>
      ) : null}
    </div>
  );
}
