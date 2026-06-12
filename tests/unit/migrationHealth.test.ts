import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  checkMigrationHealth,
  formatMigrationHealthError,
  listRepoMigrations,
  safeListRepoMigrations,
} from '../../src/db/migrationHealth';

describe('listRepoMigrations', () => {
  it('lists journal migrations in order with hashes', () => {
    const repo = listRepoMigrations();
    assert.ok(repo.length >= 10);
    assert.equal(repo[0]?.tag, '0000_phase1_inventory');
    assert.match(repo[0]?.hash ?? '', /^[a-f0-9]{64}$/);
    assert.equal(repo.at(-1)?.tag, '0026_active_only_overlap');
  });
});

describe('safeListRepoMigrations', () => {
  it('returns error instead of throwing for invalid journal', () => {
    const result = safeListRepoMigrations();
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.ok(result.migrations.length >= 10);
    }
  });
});

describe('checkMigrationHealth', () => {
  it('never throws when migration metadata is broken', async () => {
    const originalCwd = process.cwd();
    try {
      process.chdir('/tmp');
      const health = await checkMigrationHealth();
      assert.equal(health.ok, false);
      assert.match(health.error ?? '', /migration metadata|Journal not found/i);
      assert.equal(health.codeCount, 0);
    } finally {
      process.chdir(originalCwd);
    }
  });
});

describe('formatMigrationHealthError', () => {
  it('names each pending migration and suggests db:migrate', () => {
    const msg = formatMigrationHealthError({
      ok: false,
      latestCodeVersion: '0009_whatsapp_otp_attempt_log',
      currentDbVersion: '0007_admin_must_change_password',
      pendingCount: 2,
      pending: ['0008_phase6_1_kyc', '0009_whatsapp_otp_attempt_log'],
      appliedCount: 8,
      codeCount: 10,
    });
    assert.match(msg, /0008_phase6_1_kyc/);
    assert.match(msg, /0009_whatsapp_otp_attempt_log/);
    assert.match(msg, /npm run db:migrate/);
  });
});
