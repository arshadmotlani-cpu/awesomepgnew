/**
 * Owner database env resolution — unit tests (no secrets).
 */
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

describe('Owner database env', () => {
  test('resolves OWNER_DATABASE_POSTGRES_URL from Vercel Neon integration', () => {
    const prev = {
      OWNER_DATABASE_URL: process.env.OWNER_DATABASE_URL,
      OWNER_DATABASE_POSTGRES_URL: process.env.OWNER_DATABASE_POSTGRES_URL,
    };
    delete process.env.OWNER_DATABASE_URL;
    process.env.OWNER_DATABASE_POSTGRES_URL =
      'postgresql://user:pass@ep-owner.neon.tech/neondb?sslmode=require';

    delete require.cache[require.resolve('@/src/owner/lib/db/env')];
    const { resolveOwnerDatabaseUrl } = require('@/src/owner/lib/db/env') as typeof import('@/src/owner/lib/db/env');
    assert.equal(resolveOwnerDatabaseUrl(), process.env.OWNER_DATABASE_POSTGRES_URL);

    if (prev.OWNER_DATABASE_URL === undefined) delete process.env.OWNER_DATABASE_URL;
    else process.env.OWNER_DATABASE_URL = prev.OWNER_DATABASE_URL;
    if (prev.OWNER_DATABASE_POSTGRES_URL === undefined) delete process.env.OWNER_DATABASE_POSTGRES_URL;
    else process.env.OWNER_DATABASE_POSTGRES_URL = prev.OWNER_DATABASE_POSTGRES_URL;
  });
});
