import assert from 'node:assert/strict';
import test from 'node:test';
import { NextRequest } from 'next/server';
import { middleware } from '../../../middleware';
import { signPlatformSessionPayload } from '../../../src/platform/lib/auth/sessionCookie';

function req(path: string, cookie?: string) {
  const headers: Record<string, string> = { host: 'awesomepg-k59k.vercel.app' };
  if (cookie) headers.cookie = `${cookie.name}=${cookie.value}`;
  return new NextRequest(`https://awesomepg-k59k.vercel.app${path}`, { headers });
}

test('platform login renders without redirect when no session cookie', () => {
  const res = middleware(req('/platform/auth/login'));
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('cache-control'), 'no-store, must-revalidate');
  assert.equal(res.headers.get('x-platform-app'), '1');
});

test('platform login clears stale session cookie instead of redirect loop', () => {
  const res = middleware(req('/platform/auth/login', { name: 'apg_platform_session', value: 'fake' }));
  assert.equal(res.status, 200);
  const cleared = res.cookies.get('apg_platform_session');
  assert.equal(cleared?.value, '');
});

test('platform login redirects to dashboard only for valid signed cookie', () => {
  const token = signPlatformSessionPayload('user-1', new Date(Date.now() + 60_000));
  const res = middleware(
    req('/platform/auth/login', { name: 'apg_platform_session', value: token }),
  );
  assert.equal(res.status, 307);
  assert.ok(res.headers.get('location')?.includes('/platform/dashboard'));
});

test('platform admin redirects unauthenticated users to login', () => {
  const res = middleware(req('/platform/admin'));
  assert.equal(res.status, 307);
  assert.ok(res.headers.get('location')?.includes('/platform/auth/login'));
});
