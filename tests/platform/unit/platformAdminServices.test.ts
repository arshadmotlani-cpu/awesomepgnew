import assert from 'node:assert/strict';
import test from 'node:test';
import { ROLE_DESCRIPTIONS } from '@/src/platform/components/ui/RoleBadge';
import {
  getOrganizationsNeedingAttention,
  listOrganizationsForPlatformAdminFiltered,
  resendInvitation,
  revokeInvitation,
  searchPlatformAdmin,
} from '@/src/platform/services/admin';

test('ROLE_DESCRIPTIONS keys cover organization roles', () => {
  assert.match(ROLE_DESCRIPTIONS.owner, /Full organization/);
  assert.match(ROLE_DESCRIPTIONS.co_owner, /platform administration/);
  assert.ok(ROLE_DESCRIPTIONS.manager);
  assert.ok(ROLE_DESCRIPTIONS.biller);
  assert.ok(ROLE_DESCRIPTIONS.staff);
});

test('platform admin service helpers are exported', () => {
  assert.equal(typeof revokeInvitation, 'function');
  assert.equal(typeof resendInvitation, 'function');
  assert.equal(typeof searchPlatformAdmin, 'function');
  assert.equal(typeof getOrganizationsNeedingAttention, 'function');
  assert.equal(typeof listOrganizationsForPlatformAdminFiltered, 'function');
});
