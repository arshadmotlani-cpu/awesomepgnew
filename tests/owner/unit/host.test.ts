/**
 * Owner OS host helpers — unit tests (no DB).
 */
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import {
  isOwnerHost,
  isOwnerPublicPath,
  isOwnerProtectedPath,
  ownerPublicToInternal,
} from '@/src/owner/lib/host';
import { OWNER_OS_BRAIN_REGISTRY } from '@/src/owner/brains/registry';

describe('Owner OS host', () => {
  test('recognizes owner.awesomepg.in', () => {
    assert.equal(isOwnerHost('owner.awesomepg.in'), true);
    assert.equal(isOwnerHost('owner.localhost'), true);
    assert.equal(isOwnerHost('www.awesomepg.in'), false);
    assert.equal(isOwnerHost('invest.awesomepg.in'), false);
  });

  test('rewrites public dashboard to /owner/dashboard', () => {
    assert.equal(ownerPublicToInternal('/dashboard'), '/owner/dashboard');
    assert.equal(ownerPublicToInternal('/net-worth'), '/owner/net-worth');
    assert.equal(ownerPublicToInternal('/login'), '/owner/auth/login');
  });

  test('protects dashboard but not login', () => {
    assert.equal(isOwnerProtectedPath('/dashboard'), true);
    assert.equal(isOwnerProtectedPath('/login'), false);
    assert.equal(isOwnerPublicPath('/dashboard'), true);
    assert.equal(isOwnerPublicPath('/admin'), false);
  });
});

describe('Owner OS brain registry', () => {
  test('registers Owner, Personal Finance, Net Worth brains as partial', () => {
    const ids = OWNER_OS_BRAIN_REGISTRY.map((b) => b.id);
    assert.ok(ids.includes('owner'));
    assert.ok(ids.includes('personal_finance'));
    assert.ok(ids.includes('net_worth'));
    assert.equal(
      OWNER_OS_BRAIN_REGISTRY.find((b) => b.id === 'owner')?.status,
      'partial',
    );
  });
});
