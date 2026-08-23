'use server';

import { redirect } from 'next/navigation';
import { and, eq } from 'drizzle-orm';
import { getHairSession } from '@/src/hair/lib/auth/session';
import { hairAppRedirect } from '@/src/hair/lib/host';
import { isFyhSaasTenantEnabled } from '@/src/hair/lib/tenant/flags';
import { resolvePlatformUserIdForHairSession } from '@/src/hair/lib/tenant/sessionIdentity';
import { createCheckoutSession } from '@/src/platform/billing/stripe';
import { createPlatformClient } from '@/src/platform/db/client';
import { hasPlatformDatabaseUrl } from '@/src/platform/lib/db/env';
import { platformMemberships } from '@/src/platform/db/schema';

async function assertBillingActor(userId: string, organizationId: string): Promise<boolean> {
  if (!hasPlatformDatabaseUrl()) return false;
  const { db, close } = createPlatformClient({ max: 1 });
  try {
    const [row] = await db
      .select({ accessRole: platformMemberships.accessRole })
      .from(platformMemberships)
      .where(
        and(
          eq(platformMemberships.userId, userId),
          eq(platformMemberships.organizationId, organizationId),
          eq(platformMemberships.isActive, true),
        ),
      )
      .limit(1);
    return row?.accessRole === 'owner' || row?.accessRole === 'co_owner';
  } finally {
    await close();
  }
}

export async function startPlatformCheckoutAction(formData: FormData): Promise<void> {
  if (!isFyhSaasTenantEnabled()) {
    redirect(await hairAppRedirect('/dashboard/revenue'));
  }
  const organizationId = String(formData.get('organizationId') ?? '').trim();
  const planId = String(formData.get('planId') ?? '').trim() || undefined;
  if (!organizationId) redirect(await hairAppRedirect('/subscribe?error=missing'));

  const session = await getHairSession();
  if (!session) redirect(await hairAppRedirect('/login'));

  const userId = await resolvePlatformUserIdForHairSession({
    workforceEmployeeId: session.workforceEmployeeId,
    adminId: session.admin.id,
    adminEmail: session.admin.email,
  });
  if (!userId || !(await assertBillingActor(userId, organizationId))) {
    redirect(await hairAppRedirect('/subscribe?error=forbidden'));
  }

  const origin =
    process.env.FYH_PUBLIC_ORIGIN?.trim() ||
    process.env.FYH_PUBLIC_BASE_URL?.trim() ||
    'https://fyhair.awesomepg.in';

  let checkoutUrl: string;
  try {
    const result = await createCheckoutSession({
      organizationId,
      planId,
      successUrl: `${origin.replace(/\/$/, '')}/subscribe?success=1`,
      cancelUrl: `${origin.replace(/\/$/, '')}/subscribe?canceled=1`,
      customerEmail: session.admin.email,
    });
    checkoutUrl = result.checkoutUrl;
  } catch {
    redirect(await hairAppRedirect('/subscribe?error=checkout'));
  }
  redirect(checkoutUrl);
}
