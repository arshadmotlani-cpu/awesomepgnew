import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { explainPurchase } from '@/src/hair/lib/purchaseExplain';
import { buildPurchaseRecordedEvent } from '@/src/hair/lib/purchaseEvents';
import { pagePermissionForPath } from '@/src/hair/lib/auth/permissionTypes';
import { HAIR_NAV_ENTRIES } from '@/src/hair/lib/nav';
import { workforceGrantsToHairPermissions } from '@/src/workforce/compat/hairAdminBridge';
import { defaultGrantsFor } from '@/src/workforce/permissions/presets';

describe('Purchase Brain foundation', () => {
  it('explainPurchase computes paid and balance from payable', () => {
    const summary = explainPurchase({
      purchase: {
        purchaseNumber: 'PUR-ABC',
        totalPaise: 10_000,
        purchaseDate: '2026-08-06',
      },
      vendorName: 'ABC Cosmetics',
      payable: { balancePaise: 4_000, status: 'partial' },
    });
    assert.equal(summary.totalPaise, 10_000);
    assert.equal(summary.paidPaise, 6_000);
    assert.equal(summary.balancePaise, 4_000);
    assert.equal(summary.payableStatus, 'partial');
  });

  it('buildPurchaseRecordedEvent uses salon engine id', () => {
    const event = buildPurchaseRecordedEvent({
      purchaseId: 'p1',
      vendorId: 'v1',
      totalPaise: 5000,
      purchaseDate: '2026-08-06',
    });
    assert.equal(event.engineId, 'fyh_salon');
    assert.equal(event.eventType, 'salon.purchase.recorded');
    assert.equal(event.purchaseId, 'p1');
  });

  it('maps /purchases to page:purchases permission', () => {
    assert.equal(pagePermissionForPath('/purchases'), 'page:purchases');
    assert.equal(pagePermissionForPath('/purchases/new'), 'page:purchases');
  });

  it('places Purchases between Vendors and Expenses in nav', () => {
    const labels = HAIR_NAV_ENTRIES.filter((e) => e.type === 'link').map((e) =>
      e.type === 'link' ? e.label : '',
    );
    const vendorsIdx = labels.indexOf('Vendors');
    const purchasesIdx = labels.indexOf('Purchases');
    const expensesIdx = labels.indexOf('Expenses');
    assert.ok(vendorsIdx >= 0 && purchasesIdx >= 0 && expensesIdx >= 0);
    assert.ok(vendorsIdx < purchasesIdx);
    assert.ok(purchasesIdx < expensesIdx);
  });

  it('grants page:purchases to roles with inventory.view', () => {
    const manager = workforceGrantsToHairPermissions(defaultGrantsFor('manager', 'manager'));
    assert.ok(manager.includes('page:purchases'));
    const staff = workforceGrantsToHairPermissions(defaultGrantsFor('team_member', 'staff'));
    assert.equal(staff.includes('page:purchases'), false);
  });
});
