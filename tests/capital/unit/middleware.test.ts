import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { NextRequest } from 'next/server';
import { capitalMiddleware, shouldRunCapitalMiddleware } from '../../../src/capital/middleware/capitalMiddleware';
import { isCapitalHost, isCapitalProtectedPath, isPgPath } from '../../../src/capital/lib/host';

function req(path: string, host: string, cookie?: string) {
  const url = `https://${host}${path}`;
  const init: RequestInit = { headers: { host } };
  if (cookie) {
    init.headers = { ...init.headers, cookie };
  }
  return new NextRequest(url, init);
}

describe('capital middleware routing', () => {
  it('invest.awesomepg.in activates capital middleware', () => {
    assert.equal(shouldRunCapitalMiddleware(req('/', 'invest.awesomepg.in')), true);
  });

  it('www.awesomepg.in does not activate capital middleware', () => {
    assert.equal(shouldRunCapitalMiddleware(req('/', 'www.awesomepg.in')), false);
  });

  it('awesomepg.in does not activate capital middleware', () => {
    assert.equal(shouldRunCapitalMiddleware(req('/', 'awesomepg.in')), false);
  });

  it('invest host blocks PG /admin paths with 404', () => {
    const res = capitalMiddleware(req('/admin', 'invest.awesomepg.in'));
    assert.equal(res.status, 404);
  });

  it('invest host blocks PG /pgs and marketing paths with 404', () => {
    assert.equal(capitalMiddleware(req('/pgs', 'invest.awesomepg.in')).status, 404);
    assert.equal(capitalMiddleware(req('/guide', 'invest.awesomepg.in')).status, 404);
  });

  it('invest host activates when only x-forwarded-host is set', () => {
    const url = 'https://awesomepg-k59k.vercel.app/';
    const request = new NextRequest(url, {
      headers: {
        host: 'awesomepg-k59k.vercel.app',
        'x-forwarded-host': 'invest.awesomepg.in',
      },
    });
    assert.equal(shouldRunCapitalMiddleware(request), true);
    const res = capitalMiddleware(request);
    assert.equal(res.status, 307);
    assert.ok(res.headers.get('location')?.includes('/login'));
  });

  it('invest host redirects unauthenticated /dashboard to /login', () => {
    const res = capitalMiddleware(req('/dashboard', 'invest.awesomepg.in'));
    assert.equal(res.status, 307);
    assert.ok(res.headers.get('location')?.includes('/login'));
  });

  it('invest host rewrites /login to /auth/login when unauthenticated', () => {
    const res = capitalMiddleware(req('/login', 'invest.awesomepg.in'));
    const rewrite = res.headers.get('x-middleware-rewrite');
    assert.ok(rewrite?.includes('/auth/login'));
  });

  it('invest host root redirects to login without session', () => {
    const res = capitalMiddleware(req('/', 'invest.awesomepg.in'));
    assert.equal(res.status, 307);
    assert.ok(res.headers.get('location')?.endsWith('/login'));
  });

  it('invest host root redirects to dashboard with session cookie', () => {
    const res = capitalMiddleware(
      req('/', 'invest.awesomepg.in', 'ac_session=abc'),
    );
    assert.equal(res.status, 307);
    assert.ok(res.headers.get('location')?.endsWith('/dashboard'));
  });
});

describe('host helpers', () => {
  it('isCapitalHost', () => {
    assert.equal(isCapitalHost('invest.awesomepg.in'), true);
    assert.equal(isCapitalHost('www.awesomepg.in'), false);
    assert.equal(isCapitalHost('awesomepg.in'), false);
  });

  it('isPgPath', () => {
    assert.equal(isPgPath('/admin/login'), true);
    assert.equal(isPgPath('/dashboard'), false);
  });

  it('isCapitalProtectedPath', () => {
    assert.equal(isCapitalProtectedPath('/dashboard'), true);
    assert.equal(isCapitalProtectedPath('/login'), false);
    assert.equal(isCapitalProtectedPath('/auth/login'), false);
  });
});
