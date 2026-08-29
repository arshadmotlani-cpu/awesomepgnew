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
  /AdminProductWordmark|ApgOsMark|FyhMark|CapitalOsMark|OwnerOsMark|ApgOsLogoLockup|CapitalOsLogoLockup|FyhSidebarBrand|FyhLoginBrandHeader/;

test('SaaS marketing, Platform, and customer sites do not import admin product marks', () => {
  for (const file of SAAS_SURFACES) {
    const source = read(file);
    assert.doesNotMatch(
      source,
      ADMIN_BRAND_IMPORTS,
      `${file} must not import admin product wordmarks (SaaS/customer identity is independent)`,
    );
    assert.doesNotMatch(source, /adminWordmarkTokens/);
    assert.doesNotMatch(source, /soft-admin-mark\.png/);
    assert.doesNotMatch(source, /auto-admin-mark\.png/);
    assert.doesNotMatch(source, /net-worth-admin-mark\.png/);
  }
});

test('Salon Software marketing page keeps its own SALON SOFTWARE identity', () => {
  const landing = read('src/hair/components/marketing/SalonSoftwareLanding.tsx');
  assert.match(landing, /SALON SOFTWARE/);
  assert.doesNotMatch(landing, /product="soft"/);
  assert.doesNotMatch(landing, />\s*SOFT\s*</);
  assert.doesNotMatch(landing, /AdminProductWordmark/);
});

test('Platform chrome keeps FYHAIR SaaS / Platform identity', () => {
  const sidebar = read('src/platform/components/shell/PlatformSidebar.tsx');
  const topBar = read('src/platform/components/shell/PlatformTopBar.tsx');
  assert.match(sidebar, /FYHAIR SaaS/);
  assert.match(topBar, />\s*Platform\s*</);
  assert.doesNotMatch(sidebar, /AdminProductWordmark|FyhMark/);
  assert.doesNotMatch(topBar, /AdminProductWordmark|FyhMark/);
});

test('AdminProductWordmark is only imported by SOFT/AUTO/NET WORTH admin mark wrappers', () => {
  const importers = [
    'src/components/brand/fyh/FyhMark.tsx',
    'src/components/brand/capital-os/CapitalOsMark.tsx',
    'src/components/brand/owner-os/OwnerOsMark.tsx',
  ];
  for (const file of importers) {
    assert.match(read(file), /AdminProductWordmark/, `${file} must wrap AdminProductWordmark`);
  }

  const pgMark = read('src/components/brand/apg-os/ApgOsMark.tsx');
  assert.doesNotMatch(pgMark, /AdminProductWordmark/);
  assert.match(pgMark, /pg-admin-mark\.png/);
});
