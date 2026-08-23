import { redirect } from 'next/navigation';
import { submitManualSubscribePaymentAction } from '@/src/hair/actions/subscribe';
import { Button } from '@/src/hair/components/ui/button';
import { getHairSession } from '@/src/hair/lib/auth/session';
import { requireHairHost } from '@/src/hair/lib/auth/guards';
import { isFyhSaasTenantEnabled } from '@/src/hair/lib/tenant/flags';
import { resolvePlatformUserIdForHairSession } from '@/src/hair/lib/tenant/sessionIdentity';
import { listMembershipsForBilling } from '@/src/platform/services/memberships';
import {
  getBillingQrSettings,
  getSubscribeAmountForOrganization,
  listSubmissionsForOrg,
} from '@/src/platform/services/manualSubscriptionPayments';

function formatInrFromPaise(paise: number): string {
  if (!paise || paise <= 0) return '—';
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(paise / 100);
}

export default async function SubscribePage({
  searchParams,
}: {
  searchParams: Promise<{
    error?: string;
    submitted?: string;
    org?: string;
  }>;
}) {
  const params = await searchParams;
  if (!isFyhSaasTenantEnabled()) redirect('/dashboard/revenue');
  await requireHairHost();
  const session = await getHairSession();
  if (!session) redirect('/login');

  const userId = await resolvePlatformUserIdForHairSession({
    workforceEmployeeId: session.workforceEmployeeId,
    adminEmail: session.admin.email,
  });
  const memberships = userId ? await listMembershipsForBilling(userId) : [];
  const locked = memberships.filter((m) => !m.accessAllowed);
  const qr = await getBillingQrSettings();

  const amounts = new Map<
    string,
    Awaited<ReturnType<typeof getSubscribeAmountForOrganization>>
  >();
  const pendingByOrg = new Map<string, string | null>();
  for (const m of memberships) {
    amounts.set(m.organizationId, await getSubscribeAmountForOrganization(m.organizationId));
    const history = await listSubmissionsForOrg(m.organizationId);
    const pending = history.find((h) => h.status === 'pending');
    pendingByOrg.set(m.organizationId, pending?.transactionRef ?? null);
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-lg flex-col justify-center px-6 py-12">
      <h1 className="text-3xl tracking-tight text-fyh-text">Subscription</h1>
      <p className="mt-2 text-sm text-fyh-text-secondary">
        Pay via UPI QR, then enter the transaction ID. Access unlocks after platform admin approval.
      </p>

      {params.submitted ? (
        <p className="mt-4 text-sm text-emerald-800">
          Payment submitted. We will unlock access after verifying your transaction ID.
        </p>
      ) : null}
      {params.error === 'txn' ? (
        <p className="mt-4 text-sm text-red-800">Transaction ID is required.</p>
      ) : null}
      {params.error && params.error !== 'txn' ? (
        <p className="mt-4 text-sm text-red-800">Could not submit payment ({params.error}).</p>
      ) : null}

      {(qr?.qrImageUrl || qr?.upiId) && (
        <div className="mt-6 space-y-3 border-b border-fyh-border pb-6">
          {qr.qrImageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={qr.qrImageUrl}
              alt="UPI payment QR"
              className="mx-auto h-48 w-48 object-contain"
            />
          ) : null}
          {qr.upiId ? (
            <p className="text-center text-sm text-fyh-text">
              UPI ID: <span className="font-mono">{qr.upiId}</span>
            </p>
          ) : null}
        </div>
      )}

      <ul className="mt-6 space-y-6">
        {memberships.map((m) => {
          const planInfo = amounts.get(m.organizationId);
          const existingTxn = pendingByOrg.get(m.organizationId);
          const canPay =
            (m.accessRole === 'owner' || m.accessRole === 'co_owner') &&
            (!m.accessAllowed || m.subscriptionStatus === 'past_due');

          return (
            <li key={m.membershipId} className="border-b border-fyh-border pb-6">
              <p className="font-medium text-fyh-text">{m.organizationName}</p>
              <p className="text-xs text-fyh-text-secondary">
                Status: {m.subscriptionStatus ?? 'none'} · {m.accessAllowed ? 'allowed' : 'locked'}
                {planInfo ? ` · ${planInfo.planName}` : ''}
              </p>
              {planInfo && planInfo.amountPaise > 0 ? (
                <p className="mt-1 text-sm text-fyh-text">
                  Amount due: {formatInrFromPaise(planInfo.amountPaise)}
                  {planInfo.billingInterval === 'year' ? ' / year' : ' / month'}
                </p>
              ) : null}

              {canPay ? (
                existingTxn ? (
                  <p className="mt-3 text-sm text-fyh-text-secondary">
                    Pending review for transaction ID{' '}
                    <span className="font-mono text-fyh-text">{existingTxn}</span>.
                  </p>
                ) : (
                  <form action={submitManualSubscribePaymentAction} className="mt-3 space-y-3">
                    <input type="hidden" name="organizationId" value={m.organizationId} />
                    <label className="block text-sm text-fyh-text">
                      UPI transaction ID
                      <input
                        name="transactionRef"
                        required
                        autoComplete="off"
                        className="mt-1 w-full rounded-md border border-fyh-border bg-transparent px-3 py-2 text-sm"
                        placeholder="e.g. 123456789012"
                      />
                    </label>
                    <Button type="submit" size="sm">
                      Submit payment
                    </Button>
                  </form>
                )
              ) : null}
            </li>
          );
        })}
      </ul>

      {locked.length === 0 && memberships.length > 0 ? (
        <p className="mt-4 text-sm">
          <a className="underline" href="/dashboard/revenue">
            Continue to dashboard
          </a>
        </p>
      ) : null}
    </div>
  );
}
