import { describe, it, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { resolveInvestDatabaseUrl } from '../../../src/capital/lib/db/env';

describe('invest database env resolution', () => {
  const snapshot = { ...process.env };

  afterEach(() => {
    for (const key of Object.keys(process.env)) {
      if (!(key in snapshot)) delete process.env[key];
    }
    Object.assign(process.env, snapshot);
  });

  it('prefers INVEST_DATABASE_URL', () => {
    process.env.INVEST_DATABASE_URL = 'postgresql://primary';
    process.env.INVEST_DATABASE_DATABASE_URL = 'postgresql://vercel';
    assert.equal(resolveInvestDatabaseUrl(), 'postgresql://primary');
  });

  it('falls back to INVEST_DATABASE_DATABASE_URL', () => {
    delete process.env.INVEST_DATABASE_URL;
    process.env.INVEST_DATABASE_DATABASE_URL = 'postgresql://vercel-neon';
    assert.equal(resolveInvestDatabaseUrl(), 'postgresql://vercel-neon');
  });
});
