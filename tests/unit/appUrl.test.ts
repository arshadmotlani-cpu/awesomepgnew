import assert from 'node:assert/strict';
import test from 'node:test';
import {
  appAbsoluteUrl,
  CANONICAL_PRODUCTION_URL,
  DEVELOPMENT_APP_URL,
  getAppUrl,
} from '@/src/lib/url';

function withEnv(
  vars: Record<string, string | undefined>,
  fn: () => void,
): void {
  const prev: Record<string, string | undefined> = {};
  for (const key of Object.keys(vars)) {
    prev[key] = process.env[key];
    const value = vars[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  try {
    fn();
  } finally {
    for (const key of Object.keys(vars)) {
      const value = prev[key];
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

test('getAppUrl returns canonical production URL on Vercel production', () => {
  withEnv(
    {
      VERCEL_ENV: 'production',
      VERCEL_URL: 'awesomepg-git-main-team.vercel.app',
      NEXT_PUBLIC_APP_URL: undefined,
      NEXT_PUBLIC_BASE_URL: undefined,
    },
    () => {
      assert.equal(getAppUrl(), CANONICAL_PRODUCTION_URL);
    },
  );
});

test('getAppUrl returns Vercel preview URL on preview deployments', () => {
  withEnv(
    {
      VERCEL_ENV: 'preview',
      VERCEL_URL: 'awesomepg-pr-42.vercel.app',
    },
    () => {
      assert.equal(getAppUrl(), 'https://awesomepg-pr-42.vercel.app');
    },
  );
});

test('getAppUrl returns localhost in development', () => {
  withEnv(
    {
      VERCEL_ENV: undefined,
      VERCEL_URL: 'awesomepg-pr-42.vercel.app',
      NEXT_PUBLIC_APP_URL: undefined,
    },
    () => {
      assert.equal(getAppUrl(), DEVELOPMENT_APP_URL);
    },
  );
});

test('appAbsoluteUrl builds invoice share path on production', () => {
  withEnv({ VERCEL_ENV: 'production' }, () => {
    const url = appAbsoluteUrl('/resident/invoices/550e8400-e29b-41d4-a716-446655440000');
    assert.equal(
      url,
      `${CANONICAL_PRODUCTION_URL}/resident/invoices/550e8400-e29b-41d4-a716-446655440000`,
    );
  });
});

test('production getAppUrl ignores NEXT_PUBLIC_APP_URL and VERCEL_URL fallbacks', () => {
  withEnv(
    {
      VERCEL_ENV: 'production',
      NEXT_PUBLIC_APP_URL: 'http://localhost:3000',
      VERCEL_URL: 'preview.vercel.app',
    },
    () => {
      assert.equal(getAppUrl(), CANONICAL_PRODUCTION_URL);
    },
  );
});
