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

  it('places catalog items under Configuration', () => {
    const configuration = HAIR_NAV_ENTRIES.find(
      (e) => e.type === 'group' && e.id === 'configuration',
    );
    assert.ok(configuration && configuration.type === 'group');
    assert.deepEqual(
      configuration.children.map((c) => c.label),
      ['Services', 'Products', 'Membership Packages'],
    );
    assert.deepEqual(
      configuration.children.map((c) => c.href),
      ['/services', '/products', '/membership-packages'],
    );
  });

  it('does not expose Services or Products as top-level links', () => {
    const topLevelLinks = visibleHairNavEntries().filter((e) => e.type === 'link');
    const hrefs = topLevelLinks.map((e) => (e.type === 'link' ? e.href : ''));
    assert.equal(hrefs.includes('/services'), false);
    assert.equal(hrefs.includes('/products'), false);
  });

  it('keeps billing and catalog routes reachable', () => {
    const hrefs = visibleHrefs();
    for (const href of ['/billing/invoices', '/services', '/products', '/membership-packages', '/workforce']) {
      assert.ok(hrefs.includes(href), `missing nav href ${href}`);
    }
  });
});
