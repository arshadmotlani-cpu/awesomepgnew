import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import sharp from 'sharp';

const root = process.cwd();

function read(rel: string) {
  return readFileSync(join(root, rel), 'utf8');
}

async function assertTransparentWordmarkPng(relPath: string) {
  const abs = join(root, relPath);
  const { data, info } = await sharp(abs).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  assert.equal(info.channels, 4, `${relPath} must have alpha channel`);
  let opaque = 0;
  for (let i = 3; i < data.length; i += 4) {
    if (data[i] > 8) opaque += 1;
  }
  const coverage = opaque / (info.width * info.height);
  assert.ok(coverage >= 0.06, `${relPath} lettering coverage ${(coverage * 100).toFixed(1)}%`);
  assert.ok(coverage <= 0.65, `${relPath} must not be a solid plate`);
}

test('Net Worth admin mark is a transparent PNG wordmark via OwnerOsMark, not CSS text', () => {
  const markSource = read('src/components/brand/owner-os/OwnerOsMark.tsx');
  assert.match(markSource, /OWNER_OS_MARK_SRC = '\/owner-os\/net-worth-admin-mark\.png'/);
  assert.match(markSource, /<img\b/);
  assert.doesNotMatch(markSource, /AdminProductWordmark/);
  assert.doesNotMatch(markSource, /owner-os-ring|Owner OS</);
});

test('net-worth-admin-mark.png is transparent horizontal NET WORTH wordmark', async () => {
  await assertTransparentWordmarkPng('public/owner-os/net-worth-admin-mark.png');
  const meta = await sharp(join(root, 'public/owner-os/net-worth-admin-mark.png')).metadata();
  assert.ok(
    (meta.width ?? 0) / (meta.height ?? 1) > 4,
    'NET WORTH wordmark must be a wide single-line mark, not a stacked icon',
  );
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
