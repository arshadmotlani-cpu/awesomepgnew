import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { getCapitalSession, type CapitalAdmin } from './session';
import { isCapitalHostFromHeaders } from '@/src/capital/lib/host';

export class CapitalAuthError extends Error {
  constructor(message = 'Authentication required') {
    super(message);
    this.name = 'CapitalAuthError';
  }
}

export class CapitalHostError extends Error {
  constructor(message = 'Capital host required') {
    super(message);
    this.name = 'CapitalHostError';
  }
}

export async function requireCapitalHost(): Promise<void> {
  const hdrs = await headers();
  if (!isCapitalHostFromHeaders(hdrs) && hdrs.get('x-capital-app') !== '1') {
    throw new CapitalHostError();
  }
}

export async function requireCapitalAuth(): Promise<CapitalAdmin> {
  await requireCapitalHost();
  const session = await getCapitalSession();
  if (!session) throw new CapitalAuthError();
  return session.admin;
}

export async function requireCapitalAuthPage(): Promise<CapitalAdmin> {
  await requireCapitalHost();
  const session = await getCapitalSession();
  if (!session) redirect('/login');
  return session.admin;
}

export async function getCapitalAuthOptional(): Promise<CapitalAdmin | null> {
  const session = await getCapitalSession();
  return session?.admin ?? null;
}

export function safeCapitalNextPath(next: string): string {
  if (!next.startsWith('/') || next.startsWith('//') || next.includes('\\') || next.includes('@')) {
    return '/dashboard';
  }
  try {
    const u = new URL(next, 'https://invest.awesomepg.in');
    if (u.origin !== 'https://invest.awesomepg.in') return '/dashboard';
    return u.pathname + u.search;
  } catch {
    return '/dashboard';
  }
}
