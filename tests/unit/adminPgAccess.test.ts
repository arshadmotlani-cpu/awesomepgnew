import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { adminCanAccessPg } from '../../src/lib/auth/roles';

describe('adminCanAccessPg', () => {
  const pgA = 'pg-aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  const pgB = 'pg-bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

  it('super_admin has unrestricted access', () => {
    assert.equal(adminCanAccessPg({ role: 'super_admin', pgScope: [] }, pgA), true);
    assert.equal(adminCanAccessPg({ role: 'super_admin', pgScope: null }, pgB), true);
  });

  it('empty pgScope denies non-super_admin roles', () => {
    assert.equal(adminCanAccessPg({ role: 'pg_manager', pgScope: [] }, pgA), false);
    assert.equal(adminCanAccessPg({ role: 'accountant', pgScope: null }, pgA), false);
    assert.equal(adminCanAccessPg({ role: 'viewer', pgScope: [] }, pgA), false);
  });

  it('scoped admin can only access listed PGs', () => {
    assert.equal(adminCanAccessPg({ role: 'pg_manager', pgScope: [pgA] }, pgA), true);
    assert.equal(adminCanAccessPg({ role: 'pg_manager', pgScope: [pgA] }, pgB), false);
    assert.equal(adminCanAccessPg({ role: 'accountant', pgScope: [pgA, pgB] }, pgB), true);
  });
});

describe('payments:override permission', () => {
  it('is granted only to super_admin', async () => {
    const { adminHasPermission } = await import('../../src/lib/auth/roles');
    assert.equal(adminHasPermission('super_admin', 'payments:override'), true);
    assert.equal(adminHasPermission('pg_manager', 'payments:override'), false);
    assert.equal(adminHasPermission('accountant', 'payments:override'), false);
  });
});
