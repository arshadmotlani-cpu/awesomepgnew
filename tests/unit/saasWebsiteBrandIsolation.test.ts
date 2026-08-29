import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

const root = process.cwd();

function read(rel: string) {
  return readFileSync(join(root, rel), 'utf8');
}

const SAAS_SURFACES = [
  'src/hair/components/marketing/SalonSoftwareLanding.tsx',
  'src/hair/components/marketing/SalonSoftwareWaitlistForm.tsx',
  'app/(hair)/fyh/(public)/salon-software/page.tsx',
  'app/(hair)/fyh/(public)/subscribe/page.tsx',
  'src/platform/components/shell/PlatformTopBar.tsx',
  'src/platform/components/shell/PlatformSidebar.tsx',
  'app/(platform)/platform/auth/login/page.tsx',
  'app/(platform)/platform/auth/login/login-form.tsx',
  'src/components/customer/SiteHeader.tsx',
  'src/components/customer/SiteFooter.tsx',
  'src/components/brand/AwesomePgLogo.tsx',
  'src/components/brand/AwesomePgMark.tsx',
];

const ADMIN_BRAND_IMPORTS =
  /ApgOsMark|FyhMark|CapitalOsMark|OwnerOsMark|ApgOsLogoLockup|CapitalOsLogoLockup|FyhSidebarBrand|FyhLoginBrandHeader/;

test('SaaS marketing, Platform, and customer sites do not import admin product marks', () => {
  for (const file of SAAS_SURFACES) {
    const source = read(file);
    assert.doesNotMatch(
      source,
      ADMIN_BRAND_IMPORTS,
      `${file} must not import admin product wordmarks (SaaS/customer identity is independent)`,
    );
    assert.doesNotMatch(source, /adminMarkIntrinsic/);
    assert.doesNotMatch(source, /soft-admin-mark\.png/);
    assert.doesNotMatch(source, /auto-admin-mark\.png/);
    assert.doesNotMatch(source, /net-worth-admin-mark\.png/);
  }
});

test('Salon Software marketing page keeps its own SALON SOFTWARE identity', () => {
  const landing = read('src/hair/components/marketing/SalonSoftwareLanding.tsx');
  assert.match(landing, /SALON SOFTWARE/);
  assert.doesNotMatch(landing, /FyhMark/);
  assert.doesNotMatch(landing, /soft-admin-mark\.png/);
  assert.doesNotMatch(landing, />\s*SOFT\s*</);
});

test('Platform chrome keeps FYHAIR SaaS / Platform identity', () => {
  const sidebar = read('src/platform/components/shell/PlatformSidebar.tsx');
  const topBar = read('src/platform/components/shell/PlatformTopBar.tsx');
  assert.match(sidebar, /FYHAIR SaaS/);
  assert.match(topBar, />\s*Platform\s*</);
  assert.doesNotMatch(sidebar, /FyhMark|soft-admin-mark/);
  assert.doesNotMatch(topBar, /FyhMark|soft-admin-mark/);
});

test('Admin mark PNG components are isolated to SOFT/AUTO/NET WORTH wrappers', () => {
  const importers = [
    'src/components/brand/fyh/FyhMark.tsx',
    'src/components/brand/capital-os/CapitalOsMark.tsx',
    'src/components/brand/owner-os/OwnerOsMark.tsx',
  ];
  for (const file of importers) {
    assert.match(read(file), /<img\b/, `${file} must render transparent PNG mark`);
  }

  const pgMark = read('src/components/brand/apg-os/ApgOsMark.tsx');
  assert.doesNotMatch(pgMark, /soft-admin-mark|auto-admin-mark|net-worth-admin-mark/);
  assert.match(pgMark, /pg-admin-mark\.png/);
});
