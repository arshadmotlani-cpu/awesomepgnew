import assert from 'node:assert/strict';
import test from 'node:test';
import { permissionSatisfied } from '../../../src/workforce/permissions/aliases.ts';

test('dashboard.full implies salon and personal revenue', () => {
  assert.equal(permissionSatisfied(['dashboard.full'], 'dashboard.revenue.salon'), true);
  assert.equal(permissionSatisfied(['dashboard.full'], 'dashboard.revenue.personal'), true);
});

test('salon revenue implies personal revenue', () => {
  assert.equal(permissionSatisfied(['dashboard.revenue.salon'], 'dashboard.revenue.personal'), true);
  assert.equal(permissionSatisfied(['dashboard.revenue.personal'], 'dashboard.revenue.salon'), false);
});

test('customers.view satisfies legacy phone permission', () => {
  assert.equal(permissionSatisfied(['customers.view'], 'customers.phone.view'), true);
});

test('billing.bill.edit implies view invoices', () => {
  assert.equal(permissionSatisfied(['billing.bill.edit'], 'billing.invoices.view'), true);
});
