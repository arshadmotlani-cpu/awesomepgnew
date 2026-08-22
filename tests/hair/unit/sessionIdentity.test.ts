import assert from 'node:assert/strict';
import test from 'node:test';
import { pickEmployeeForHairSession } from '../../../src/hair/lib/tenant/sessionIdentity.ts';

test('legacy admin session maps to employee by legacyAdminUserId', () => {
  const emp = pickEmployeeForHairSession(
    { adminId: 'admin-1', adminEmail: 'admin@foryour.co' },
    [
      {
        id: 'emp-1',
        userId: 'user-1',
        legacyAdminUserId: 'admin-1',
        email: 'other@foryour.co',
      },
    ],
  );
  assert.equal(emp?.id, 'emp-1');
  assert.equal(emp?.userId, 'user-1');
});

test('legacy admin session maps to employee by email when legacy id is missing', () => {
  const emp = pickEmployeeForHairSession(
    { adminId: 'admin-2', adminEmail: 'admin@foryour.co' },
    [
      {
        id: 'emp-2',
        userId: 'user-2',
        legacyAdminUserId: null,
        email: 'admin@foryour.co',
      },
    ],
  );
  assert.equal(emp?.id, 'emp-2');
});

test('workforce employee id wins over email', () => {
  const emp = pickEmployeeForHairSession(
    {
      workforceEmployeeId: 'emp-wf',
      adminId: 'admin-3',
      adminEmail: 'admin@foryour.co',
    },
    [
      {
        id: 'emp-wf',
        userId: 'user-wf',
        legacyAdminUserId: null,
        email: 'other@foryour.co',
      },
      {
        id: 'emp-email',
        userId: 'user-email',
        legacyAdminUserId: null,
        email: 'admin@foryour.co',
      },
    ],
  );
  assert.equal(emp?.id, 'emp-wf');
});
