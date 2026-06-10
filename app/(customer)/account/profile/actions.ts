'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { getCustomerSession } from '@/src/lib/auth/session';
import { updateCustomerProfile } from '@/src/services/profile';

export type ProfileActionState =
  | { status: 'idle' }
  | { status: 'error'; message: string }
  | { status: 'ok'; message: string };

export async function updateProfileAction(
  _prev: ProfileActionState,
  formData: FormData,
): Promise<ProfileActionState> {
  const session = await getCustomerSession();
  if (!session) {
    return { status: 'error', message: 'Sign in to update your profile.' };
  }

  const fullName = String(formData.get('fullName') ?? '').trim();
  const email = String(formData.get('email') ?? '').trim();
  const phone = String(formData.get('phone') ?? '').trim();

  const result = await updateCustomerProfile({
    customerId: session.customerId,
    fullName,
    email,
    phone,
  });

  if (!result.ok) {
    return { status: 'error', message: result.message };
  }

  revalidatePath('/account/profile');
  revalidatePath('/booking/new');

  const next = String(formData.get('next') ?? '').trim();
  if (next && next.startsWith('/')) {
    redirect(next);
  }

  return { status: 'ok', message: 'Profile saved.' };
}
