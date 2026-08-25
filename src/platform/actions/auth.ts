'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { authenticatePlatformUser } from '@/src/platform/services/auth';
import {
  createPlatformSession,
  revokePlatformSession,
  writePlatformSessionCookie,
} from '@/src/platform/lib/auth/session';
import { safePlatformNext } from '@/src/platform/lib/auth/safePlatformNext';

export type PlatformLoginState = { error?: string };

export async function platformLoginAction(
  _prev: PlatformLoginState,
  formData: FormData,
): Promise<PlatformLoginState> {
  const email = String(formData.get('email') ?? '').trim();
  const password = String(formData.get('password') ?? '');
  const rememberMe = String(formData.get('rememberMe') ?? '') === 'on';
  const next = String(formData.get('next') ?? '/platform/dashboard');

  const result = await authenticatePlatformUser(email, password);
  if (!result.ok) return { error: result.error };

  const { token, maxAgeSeconds } = await createPlatformSession(result.userId, rememberMe);
  await writePlatformSessionCookie(token, maxAgeSeconds);

  redirect(safePlatformNext(next));
}

export async function platformLogoutAction(): Promise<void> {
  await revokePlatformSession();
  const cookieStore = await cookies();
  cookieStore.delete('apg_platform_session');
  redirect('/platform/auth/login');
}
