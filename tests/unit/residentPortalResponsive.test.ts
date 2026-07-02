import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('resident portal responsive nav', () => {
  it('uses one top tab strip on all breakpoints (no mobile bottom nav)', () => {
    const shell = readFileSync(
      join(process.cwd(), 'src/components/customer/account/ResidentHubShell.tsx'),
      'utf8',
    );
    assert.match(shell, /apg-resident-top-nav/);
    assert.match(shell, /apg-resident-top-nav-wrap/);
    assert.match(shell, /apg-resident-top-nav-fade md:hidden/);
    assert.doesNotMatch(shell, /fixed bottom-0/);
    assert.doesNotMatch(shell, /hidden md:flex/);
  });

  it('styles secondary nav as lighter tier on mobile', () => {
    const sub = readFileSync(
      join(process.cwd(), 'src/components/customer/account/resident/ResidentSubpageLayout.tsx'),
      'utf8',
    );
    assert.match(sub, /apg-resident-sub-nav/);
    assert.match(sub, /max-md:bg-apg-orange\/10/);
  });

  it('applies mobile polish hooks in globals.css', () => {
    const css = readFileSync(join(process.cwd(), 'app/globals.css'), 'utf8');
    assert.match(css, /apg-resident-top-nav-fade/);
    assert.match(css, /@media \(max-width: 767px\)/);
  });

  it('shows page header on mobile and desktop', () => {
    const page = readFileSync(
      join(process.cwd(), 'app/(customer)/account/profile/page.tsx'),
      'utf8',
    );
    assert.match(page, /<ResidentPageHeader meta=\{residentTabMeta\(residentTab\)\} \/>/);
    assert.doesNotMatch(page, /hidden md:block[\s\S]*ResidentPageHeader/);
  });
});

describe('developer test resident mode', () => {
  it('is disabled in production builds', async () => {
    const prev = process.env.NODE_ENV;
    const prevEmail = process.env.DEVELOPER_TEST_EMAIL;
    process.env.NODE_ENV = 'production';
    process.env.DEVELOPER_TEST_EMAIL = 'dev@test.local';

    const mod = await import('@/src/lib/auth/developerTestResident.server');
    assert.equal(mod.isDeveloperTestResidentEmail('dev@test.local'), false);

    process.env.NODE_ENV = prev;
    process.env.DEVELOPER_TEST_EMAIL = prevEmail;
  });
});
