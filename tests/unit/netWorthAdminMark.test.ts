import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

const root = process.cwd();

function read(rel: string) {
  return readFileSync(join(root, rel), 'utf8');
}

test('Net Worth admin mark is the finalized local PNG, not a redesigned SVG path', () => {
  const markSource = read('src/components/brand/owner-os/OwnerOsMark.tsx');
  assert.match(markSource, /export const OWNER_OS_MARK_SRC = '\/owner-os\/net-worth-admin-mark\.png'/);
  assert.match(markSource, /width: 512/);
  assert.match(markSource, /height: 120/);
  assert.match(markSource, /object-contain/);
  assert.match(markSource, /width: 'auto'/);
  assert.doesNotMatch(markSource, /owner-os-ring|Owner OS</);

  const fsPath = join(root, 'public/owner-os/net-worth-admin-mark.png');
  assert.equal(existsSync(fsPath), true, `${fsPath} must exist`);
});

test('Net Worth admin mark component is used in sidebar, header, mobile nav, login, and not-found', () => {
  const files = [
    'src/owner/components/OwnerTopBar.tsx',
    'src/owner/components/OwnerSidebar.tsx',
    'src/owner/components/OwnerMobileNav.tsx',
    'app/(owner)/owner/auth/login/login-form.tsx',
    'app/(owner)/not-found.tsx',
  ];
  for (const file of files) {
    const source = read(file);
    assert.match(source, /OwnerOsMark/, `${file} must render OwnerOsMark`);
    assert.doesNotMatch(source, /OWNER_OS\.name/, `${file} must not render Owner OS branding text`);
  }
});

test('owner metadata and manifest reference Net Worth PNG icons', () => {
  const metadata = read('src/lib/brand/ownerOsMetadata.ts');
  const manifest = read('public/owner-os/manifest.webmanifest');
  assert.match(metadata, /favicon-32\.png/);
  assert.match(metadata, /manifest\.webmanifest/);
  assert.match(manifest, /owner-os\/icon-512\.png/);
  assert.doesNotMatch(manifest, /\.svg/);
});
