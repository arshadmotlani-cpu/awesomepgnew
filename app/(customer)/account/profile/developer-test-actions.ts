'use server';

import { revalidatePath } from 'next/cache';
import { cookies } from 'next/headers';
import { getCustomerSession } from '@/src/lib/auth/session';
import {
  DEV_RESIDENT_DURATION_COOKIE,
  isDeveloperTestSession,
  type DevResidentDurationMode,
} from '@/src/lib/auth/developerTestResident.server';
import { logger } from '@/src/lib/logger';
import {
  archiveActiveCheckoutSettlement,
  clearRejectedVacatingForBooking,
  ensureApprovedVacatingForDeveloperTest,
  reopenRefundSettlementForCustomer,
  setCustomerKycPending,
  setCustomerKycRejected,
} from '@/src/services/developerTestResidentOps';

export type DevTestActionState = { ok: boolean; message?: string; error?: string };

async function requireDeveloperSession() {
  const session = await getCustomerSession();
  if (!session) return { ok: false as const, error: 'Sign in required.' };
  if (!isDeveloperTestSession(session)) {
    return { ok: false as const, error: 'Developer test mode is not enabled for this account.' };
  }
  return { ok: true as const, session };
}

function revalidateResidentViews() {
  revalidatePath('/account/profile');
  revalidatePath('/account/resident');
  revalidatePath('/account/bookings');
}

export async function setDevDurationModeAction(
  mode: DevResidentDurationMode | 'actual',
): Promise<DevTestActionState> {
  const gate = await requireDeveloperSession();
  if (!gate.ok) return gate;

  const jar = await cookies();
  if (mode === 'actual') {
    jar.delete(DEV_RESIDENT_DURATION_COOKIE);
  } else {
    jar.set(DEV_RESIDENT_DURATION_COOKIE, mode, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      maxAge: 60 * 60 * 24 * 7,
    });
  }

  logger.info('developer test duration mode updated', {
    customerId: gate.session.customerId,
    email: gate.session.email,
    mode,
  });
  revalidateResidentViews();
  return {
    ok: true,
    message: mode === 'actual' ? 'Using actual booking stay type.' : `Simulating ${mode} stay.`,
  };
}

export async function reopenRefundSettlementAction(bookingId: string): Promise<DevTestActionState> {
  const gate = await requireDeveloperSession();
  if (!gate.ok) return gate;

  const result = await reopenRefundSettlementForCustomer({
    customerId: gate.session.customerId,
    bookingId,
  });
  if (!result.ok) return result;

  revalidateResidentViews();
  return { ok: true, message: 'Refund request reopened for testing.' };
}

export async function simulateKycPendingAction(): Promise<DevTestActionState> {
  const gate = await requireDeveloperSession();
  if (!gate.ok) return gate;

  await setCustomerKycPending(gate.session.customerId);
  revalidateResidentViews();
  return { ok: true, message: 'KYC status set to pending on your account.' };
}

export async function simulateKycRejectedAction(): Promise<DevTestActionState> {
  const gate = await requireDeveloperSession();
  if (!gate.ok) return gate;

  await setCustomerKycRejected(gate.session.customerId);
  revalidateResidentViews();
  return { ok: true, message: 'KYC marked rejected — you can resubmit documents.' };
}

export async function simulateApprovedVacatingAction(bookingId: string): Promise<DevTestActionState> {
  const gate = await requireDeveloperSession();
  if (!gate.ok) return gate;

  await ensureApprovedVacatingForDeveloperTest({
    customerId: gate.session.customerId,
    bookingId,
  });
  revalidateResidentViews();
  return { ok: true, message: 'Move-out notice marked approved for testing.' };
}

export async function resetRejectedVacatingAction(bookingId: string): Promise<DevTestActionState> {
  const gate = await requireDeveloperSession();
  if (!gate.ok) return gate;

  await clearRejectedVacatingForBooking({
    customerId: gate.session.customerId,
    bookingId,
  });
  revalidateResidentViews();
  return { ok: true, message: 'Rejected move-out records cleared — you can submit again.' };
}

export async function archiveCheckoutSettlementAction(bookingId: string): Promise<DevTestActionState> {
  const gate = await requireDeveloperSession();
  if (!gate.ok) return gate;

  await archiveActiveCheckoutSettlement({
    customerId: gate.session.customerId,
    bookingId,
  });
  revalidateResidentViews();
  return { ok: true, message: 'Active checkout settlement archived — start a fresh refund test.' };
}
