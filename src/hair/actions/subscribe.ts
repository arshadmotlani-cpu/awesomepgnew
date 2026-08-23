'use server';

import { redirect } from 'next/navigation';
import { getHairSession } from '@/src/hair/lib/auth/session';
import { isFyhSaasTenantEnabled } from '@/src/hair/lib/tenant/flags';
import { resolvePlatformUserIdForHairSession } from '@/src/hair/lib/tenant/sessionIdentity';
import { createCheckoutSession } from '@/src/platform/billing/stripe';
import { listMembershipsForBilling } from '@/src/platform/services/memberships';

export async function startSubscribeCheckoutAction(formData: FormData): Promise<void> {
  if (!isFyhSaasTenantEnabled()) redirect('/dashboard/revenue');

  const organizationId = String(formData.get('organizationId') ?? '').trim();
  if (!organizationId) redirect('/subscribe?error=missing');

  const session = await getHairSession();
  if (!session) redirect('/login');

  const userId = await resolvePlatformUserIdForHairSession({
    workforceEmployeeId: session.workforceEmployeeId,
    adminId: session.admin.id,
    adminEmail: session.admin.email,
  });
  if (!userId) redirect('/subscribe?error=invalid');

  const memberships = await listMembershipsForBilling(userId);
  if (!memberships.some((m) => m.organizationId === organizationId)) {
    redirect('/subscribe?error=invalid');
  }

  const origin = process.env.FYH_PUBLIC_ORIGIN?.trim() || 'https://fyhair.awesomepg.in';
  let checkoutUrl: string;
  try {
    const result = await createCheckoutSession({
      organizationId,
      successUrl: `${origin}/subscribe?success=1`,
      cancelUrl: `${origin}/subscribe?canceled=1`,
      customerEmail: session.admin.email,
    });
    checkoutUrl = result.checkoutUrl;
  } catch {
    redirect('/subscribe?error=checkout');
  }
  redirect(checkoutUrl);
}
