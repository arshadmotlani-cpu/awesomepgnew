import { redirect } from 'next/navigation';
import { getPlatformSession } from '@/src/platform/lib/auth/session';

export class PlatformAuthError extends Error {
  constructor(message = 'Platform authentication required') {
    super(message);
    this.name = 'PlatformAuthError';
  }
}

export async function requirePlatformAuth() {
  const session = await getPlatformSession();
  if (!session) throw new PlatformAuthError();
  return session;
}

export async function requirePlatformAuthPage() {
  const session = await getPlatformSession();
  if (!session) redirect('/platform/auth/login');
  return session;
}

export async function requirePlatformAdminPage() {
  const session = await requirePlatformAuthPage();
  if (!session.isPlatformAdmin) {
    // Do not silently dump non-admins onto a page that looks like "admin home".
    redirect('/platform/dashboard?error=platform_admin_required');
  }
  return session;
}

export async function getPlatformAuthOptional() {
  return getPlatformSession();
}
