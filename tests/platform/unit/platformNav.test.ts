import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { isPlatformNavActive, platformNavGroups } from '@/src/platform/lib/platformNav';

test('dashboard nav active only on exact admin root', () => {
  assert.equal(isPlatformNavActive('/platform/admin', '/platform/admin', false), true);
  assert.equal(isPlatformNavActive('/platform/admin/organizations', '/platform/admin', false), false);
});

test('organizations nav active on child routes', () => {
  assert.equal(isPlatformNavActive('/platform/admin/organizations', '/platform/admin/organizations'), true);
  assert.equal(
    isPlatformNavActive('/platform/admin/organizations/abc', '/platform/admin/organizations'),
    true,
  );
});

test('onboarding nav is distinct from dashboard', () => {
  assert.equal(
    isPlatformNavActive('/platform/admin/onboarding', '/platform/admin', false),
    false,
  );
  assert.equal(
    isPlatformNavActive('/platform/admin/onboarding', '/platform/admin/onboarding'),
    true,
  );
  const onboarding = platformNavGroups
    .flatMap((g) => g.items)
    .find((i) => i.href === '/platform/admin/onboarding');
  assert.ok(onboarding);
  assert.equal(onboarding?.label, 'Onboarding');
});

test('onboarding page renders create-salon wizard, not admin home metrics', () => {
  const onboarding = readFileSync(
    join(process.cwd(), 'app/(platform)/platform/admin/onboarding/page.tsx'),
    'utf8',
  );
  const home = readFileSync(
    join(process.cwd(), 'app/(platform)/platform/admin/page.tsx'),
    'utf8',
  );
  assert.match(onboarding, /OrganizationOnboardingWizard/);
  assert.match(onboarding, /Create a new salon/);
  assert.match(onboarding, /data-platform-page="onboarding"/);
  assert.doesNotMatch(onboarding, /getPlatformDashboardStats/);
  assert.match(home, /getPlatformDashboardStats/);
  assert.doesNotMatch(home, /OrganizationOnboardingWizard/);
});

test('platform shell remounts main content by pathname', () => {
  const src = readFileSync(
    join(process.cwd(), 'src/platform/components/shell/PlatformShell.tsx'),
    'utf8',
  );
  assert.match(src, /key=\{pathname\}/);
  assert.match(src, /PlatformShellChrome/);
});

test('platform nav includes expected sections', () => {
  const ids = platformNavGroups.map((g) => g.id);
  assert.ok(ids.includes('overview'));
  assert.ok(ids.includes('customers'));
  assert.ok(ids.includes('revenue'));
  assert.ok(ids.includes('operations'));
  assert.ok(ids.includes('platform'));
});
