import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { pagePermissionForPath } from '@/src/hair/lib/auth/permissionTypes';
import { HAIR_NAV_ENTRIES } from '@/src/hair/lib/nav';
import {
  FYH_EXPENSE_CATEGORIES,
  FYH_EXPENSE_CATEGORY_LABELS,
  FYH_EXPENSE_PAYMENT_METHODS,
} from '@/src/hair/lib/expenseCategories';
import { workforceGrantsToHairPermissions } from '@/src/workforce/compat/hairAdminBridge';
import { defaultGrantsFor } from '@/src/workforce/permissions/presets';

describe('ERP foundation', () => {
  it('Configuration contains Services, Products, Memberships, and Packages', () => {
    const configuration = HAIR_NAV_ENTRIES.find(
      (e) => e.type === 'group' && e.id === 'configuration',
    );
    assert.ok(configuration && configuration.type === 'group');
    assert.deepEqual(configuration.children.map((c) => c.label), [
      'Services',
      'Products',
      'Memberships',
      'Packages',
    ]);
  });

  it('places Purchases before Expenses without Vendors in primary nav', () => {
    const labels = HAIR_NAV_ENTRIES.filter((e) => e.type === 'link' && !e.hidden).map((e) =>
      e.type === 'link' ? e.label : '',
    );
    const purchasesIdx = labels.indexOf('Purchases');
    const expensesIdx = labels.indexOf('Expenses');
    const loyaltyIdx = labels.indexOf('Loyalty');
    assert.ok(purchasesIdx >= 0 && expensesIdx >= 0 && loyaltyIdx >= 0);
    assert.equal(labels.includes('Vendors'), false);
    assert.equal(labels.includes('Inventory'), false);
    assert.ok(purchasesIdx < expensesIdx, 'Purchases before Expenses');
    assert.ok(expensesIdx < loyaltyIdx, 'Expenses before Loyalty');
  });

  it('maps /vendors to page:inventory permission', () => {
    assert.equal(pagePermissionForPath('/vendors'), 'page:inventory');
    assert.equal(pagePermissionForPath('/vendors/new'), 'page:inventory');
  });

  it('maps /expenses to page:expenses permission', () => {
    assert.equal(pagePermissionForPath('/expenses'), 'page:expenses');
    assert.equal(pagePermissionForPath('/fyh/expenses'), 'page:expenses');
  });

  it('grants expenses page to owner, manager, and biller — not staff', () => {
    const owner = workforceGrantsToHairPermissions(defaultGrantsFor('owner', 'owner'));
    const manager = workforceGrantsToHairPermissions(defaultGrantsFor('manager', 'manager'));
    const biller = workforceGrantsToHairPermissions(defaultGrantsFor('team_member', 'biller'));
    const staff = workforceGrantsToHairPermissions(defaultGrantsFor('team_member', 'staff'));

    assert.ok(owner.includes('page:expenses'));
    assert.ok(manager.includes('page:expenses'));
    assert.ok(biller.includes('page:expenses'));
    assert.equal(staff.includes('page:expenses'), false);
  });

  it('defines simplified expense categories and payment methods', () => {
    assert.equal(FYH_EXPENSE_CATEGORIES.length, 13);
    assert.equal(FYH_EXPENSE_CATEGORY_LABELS.general, 'General');
    assert.equal(FYH_EXPENSE_CATEGORY_LABELS.food_pantry, 'Food & Pantry');
    assert.deepEqual([...FYH_EXPENSE_PAYMENT_METHODS], ['cash', 'online', 'petty_cash']);
  });
});
