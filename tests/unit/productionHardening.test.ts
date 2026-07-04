import { describe, it, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { assertProductionBootSecrets } from '../../src/lib/healing/envHealer';

describe('assertProductionBootSecrets', () => {
  const envBackup: Record<string, string | undefined> = {};

  function saveEnv(keys: string[]) {
    for (const k of keys) envBackup[k] = process.env[k];
  }

  function restoreEnv(keys: string[]) {
    for (const k of keys) {
      if (envBackup[k] === undefined) delete process.env[k];
      else process.env[k] = envBackup[k];
    }
  }

  const keys = [
    'NODE_ENV',
    'VERCEL_ENV',
    'AUTH_SECRET',
    'CRON_SECRET',
    'PAYMENT_PROVIDER',
    'BLOB_READ_WRITE_TOKEN',
    'RAZORPAY_KEY_ID',
    'RAZORPAY_KEY_SECRET',
    'RAZORPAY_WEBHOOK_SECRET',
  ];

  afterEach(() => restoreEnv(keys));

  it('no-ops outside Vercel production', () => {
    saveEnv(keys);
    process.env.NODE_ENV = 'development';
    assert.doesNotThrow(() => assertProductionBootSecrets());
  });

  it('no-ops when NODE_ENV is production but deployment is preview or CI', () => {
    saveEnv(keys);
    process.env.NODE_ENV = 'production';
    process.env.VERCEL_ENV = 'preview';
    delete process.env.CRON_SECRET;
    assert.doesNotThrow(() => assertProductionBootSecrets());

    process.env.VERCEL_ENV = undefined;
    assert.doesNotThrow(() => assertProductionBootSecrets());
  });

  it('throws when Vercel production is missing critical secrets', () => {
    saveEnv(keys);
    process.env.NODE_ENV = 'production';
    process.env.VERCEL_ENV = 'production';
    delete process.env.AUTH_SECRET;
    delete process.env.CRON_SECRET;
    process.env.PAYMENT_PROVIDER = 'razorpay';

    assert.throws(() => assertProductionBootSecrets(), /Production boot blocked/);
  });

  it('allows mock payment provider when QR approval is the live model', () => {
    saveEnv(keys);
    process.env.NODE_ENV = 'production';
    process.env.VERCEL_ENV = 'production';
    process.env.AUTH_SECRET = 'test-production-auth-secret-32chars-min';
    process.env.CRON_SECRET = 'test-cron-secret';
    process.env.PAYMENT_PROVIDER = 'mock';
    process.env.BLOB_READ_WRITE_TOKEN = 'test-blob-token';

    assert.doesNotThrow(() => assertProductionBootSecrets());
  });
});
