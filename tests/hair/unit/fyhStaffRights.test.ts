import assert from 'node:assert/strict';
import test from 'node:test';
import { FYH_RIGHTS_CATALOG } from '@/src/workforce/permissions/catalogFyhRights';
import {
  FYH_STAFF_RIGHT_KEYS,
  applyUiImplications,
  deriveStaffRightsSelection,
  toggleStaffRight,
} from '@/src/workforce/permissions/fyhStaffRightsModel';
import { parseStaffRightsFromForm } from '@/src/workforce/permissions/parseStaffRights';
import { permissionSatisfied } from '@/src/workforce/permissions/aliases';
import { workforceGrantsToHairPermissions } from '@/src/workforce/compat/hairAdminBridge';

test('FYH staff rights catalog covers every editor key', () => {
  assert.equal(FYH_STAFF_RIGHT_KEYS.length, FYH_RIGHTS_CATALOG.length);
  for (const key of FYH_STAFF_RIGHT_KEYS) {
    assert.ok(FYH_RIGHTS_CATALOG.some((d) => d.key === key), key);
  }
});

test('edit implies view for expenses and configuration', () => {
  const selected = applyUiImplications(new Set(['expenses.general.edit', 'configuration.edit']));
  assert.ok(selected.has('expenses.general.view'));
  assert.ok(selected.has('configuration.view'));
});

test('salon revenue implies personal revenue in UI', () => {
  const selected = applyUiImplications(new Set(['dashboard.revenue.salon']));
  assert.ok(selected.has('dashboard.revenue.personal'));
});

test('full dashboard selects all dashboard section rights', () => {
  const selected = toggleStaffRight(new Set(), 'dashboard.full', true);
  assert.ok(selected.has('dashboard.view_expenses'));
  assert.ok(selected.has('dashboard.view_appointments'));
  assert.ok(selected.has('dashboard.revenue.salon'));
});

test('parseStaffRightsFromForm normalizes implications', () => {
  const fd = new FormData();
  fd.append('permissions', 'billing.bill.edit');
  const keys = parseStaffRightsFromForm(fd);
  assert.ok(keys.includes('billing.invoices.view'));
  assert.ok(keys.includes('billing.bill.edit'));
});

test('runtime permissionSatisfied honors authoritative billing keys', () => {
  const grants = ['billing.bill.create'];
  assert.ok(permissionSatisfied(grants, 'quick_sale.access'));
  assert.equal(permissionSatisfied(grants, 'billing.invoices.view'), false);
  assert.equal(permissionSatisfied(grants, 'customers.view'), false);
});

test('appointments bookable does not grant billing or add appointment', () => {
  const grants = ['appointments.bookable', 'appointments.view_own'];
  assert.equal(permissionSatisfied(grants, 'billing.bill.create'), false);
  assert.equal(permissionSatisfied(grants, 'appointments.add'), false);
  assert.equal(permissionSatisfied(grants, 'appointments.edit'), false);
});

test('salary and general expense views are isolated', () => {
  assert.ok(permissionSatisfied(['expenses.salary.view'], 'expenses.salary.view'));
  assert.equal(permissionSatisfied(['expenses.salary.view'], 'expenses.general.view'), false);
  assert.equal(permissionSatisfied(['expenses.general.view'], 'expenses.salary.view'), false);
});

test('hair bridge maps grants to legacy nav keys', () => {
  const perms = workforceGrantsToHairPermissions({
    permissions: ['staff.view', 'expenses.salary.view'],
    maxBackdateDays: 0,
    maxDiscountPercent: null,
  });
  assert.ok(perms.includes('page:staff'));
  assert.ok(perms.includes('page:expenses'));
  assert.equal(perms.includes('page:customers'), false);
});

test('deriveStaffRightsSelection from stored grants', () => {
  const sel = deriveStaffRightsSelection(['billing.bill.edit']);
  assert.ok(sel.has('billing.bill.edit'));
  assert.ok(sel.has('billing.invoices.view'));
});
