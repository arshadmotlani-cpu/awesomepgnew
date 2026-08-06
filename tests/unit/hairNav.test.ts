import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { HAIR_NAV_ENTRIES, visibleHairNavEntries } from '@/src/hair/lib/nav';

function visibleLabels(): string[] {
  return visibleHairNavEntries().map((entry) =>
    entry.type === 'link' ? entry.label : entry.label,
  );
}

function visibleHrefs(): string[] {
  const hrefs: string[] = [];
  for (const entry of visibleHairNavEntries()) {
    if (entry.type === 'link') {
      hrefs.push(entry.href);
    } else {
      hrefs.push(...entry.children.map((c) => c.href));
    }
  }
  return hrefs;
}

function findGroup(id: string) {
  const group = HAIR_NAV_ENTRIES.find((e) => e.type === 'group' && e.id === id);
  assert.ok(group && group.type === 'group');
  return group;
}

describe('FYH sidebar navigation', () => {
  it('orders operational modules before Configuration', () => {
    const labels = visibleLabels();
    const staffIdx = labels.indexOf('Staff');
    const configurationIdx = labels.indexOf('Configuration');
    const settingsIdx = labels.indexOf('Settings');

    assert.ok(staffIdx >= 0, 'Staff must be visible as top-level module');
    assert.ok(configurationIdx >= 0, 'Configuration group must exist');
    assert.ok(settingsIdx >= 0, 'Settings must remain last');
    assert.ok(staffIdx < configurationIdx, 'Staff before Configuration');
    assert.ok(configurationIdx < settingsIdx, 'Configuration before Settings');
  });

  it('places Staff Performance under Dashboard, not Workforce', () => {
    const dashboard = findGroup('dashboard');
    assert.deepEqual(
      dashboard.children.map((c) => c.label),
      ['Revenue Dashboard', 'Staff Performance'],
    );
    assert.deepEqual(
      dashboard.children.map((c) => c.href),
      ['/dashboard/revenue', '/dashboard/staff-performance'],
    );
    const workforceGroup = HAIR_NAV_ENTRIES.find((e) => e.type === 'group' && e.id === 'workforce');
    assert.equal(workforceGroup, undefined, 'Workforce nav group must not exist');
  });

  it('places Services and Products under Configuration', () => {
    const configuration = findGroup('configuration');
    assert.deepEqual(
      configuration.children.map((c) => c.label),
      ['Services', 'Products'],
    );
    assert.deepEqual(
      configuration.children.map((c) => c.href),
      ['/services', '/products'],
    );
  });

  it('places Vendors between Inventory and Expenses', () => {
    const topLevel = visibleHairNavEntries().filter((e) => e.type === 'link');
    const labels = topLevel.map((e) => (e.type === 'link' ? e.label : ''));
    const inventoryIdx = labels.indexOf('Inventory');
    const vendorsIdx = labels.indexOf('Vendors');
    const purchasesIdx = labels.indexOf('Purchases');
    const expensesIdx = labels.indexOf('Expenses');
    const loyaltyIdx = labels.indexOf('Loyalty');
    assert.ok(inventoryIdx >= 0 && vendorsIdx >= 0 && purchasesIdx >= 0 && expensesIdx >= 0 && loyaltyIdx >= 0);
    assert.ok(inventoryIdx < vendorsIdx, 'Inventory before Vendors');
    assert.ok(vendorsIdx < purchasesIdx, 'Vendors before Purchases');
    assert.ok(purchasesIdx < expensesIdx, 'Purchases before Expenses');
    assert.ok(expensesIdx < loyaltyIdx, 'Expenses before Loyalty');
  });

  it('exposes Staff as a top-level link', () => {
    const topLevelLinks = visibleHairNavEntries().filter((e) => e.type === 'link');
    const hrefs = topLevelLinks.map((e) => (e.type === 'link' ? e.href : ''));
    assert.ok(hrefs.includes('/staff'), 'Staff must be top-level at /staff');
  });

  it('does not expose catalog items as top-level links', () => {
    const topLevelLinks = visibleHairNavEntries().filter((e) => e.type === 'link');
    const hrefs = topLevelLinks.map((e) => (e.type === 'link' ? e.href : ''));
    for (const href of ['/services', '/products']) {
      assert.equal(hrefs.includes(href), false, `${href} should not be top-level`);
    }
  });

  it('keeps billing, staff, inventory, expenses, and catalog routes reachable', () => {
    const hrefs = visibleHrefs();
    for (const href of [
      '/billing/invoices',
      '/services',
      '/products',
      '/staff',
      '/vendors',
      '/purchases',
      '/expenses',
      '/inventory',
      '/dashboard/staff-performance',
    ]) {
      assert.ok(hrefs.includes(href), `missing nav href ${href}`);
    }
  });
});
