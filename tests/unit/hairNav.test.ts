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
    const workforceIdx = labels.indexOf('Workforce');
    const configurationIdx = labels.indexOf('Configuration');
    const settingsIdx = labels.indexOf('Settings');

    assert.ok(workforceIdx >= 0, 'Workforce must be visible');
    assert.ok(configurationIdx >= 0, 'Configuration group must exist');
    assert.ok(settingsIdx >= 0, 'Settings must remain last');
    assert.ok(workforceIdx < configurationIdx, 'Workforce before Configuration');
    assert.ok(configurationIdx < settingsIdx, 'Configuration before Settings');
  });

  it('places four independent catalog modules under Configuration', () => {
    const configuration = findGroup('configuration');
    assert.deepEqual(
      configuration.children.map((c) => c.label),
      ['Services', 'Products', 'Packages', 'Memberships'],
    );
    assert.deepEqual(
      configuration.children.map((c) => c.href),
      ['/services', '/products', '/packages', '/memberships'],
    );
  });

  it('groups Staff and Staff Performance under Workforce', () => {
    const workforce = findGroup('workforce');
    assert.deepEqual(
      workforce.children.map((c) => c.label),
      ['Staff', 'Staff Performance'],
    );
    assert.deepEqual(
      workforce.children.map((c) => c.href),
      ['/workforce', '/dashboard/staff-performance'],
    );
  });

  it('does not expose catalog items as top-level links', () => {
    const topLevelLinks = visibleHairNavEntries().filter((e) => e.type === 'link');
    const hrefs = topLevelLinks.map((e) => (e.type === 'link' ? e.href : ''));
    for (const href of ['/services', '/products', '/packages', '/memberships', '/workforce']) {
      assert.equal(hrefs.includes(href), false, `${href} should not be top-level`);
    }
  });

  it('keeps billing, workforce, and catalog routes reachable', () => {
    const hrefs = visibleHrefs();
    for (const href of [
      '/billing/invoices',
      '/services',
      '/products',
      '/packages',
      '/memberships',
      '/workforce',
      '/dashboard/staff-performance',
    ]) {
      assert.ok(hrefs.includes(href), `missing nav href ${href}`);
    }
  });
});
