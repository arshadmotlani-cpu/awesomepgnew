import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { getOwnerSession, type OwnerAdmin } from './session';
import { isOwnerHostFromHeaders } from '@/src/owner/lib/host';
import { OWNER_PUBLIC_PREFIXES } from '@/src/owner/lib/host';

export class OwnerAuthError extends Error {
  constructor(message = 'Authentication required') {
    super(message);
    this.name = 'OwnerAuthError';
  }
}

export class OwnerHostError extends Error {
  constructor(message = 'Owner OS host required') {
    super(message);
    this.name = 'OwnerHostError';
  }
}

export async function requireOwnerHost(): Promise<void> {
  const hdrs = await headers();
  if (!isOwnerHostFromHeaders(hdrs) && hdrs.get('x-owner-app') !== '1') {
    throw new OwnerHostError();
  }
}

export async function requireOwnerAuth(): Promise<OwnerAdmin> {
  await requireOwnerHost();
  const session = await getOwnerSession();
  if (!session) throw new OwnerAuthError();
  return session.admin;
}

export async function requireOwnerAuthPage(): Promise<OwnerAdmin> {
  await requireOwnerHost();
  const session = await getOwnerSession();
  if (!session) redirect('/login');
  return session.admin;
}

export function safeOwnerNextPath(next: string): string {
  try {
    const u = new URL(next, 'https://owner.awesomepg.in');
    if (u.origin !== 'https://owner.awesomepg.in') return '/dashboard';
    const path = u.pathname || '/dashboard';
    if (path === '/login' || path.startsWith('/auth')) return '/dashboard';
    const allowed = OWNER_PUBLIC_PREFIXES.some((p) => path === p || path.startsWith(`${p}/`));
    return allowed ? `${path}${u.search}` : '/dashboard';
  } catch {
    return '/dashboard';
  }
}
