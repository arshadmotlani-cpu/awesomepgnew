/**
 * Ecosystem admin credential standard — unit tests (no secrets).
 */
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import {
  ECOSYSTEM_ADMIN_EMAIL,
  resolveEcosystemAdminEmail,
  resolveEcosystemAdminPassword,
} from '@/src/lib/auth/ecosystemAdmin';
import { SEED_ADMIN_EMAIL } from '@/src/lib/auth/adminPasswordReset';

describe('Ecosystem admin credentials', () => {
  test('standard email is admin@foryour.co', () => {
    assert.equal(ECOSYSTEM_ADMIN_EMAIL, 'admin@foryour.co');
    assert.equal(SEED_ADMIN_EMAIL, 'admin@foryour.co');
  });

  test('resolveEcosystemAdminEmail defaults to standard email', () => {
    const prev = process.env.ECOSYSTEM_ADMIN_EMAIL;
    delete process.env.ECOSYSTEM_ADMIN_EMAIL;
    assert.equal(resolveEcosystemAdminEmail(), 'admin@foryour.co');
    if (prev === undefined) delete process.env.ECOSYSTEM_ADMIN_EMAIL;
    else process.env.ECOSYSTEM_ADMIN_EMAIL = prev;
  });

  test('resolveEcosystemAdminPassword reads ECOSYSTEM_ADMIN_PASSWORD', () => {
    const prev = process.env.ECOSYSTEM_ADMIN_PASSWORD;
    process.env.ECOSYSTEM_ADMIN_PASSWORD = 'test-password-123';
    assert.equal(resolveEcosystemAdminPassword(), 'test-password-123');
    if (prev === undefined) delete process.env.ECOSYSTEM_ADMIN_PASSWORD;
    else process.env.ECOSYSTEM_ADMIN_PASSWORD = prev;
  });
});
