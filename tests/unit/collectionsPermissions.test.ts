import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { adminCanAccessPg, adminHasPermission } from '../../src/lib/auth/roles';

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
    assert.equal(adminCanAccessPg({ role: 'receptionist', pgScope: [] }, pgA), false);
  });

  it('scoped admin can only access listed PGs', () => {
    assert.equal(adminCanAccessPg({ role: 'pg_manager', pgScope: [pgA] }, pgA), true);
    assert.equal(adminCanAccessPg({ role: 'pg_manager', pgScope: [pgA] }, pgB), false);
    assert.equal(adminCanAccessPg({ role: 'accountant', pgScope: [pgA, pgB] }, pgB), true);
    assert.equal(adminCanAccessPg({ role: 'receptionist', pgScope: [pgA] }, pgA), true);
  });
});

describe('payments:override permission', () => {
  it('is granted only to super_admin', () => {
    assert.equal(adminHasPermission('super_admin', 'payments:override'), true);
    assert.equal(adminHasPermission('pg_manager', 'payments:override'), false);
    assert.equal(adminHasPermission('accountant', 'payments:override'), false);
    assert.equal(adminHasPermission('receptionist', 'payments:override'), false);
  });
});

describe('collections permissions matrix', () => {
  it('receptionist can view and write collections, not waive or remind', () => {
    assert.equal(adminHasPermission('receptionist', 'collections:read'), true);
    assert.equal(adminHasPermission('receptionist', 'collections:write'), true);
    assert.equal(adminHasPermission('receptionist', 'collections:remind'), false);
    assert.equal(adminHasPermission('receptionist', 'collections:waive'), false);
    assert.equal(adminHasPermission('receptionist', 'payments:write'), true);
  });

  it('pg_manager can read and remind, not waive or write proofs', () => {
    assert.equal(adminHasPermission('pg_manager', 'collections:read'), true);
    assert.equal(adminHasPermission('pg_manager', 'collections:remind'), true);
    assert.equal(adminHasPermission('pg_manager', 'collections:write'), false);
    assert.equal(adminHasPermission('pg_manager', 'collections:waive'), false);
  });

  it('accountant has collections write + waive', () => {
    assert.equal(adminHasPermission('accountant', 'collections:write'), true);
    assert.equal(adminHasPermission('accountant', 'collections:waive'), true);
    assert.equal(adminHasPermission('accountant', 'collections:remind'), true);
  });

  it('viewer is collections read-only', () => {
    assert.equal(adminHasPermission('viewer', 'collections:read'), true);
    assert.equal(adminHasPermission('viewer', 'collections:write'), false);
    assert.equal(adminHasPermission('viewer', 'payments:write'), false);
  });

  it('super_admin has full collections access', () => {
    assert.equal(adminHasPermission('super_admin', 'collections:waive'), true);
    assert.equal(adminHasPermission('super_admin', 'collections:remind'), true);
  });
});
