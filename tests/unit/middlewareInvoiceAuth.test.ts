import { strict as assert } from 'node:assert';
import test from 'node:test';
import { NextRequest } from 'next/server';
import { middleware } from '../../middleware';
import { CUSTOMER_SESSION_COOKIE } from '../../src/lib/auth/constants';

function requestFor(path: string, cookies: Record<string, string> = {}) {
  const url = `https://www.awesomepg.in${path}`;
  const req = new NextRequest(url);
  for (const [name, value] of Object.entries(cookies)) {
    req.cookies.set(name, value);
  }
  return req;
}

test('middleware allows legacy resident invoice alias without login', async () => {
  const path = '/resident/invoices/aa8b65f9-4726-4ee4-b074-8cb3c8827665';
  const res = await middleware(requestFor(path));
  assert.equal(res.status, 200);
});

test('middleware allows public /i/ share path without login', async () => {
  const path = '/i/abc123sharetoken';
  const res = await middleware(requestFor(path));
  assert.equal(res.status, 200);
});

test('middleware still requires login for account invoice path', async () => {
  const path = '/account/resident/invoices/aa8b65f9-4726-4ee4-b074-8cb3c8827665';
  const res = await middleware(requestFor(path));
  assert.equal(res.status, 307);
  const location = res.headers.get('location');
  assert.ok(location?.includes('/login?next='));
});

test('middleware passes account invoice when customer session cookie present', async () => {
  const path = '/account/resident/invoices/aa8b65f9-4726-4ee4-b074-8cb3c8827665';
  const res = await middleware(
    requestFor(path, { [CUSTOMER_SESSION_COOKIE]: 'customer-token' }),
  );
  assert.equal(res.status, 200);
});
