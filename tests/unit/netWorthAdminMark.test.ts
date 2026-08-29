import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

const root = process.cwd();

function read(rel: string) {
  return readFileSync(join(root, rel), 'utf8');
}

test('Net Worth admin mark is a premium CSS wordmark, not a rectangular PNG', () => {
  const markSource = read('src/components/brand/owner-os/OwnerOsMark.tsx');
  assert.match(markSource, /AdminProductWordmark/);
  assert.match(markSource, /product="netWorth"/);
  assert.doesNotMatch(markSource, /<img\b/);
  assert.doesNotMatch(markSource, /net-worth-admin-mark\.png/);
  assert.doesNotMatch(markSource, /owner-os-ring|Owner OS</);
});

test('AdminProductWordmark renders NET WORTH as one cohesive teal wordmark', () => {
  const wordmark = read('src/components/brand/AdminProductWordmark.tsx');
  const tokens = read('src/lib/brand/adminWordmarkTokens.ts');
  assert.match(tokens, /label: 'NET WORTH'/);
  assert.match(tokens, /#2DD4BF/);
  assert.match(wordmark, /\{token\.label\}/);
  assert.doesNotMatch(wordmark, /<img\b/);
  assert.doesNotMatch(tokens, /fontScale: 0\.5/, 'NET WORTH must not be optically half-height');
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
    assert.doesNotMatch(source, /net-worth-admin-mark\.png/, `${file} must not use rectangular PNG mark`);
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
