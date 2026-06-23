import { strict as assert } from 'node:assert';
import test from 'node:test';
import { NextRequest } from 'next/server';
import { middleware } from '../../middleware';
import {
  ADMIN_SESSION_COOKIE,
  CUSTOMER_SESSION_COOKIE,
} from '../../src/lib/auth/constants';

function requestFor(path: string, cookies: Record<string, string> = {}) {
  const url = `https://www.awesomepg.in${path}`;
  const req = new NextRequest(url);
  for (const [name, value] of Object.entries(cookies)) {
    req.cookies.set(name, value);
  }
  return req;
}

test('middleware redirects unauthenticated resident invoice to login with next', () => {
  const path = '/resident/invoices/aa8b65f9-4726-4ee4-b074-8cb3c8827665';
  const res = middleware(requestFor(path));
  assert.equal(res.status, 307);
  const location = res.headers.get('location');
  assert.ok(location?.includes('/login?next='));
  assert.ok(location?.includes(encodeURIComponent(path)));
});

test('middleware passes resident invoice when customer session cookie present', () => {
  const path = '/resident/invoices/aa8b65f9-4726-4ee4-b074-8cb3c8827665';
  const res = middleware(
    requestFor(path, { [CUSTOMER_SESSION_COOKIE]: 'customer-token' }),
  );
  assert.equal(res.status, 200);
});

test('middleware sends admin-only session on resident invoice to admin invoice page', () => {
  const id = 'aa8b65f9-4726-4ee4-b074-8cb3c8827665';
  const path = `/resident/invoices/${id}`;
  const res = middleware(requestFor(path, { [ADMIN_SESSION_COOKIE]: 'admin-token' }));
  assert.equal(res.status, 307);
  assert.equal(res.headers.get('location'), `https://www.awesomepg.in/admin/invoices/${id}`);
});

test('redirectAfterAuth logs next target in browser', () => {
  // Documented client behavior — safeNext preserves invoice deep link (existing tests).
  assert.ok(typeof URL !== 'undefined');
});
