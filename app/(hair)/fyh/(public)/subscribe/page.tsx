import { redirect } from 'next/navigation';
import { startSubscribeCheckoutAction } from '@/src/hair/actions/subscribe';
import { Button } from '@/src/hair/components/ui/button';
import { getHairSession } from '@/src/hair/lib/auth/session';
import { requireHairHost } from '@/src/hair/lib/auth/guards';
import { isFyhSaasTenantEnabled } from '@/src/hair/lib/tenant/flags';
import { resolvePlatformUserIdForHairSession } from '@/src/hair/lib/tenant/sessionIdentity';
import { listMembershipsForBilling } from '@/src/platform/services/memberships';

export default async function SubscribePage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; success?: string; canceled?: string }>;
}) {
  const params = await searchParams;
  if (!isFyhSaasTenantEnabled()) redirect('/dashboard/revenue');
  await requireHairHost();
  const session = await getHairSession();
  if (!session) redirect('/login');

  const userId = await resolvePlatformUserIdForHairSession({
    workforceEmployeeId: session.workforceEmployeeId,
    adminId: session.admin.id,
    adminEmail: session.admin.email,
  });
  const memberships = userId ? await listMembershipsForBilling(userId) : [];
  const locked = memberships.filter((m) => !m.accessAllowed);

  return (
    <div className="mx-auto flex min-h-screen max-w-lg flex-col justify-center px-6 py-12">
      <h1 className="text-3xl tracking-tight text-fyh-text">Subscription</h1>
      <p className="mt-2 text-sm text-fyh-text-secondary">
        Activate or renew For Your Hair for your salon. Billing uses Platform Stripe keys only.
      </p>
      {params.success ? (
        <p className="mt-4 text-sm text-emerald-800">Payment received. Access unlocks after Stripe confirms.</p>
      ) : null}
      {params.canceled ? (
        <p className="mt-4 text-sm text-amber-900">Checkout canceled.</p>
      ) : null}
      {params.error ? (
        <p className="mt-4 text-sm text-red-800">Could not start checkout ({params.error}).</p>
      ) : null}
      <ul className="mt-6 space-y-4">
        {memberships.map((m) => (
          <li key={m.membershipId} className="border-b border-fyh-border pb-4">
            <p className="font-medium text-fyh-text">{m.organizationName}</p>
            <p className="text-xs text-fyh-text-secondary">
              Status: {m.subscriptionStatus ?? 'none'} · {m.accessAllowed ? 'allowed' : 'locked'}
            </p>
            {(m.accessRole === 'owner' || m.accessRole === 'co_owner') &&
            (!m.accessAllowed || m.subscriptionStatus === 'past_due') ? (
              <form action={startSubscribeCheckoutAction} className="mt-2">
                <input type="hidden" name="organizationId" value={m.organizationId} />
                <Button type="submit" size="sm">
                  Subscribe
                </Button>
              </form>
            ) : null}
          </li>
        ))}
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
