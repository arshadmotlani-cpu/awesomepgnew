import assert from 'node:assert/strict';
import test from 'node:test';
import { NextRequest } from 'next/server';
import { HAIR_SESSION_COOKIE } from '../../../src/hair/lib/auth/constants.ts';
import { safeHairNextPath } from '../../../src/hair/lib/auth/guards.ts';
import { isHairTenantExemptPath } from '../../../src/hair/lib/host.ts';
import { hairMiddleware } from '../../../src/hair/middleware/hairMiddleware.ts';

function fyhReq(path: string, cookie?: string): NextRequest {
  const headers: Record<string, string> = { host: 'fyhair.awesomepg.in' };
  if (cookie) headers.cookie = cookie;
  return new NextRequest(`https://fyhair.awesomepg.in${path}`, { headers });
}

function hopCount(startPath: string, cookie?: string, max = 8): { hops: string[]; statuses: number[] } {
  const hops: string[] = [];
  const statuses: number[] = [];
  let path = startPath;
  for (let i = 0; i < max; i++) {
    const res = hairMiddleware(fyhReq(path, cookie));
    statuses.push(res.status);
    const loc = res.headers.get('location');
    if (res.status >= 300 && res.status < 400 && loc) {
      const next = new URL(loc, 'https://fyhair.awesomepg.in');
      hops.push(`${path} → ${next.pathname}${next.search}`);
      path = `${next.pathname}${next.search}`;
      continue;
    }
    hops.push(`${path} → ${res.status}`);
    break;
  }
  return { hops, statuses };
}

test('unauthenticated /landing redirects to /login once and login does not bounce', () => {
  const landing = hairMiddleware(fyhReq('/landing'));
  assert.equal(landing.status, 307);
  const loc = landing.headers.get('location') ?? '';
  assert.ok(loc.includes('/login'));
  assert.ok(loc.includes('next=%2Flanding'));

  const login = hairMiddleware(fyhReq('/login?next=%2Flanding'));
  assert.ok(login.status < 300 || login.status === 200);
  assert.equal(login.headers.get('location'), null);

  const { hops } = hopCount('/landing');
  assert.equal(hops.length, 2);
  assert.ok(hops[0]?.includes('/login'));
});

test('stale fyh_session must not create /login ↔ /landing middleware loop', () => {
  const cookie = `${HAIR_SESSION_COOKIE}=invalid-token-debug`;
  const login = hairMiddleware(fyhReq('/login', cookie));
  assert.equal(login.headers.get('location'), null);

  const loginTenant = hairMiddleware(fyhReq('/login?error=tenant', cookie));
  assert.equal(loginTenant.headers.get('location'), null);

  const landing = hairMiddleware(fyhReq('/landing', cookie));
  assert.ok(landing.status < 300 || landing.status === 200);

  const { hops } = hopCount('/login', cookie);
  assert.equal(hops.length, 1);
  assert.ok(!hops.some((h) => h.includes('/landing')));
});

test('/dashboard and /team unauthenticated redirect once to /login', () => {
  for (const path of ['/dashboard', '/team']) {
    const { hops, statuses } = hopCount(path);
    assert.equal(statuses[0], 307);
    assert.ok(hops[0]?.includes('/login'));
    const login = hairMiddleware(fyhReq(`/login?next=${encodeURIComponent(path)}`));
    assert.equal(login.headers.get('location'), null);
  }
});

test('select-organization is tenant-exempt so auth can terminate', () => {
  assert.equal(isHairTenantExemptPath('/select-organization'), true);
  assert.equal(isHairTenantExemptPath('/fyh/select-organization'), true);
  assert.equal(isHairTenantExemptPath('/landing'), false);
});

test('post-login next=/landing maps to a real home path (not /landing)', () => {
  assert.equal(
    safeHairNextPath('/landing', { role: 'super_admin', permissions: [] }),
    '/dashboard/revenue',
  );
});
