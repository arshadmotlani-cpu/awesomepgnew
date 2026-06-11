'use server';

import { redirect } from 'next/navigation';
import { requireCustomerSession } from '@/src/lib/auth/guards';
import { isPs4PlanId } from '@/src/lib/playstation/plans';
import {
  isActiveTenant,
  purchaseMembership,
  resolvePgIdForCustomer,
} from '@/src/services/playstationMembership';

export async function subscribePs4Action(formData: FormData) {
  const session = await requireCustomerSession('/account/resident/ps4/new');
  const planRaw = String(formData.get('plan') ?? '').trim();
  if (!isPs4PlanId(planRaw)) {
    throw new Error('Pick a valid plan.');
  }

  const active = await isActiveTenant(session.customerId);
  if (!active) {
    throw new Error('PS4 add-on is only available to active tenants.');
  }

  const pgId = await resolvePgIdForCustomer(session.customerId);
  if (!pgId) {
    throw new Error('Could not determine your PG.');
  }

  const membership = await purchaseMembership({
    customerId: session.customerId,
    pgId,
    plan: planRaw,
  });

  redirect(`/account/resident/pay-ps4/${membership.id}`);
}
