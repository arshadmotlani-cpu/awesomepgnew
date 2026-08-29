import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { HAIR_NAV_ENTRIES } from '@/src/hair/lib/nav';

describe('FYH sidebar navigation', () => {
  it('orders operational modules before Configuration', () => {
    const labels = HAIR_NAV_ENTRIES.filter((e) => !e.hidden).map((entry) =>
      entry.type === 'link' ? entry.label : entry.label,
    );
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
    const dashboard = HAIR_NAV_ENTRIES.find((e) => e.type === 'group' && e.id === 'dashboard');
    assert.ok(dashboard && dashboard.type === 'group');
    assert.deepEqual(
      dashboard.children.map((c) => c.label),
      ['Revenue Dashboard', 'Staff Performance'],
    );
    const workforceGroup = HAIR_NAV_ENTRIES.find((e) => e.type === 'group' && e.id === 'workforce');
    assert.equal(workforceGroup, undefined, 'Workforce nav group must not exist');
  });

  it('places catalog items under Configuration including Memberships and Packages', () => {
    const configuration = HAIR_NAV_ENTRIES.find((e) => e.type === 'group' && e.id === 'configuration');
    assert.ok(configuration && configuration.type === 'group');
    assert.deepEqual(configuration.children.map((c) => c.label), [
      'Services',
      'Products',
      'Memberships',
      'Packages',
    ]);
  });

  it('does not expose Inventory or Vendors as top-level nav links', () => {
    const topLevel = HAIR_NAV_ENTRIES.filter((e) => e.type === 'link' && !e.hidden);
    const labels = topLevel.map((e) => (e.type === 'link' ? e.label : ''));
    assert.equal(labels.includes('Inventory'), false);
    assert.equal(labels.includes('Vendors'), false);
    assert.ok(labels.includes('Purchases'));
    assert.ok(labels.includes('Expenses'));
  });

  it('exposes Staff as a top-level link', () => {
    const topLevelLinks = HAIR_NAV_ENTRIES.filter((e) => e.type === 'link' && !e.hidden);
    const hrefs = topLevelLinks.map((e) => (e.type === 'link' ? e.href : ''));
    assert.ok(hrefs.includes('/staff'), 'Staff must be top-level at /staff');
  });

  it('does not expose catalog items as top-level links', () => {
    const topLevelLinks = HAIR_NAV_ENTRIES.filter((e) => e.type === 'link' && !e.hidden);
    const hrefs = topLevelLinks.map((e) => (e.type === 'link' ? e.href : ''));
    for (const href of ['/services', '/products', '/memberships', '/packages']) {
      assert.equal(hrefs.includes(href), false, `${href} should not be top-level`);
    }
  });

  it('keeps billing, purchases, expenses, and catalog routes reachable from nav', () => {
    const hrefs: string[] = [];
    for (const entry of HAIR_NAV_ENTRIES) {
      if (entry.type === 'link' && !entry.hidden) hrefs.push(entry.href);
      if (entry.type === 'group') hrefs.push(...entry.children.map((c) => c.href));
    }
    for (const href of [
      '/billing/invoices',
      '/services',
      '/products',
      '/memberships',
      '/packages',
      '/staff',
      '/purchases',
      '/expenses',
      '/dashboard/staff-performance',
    ]) {
      assert.ok(hrefs.includes(href), `missing nav href ${href}`);
    }
  });
});
