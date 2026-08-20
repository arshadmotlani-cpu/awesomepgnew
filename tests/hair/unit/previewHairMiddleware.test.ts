import assert from 'node:assert/strict';
import test from 'node:test';
import { NextRequest } from 'next/server';
import { middleware } from '../../../middleware';
import {
  previewFyhMiddleware,
  shouldRunPreviewFyhMiddleware,
} from '../../../src/hair/middleware/previewFyhMiddleware';

function withVercelEnv(env: string | undefined, fn: () => void) {
  const prev = process.env.VERCEL_ENV;
  if (env === undefined) delete process.env.VERCEL_ENV;
  else process.env.VERCEL_ENV = env;
  try {
    fn();
  } finally {
    if (prev === undefined) delete process.env.VERCEL_ENV;
    else process.env.VERCEL_ENV = prev;
  }
}

test('shouldRunPreviewFyhMiddleware only on preview /fyh paths', () => {
  withVercelEnv('preview', () => {
    assert.equal(shouldRunPreviewFyhMiddleware('/fyh/auth/login'), true);
    assert.equal(shouldRunPreviewFyhMiddleware('/fyh/dashboard'), true);
    assert.equal(shouldRunPreviewFyhMiddleware('/fyh/i/FYH-00001'), true);
    assert.equal(shouldRunPreviewFyhMiddleware('/platform/dashboard'), false);
    assert.equal(shouldRunPreviewFyhMiddleware('/dashboard'), false);
  });
  withVercelEnv('production', () => {
    assert.equal(shouldRunPreviewFyhMiddleware('/fyh/auth/login'), false);
  });
});

test('previewFyhMiddleware redirects unauthenticated protected paths to /fyh/auth/login', () => {
  const req = new NextRequest('https://awesomepg-abc.vercel.app/fyh/dashboard', {
    headers: { host: 'awesomepg-abc.vercel.app' },
  });
  const headers = new Headers(req.headers);
  const res = previewFyhMiddleware(req, headers);
  assert.equal(res.status, 307);
  const loc = res.headers.get('location') ?? '';
  assert.ok(loc.includes('/fyh/auth/login'));
  assert.ok(loc.includes('next=%2Fdashboard'));
});

test('previewFyhMiddleware attaches x-hair-app for public paths', () => {
  const req = new NextRequest('https://awesomepg-abc.vercel.app/fyh/auth/login', {
    headers: { host: 'awesomepg-abc.vercel.app' },
  });
  const headers = new Headers(req.headers);
  const res = previewFyhMiddleware(req, headers);
  assert.equal(res.status, 200);
  assert.equal(headers.get('x-hair-app'), '1');
  assert.equal(headers.get('x-hair-pathname'), '/fyh/auth/login');
});

test('root middleware allows /fyh on vercel.app when VERCEL_ENV=preview', () => {
  withVercelEnv('preview', async () => {
    const req = new NextRequest('https://awesomepg-abc.vercel.app/fyh/auth/login', {
      headers: { host: 'awesomepg-abc.vercel.app' },
    });
    const res = await middleware(req);
    assert.notEqual(res.status, 404);
  });
});

test('root middleware blocks /fyh on vercel.app when not preview', () => {
  withVercelEnv('production', async () => {
    const req = new NextRequest('https://awesomepg-abc.vercel.app/fyh/auth/login', {
      headers: { host: 'awesomepg-abc.vercel.app' },
    });
    const res = await middleware(req);
    assert.equal(res.status, 404);
  });
});
