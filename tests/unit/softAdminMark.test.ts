import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import sharp from 'sharp';

const root = process.cwd();

function read(rel: string) {
  return readFileSync(join(root, rel), 'utf8');
}

async function assertTransparentWordmarkPng(relPath: string, minCoverage = 0.08) {
  const abs = join(root, relPath);
  const { data, info } = await sharp(abs).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  assert.equal(info.channels, 4, `${relPath} must have alpha channel`);

  let opaque = 0;
  for (let i = 3; i < data.length; i += 4) {
    if (data[i] > 8) opaque += 1;
  }
  const coverage = opaque / (info.width * info.height);
  assert.ok(
    coverage >= minCoverage,
    `${relPath} lettering should fill a meaningful share of canvas (${(coverage * 100).toFixed(1)}%)`,
  );
  assert.ok(
    coverage <= 0.65,
    `${relPath} must not be a solid rectangular plate (${(coverage * 100).toFixed(1)}% opaque)`,
  );
}

test('Soft admin mark is a transparent PNG wordmark via FyhMark, not CSS text', () => {
  const markSource = read('src/components/brand/fyh/FyhMark.tsx');
  assert.match(markSource, /FYH_MARK_SRC = '\/fyh\/soft-admin-mark\.png'/);
  assert.match(markSource, /<img\b/);
  assert.doesNotMatch(markSource, /AdminProductWordmark/);
  assert.doesNotMatch(markSource, /FYH_F_PATH/);
  assert.doesNotMatch(markSource, /scissors|hair/i);
});

test('soft-admin-mark.png is transparent with tight lettering coverage', async () => {
  await assertTransparentWordmarkPng('public/fyh/soft-admin-mark.png');
});

test('Soft admin mark component is used in sidebar, header, login, and not-found', () => {
  const files = [
    'src/hair/components/HairAppHeader.tsx',
    'src/components/brand/fyh/FyhSidebarBrand.tsx',
    'src/components/brand/fyh/FyhLoginBrandHeader.tsx',
    'src/hair/components/HairSidebar.tsx',
    'app/(hair)/fyh/not-found.tsx',
  ];
  for (const file of files) {
    const source = read(file);
    assert.match(
      source,
      /FyhMark|FyhSidebarBrand|FyhLoginBrandHeader/,
      `${file} must render Soft branding mark`,
    );
  }

  const header = read('src/hair/components/HairAppHeader.tsx');
  assert.doesNotMatch(header, /For Your Hair/, 'header must not render For Your Hair branding text');
  assert.doesNotMatch(header, /Salon Software/, 'header must not render Salon Software visible branding');
  assert.doesNotMatch(header, /FYH_ERP/, 'header must not render legacy salon ERP lockup text');
});
