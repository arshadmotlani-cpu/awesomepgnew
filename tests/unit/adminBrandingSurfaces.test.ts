import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

const root = process.cwd();

function read(rel: string) {
  return readFileSync(join(root, rel), 'utf8');
}

const PG_SURFACES = [
  'src/components/admin/AdminTopNav.tsx',
  'src/components/brand/apg-os/ApgOsSidebarBrand.tsx',
  'src/components/brand/apg-os/AdminLoginShell.tsx',
];

const SOFT_SURFACES = [
  'src/hair/components/HairAppHeader.tsx',
  'src/components/brand/fyh/FyhSidebarBrand.tsx',
  'src/components/brand/fyh/FyhLoginBrandHeader.tsx',
  'src/hair/components/HairSidebar.tsx',
  'app/(hair)/fyh/auth/login/page-client.tsx',
  'app/(hair)/fyh/not-found.tsx',
];

const OWNER_SURFACES = [
  'src/owner/components/OwnerTopBar.tsx',
  'src/owner/components/OwnerMobileSectionTitle.tsx',
  'src/owner/components/OwnerSidebar.tsx',
  'src/owner/components/OwnerMobileNav.tsx',
  'app/(owner)/owner/auth/login/login-form.tsx',
  'app/(owner)/not-found.tsx',
];

function assertNoForbiddenBranding(file: string, forbidden: RegExp[]) {
  const source = read(file);
  for (const pattern of forbidden) {
    assert.doesNotMatch(
      source,
      pattern,
      `${file} must not render forbidden visible branding (${pattern})`,
    );
  }
}

test('PG admin branding surfaces show mark only — no legacy wordmarks', () => {
  const forbidden = [
    /ApgOsWordmark/,
    /APG_OS\.subtitle/,
    /APG_OS\.tagline/,
    /ADMIN PANEL/,
    />\s*APG\s*OS\s*</,
    /showSubtitle/,
    /showTagline/,
  ];
  for (const file of PG_SURFACES) {
    const source = read(file);
    assert.match(source, /ApgOsMark/, `${file} must render ApgOsMark`);
    assert.match(source, /pg-admin-mark\.png|ApgOsMark/, `${file} must use PG mark`);
    assertNoForbiddenBranding(file, forbidden);
  }
});

test('Soft admin branding surfaces show SOFT mark only — no legacy salon ERP lockup', () => {
  const logoForbidden = [
    /For Your Hair/,
    /Luxury Salon ERP/,
    /For Your Hair ERP/,
    /soft-admin-mark\.png/,
    /\bADMIN PANEL\b/,
  ];
  for (const file of SOFT_SURFACES) {
    const source = read(file);
    assert.match(
      source,
      /FyhMark|FyhSidebarBrand|FyhLoginBrandHeader/,
      `${file} must render Soft branding mark`,
    );
    assertNoForbiddenBranding(file, logoForbidden);
  }

  const header = read('src/hair/components/HairAppHeader.tsx');
  assert.doesNotMatch(header, /FyhSidebarBrand/, 'header must not duplicate sidebar branding lockup');
  assert.doesNotMatch(header, /FYH_ERP/, 'header must not render legacy salon ERP lockup text');
});

test('Net Worth admin branding surfaces show mark only — no Owner OS visible branding', () => {
  const forbidden = [
    /OWNER_OS\.name/,
    /OWNER_OS\.tagline/,
    />\s*Owner\s*OS\s*</,
    /net-worth-admin-mark\.png/,
    /\bADMIN\b/,
  ];
  for (const file of OWNER_SURFACES) {
    const source = read(file);
    if (file !== 'src/owner/components/OwnerMobileSectionTitle.tsx') {
      assert.match(source, /OwnerOsMark/, `${file} must render OwnerOsMark`);
    }
    assertNoForbiddenBranding(file, forbidden);
  }
});
