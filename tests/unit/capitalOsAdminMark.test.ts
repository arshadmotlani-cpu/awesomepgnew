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
  assert.ok(coverage >= 0.08, `${relPath} lettering coverage ${(coverage * 100).toFixed(1)}%`);
  assert.ok(coverage <= 0.65, `${relPath} must not be a solid plate`);
}

test('Capital admin mark is a transparent PNG wordmark via CapitalOsMark, not CSS text', () => {
  const markSource = read('src/components/brand/capital-os/CapitalOsMark.tsx');
  assert.match(markSource, /CAPITAL_OS_MARK_SRC = '\/capital-os\/auto-admin-mark\.png'/);
  assert.match(markSource, /<img\b/);
  assert.doesNotMatch(markSource, /AdminProductWordmark/);
  assert.doesNotMatch(markSource, /CAPITAL_OS_BARS/);
  assert.doesNotMatch(markSource, />\s*Capital\s*OS\s*</);
});

test('auto-admin-mark.png is transparent with tight lettering coverage', async () => {
  await assertTransparentWordmarkPng('public/capital-os/auto-admin-mark.png');
});

test('Capital admin mark component is used in sidebar, header, login, mobile nav, and not-found', () => {
  const files = [
    'src/capital/components/CapitalTopBar.tsx',
    'src/capital/components/CapitalSidebar.tsx',
    'app/(capital)/auth/login/page.tsx',
    'src/capital/components/CapitalMobileNav.tsx',
    'app/(capital)/not-found.tsx',
  ];
  for (const file of files) {
    const source = read(file);
    assert.match(
      source,
      /CapitalOsMark|CapitalOsLogoLockup|CapitalBrandLogo/,
      `${file} must render Capital branding mark`,
    );
    assert.doesNotMatch(source, /CAPITAL_OS\.name/, `${file} must not render Capital OS text lockup`);
    assert.doesNotMatch(
      source,
      /CAPITAL_OS\.legalName/,
      `${file} must not render Automotive Capital text lockup`,
    );
    assert.doesNotMatch(
      source,
      /Automotive Capital/,
      `${file} must not render Automotive Capital visible branding`,
    );
  }
});
