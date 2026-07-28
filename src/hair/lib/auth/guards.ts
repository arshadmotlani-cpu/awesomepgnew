import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { getHairSession, type HairAdmin } from './session';
import { isHairHostFromHeaders, isHairHost } from '@/src/hair/lib/host';

export class HairAuthError extends Error {
  constructor(message = 'Authentication required') {
    super(message);
    this.name = 'HairAuthError';
  }
}

export class HairHostError extends Error {
  constructor(message = 'For Your Hair host required') {
    super(message);
    this.name = 'HairHostError';
  }
}

export async function requireHairHost(): Promise<void> {
  const hdrs = await headers();
  if (!isHairHostFromHeaders(hdrs) && hdrs.get('x-hair-app') !== '1') {
    throw new HairHostError();
  }
}

export async function requireHairAuth(): Promise<HairAdmin> {
  await requireHairHost();
  const session = await getHairSession();
  if (!session) throw new HairAuthError();
  return session.admin;
}

export async function requireHairAuthPage(): Promise<HairAdmin> {
  await requireHairHost();
  const session = await getHairSession();
  if (!session) redirect('/login');
  return session.admin;
}

export async function getHairAuthOptional(): Promise<HairAdmin | null> {
  const session = await getHairSession();
  return session?.admin ?? null;
}

export function safeHairNextPath(next: string): string {
  if (!next.startsWith('/') || next.startsWith('//') || next.includes('\\') || next.includes('@')) {
    return '/dashboard';
  }
  try {
    const u = new URL(next, 'https://fyhair.awesomepg.in');
    if (!isHairHost(u.hostname)) return '/dashboard';
    if (u.pathname.startsWith('/fyh')) {
      return u.pathname.replace(/^\/fyh/, '') || '/dashboard';
    }
    return u.pathname + u.search;
  } catch {
    return '/dashboard';
  }
}
