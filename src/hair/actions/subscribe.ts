'use server';

import { redirect } from 'next/navigation';
import { getHairSession } from '@/src/hair/lib/auth/session';
import { isFyhSaasTenantEnabled } from '@/src/hair/lib/tenant/flags';
import { resolvePlatformUserIdForHairSession } from '@/src/hair/lib/tenant/sessionIdentity';
import { listMembershipsForBilling } from '@/src/platform/services/memberships';
import { submitSubscriptionPayment } from '@/src/platform/services/manualSubscriptionPayments';

export async function submitManualSubscribePaymentAction(formData: FormData): Promise<void> {
  if (!isFyhSaasTenantEnabled()) redirect('/dashboard/revenue');

  const organizationId = String(formData.get('organizationId') ?? '').trim();
  const transactionRef = String(formData.get('transactionRef') ?? '').trim();
  if (!organizationId) redirect('/subscribe?error=missing');
  if (!transactionRef) redirect(`/subscribe?error=txn&org=${encodeURIComponent(organizationId)}`);

  const session = await getHairSession();
  if (!session) redirect('/login');

  const userId = await resolvePlatformUserIdForHairSession({
    workforceEmployeeId: session.workforceEmployeeId,
    adminEmail: session.admin.email,
  });
  if (!userId) redirect('/subscribe?error=invalid');

  const memberships = await listMembershipsForBilling(userId);
  const membership = memberships.find((m) => m.organizationId === organizationId);
  if (!membership) redirect('/subscribe?error=invalid');
  if (membership.accessRole !== 'owner' && membership.accessRole !== 'co_owner') {
    redirect('/subscribe?error=forbidden');
  }

  try {
    await submitSubscriptionPayment({
      organizationId,
      userId,
      transactionRef,
    });
  } catch {
    redirect(`/subscribe?error=submit&org=${encodeURIComponent(organizationId)}`);
  }

  redirect(`/subscribe?submitted=1&org=${encodeURIComponent(organizationId)}`);
}

/** @deprecated Thin alias — live subscribe uses manual QR + transaction ID, not Stripe. */
export async function startSubscribeCheckoutAction(formData: FormData): Promise<void> {
  return submitManualSubscribePaymentAction(formData);
}
