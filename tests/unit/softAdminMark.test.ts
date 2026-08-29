import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

const root = process.cwd();

function read(rel: string) {
  return readFileSync(join(root, rel), 'utf8');
}

test('Soft admin mark is a premium CSS wordmark, not a rectangular PNG', () => {
  const markSource = read('src/components/brand/fyh/FyhMark.tsx');
  assert.match(markSource, /AdminProductWordmark/);
  assert.match(markSource, /product="soft"/);
  assert.doesNotMatch(markSource, /<img\b/);
  assert.doesNotMatch(markSource, /soft-admin-mark\.png/);
  assert.doesNotMatch(markSource, /FYH_F_PATH/);
  assert.doesNotMatch(markSource, /scissors|hair/i);
});

test('AdminProductWordmark renders SOFT with purple token — no image box', () => {
  const wordmark = read('src/components/brand/AdminProductWordmark.tsx');
  const tokens = read('src/lib/brand/adminWordmarkTokens.ts');
  assert.match(wordmark, /role="img"/);
  assert.match(wordmark, /whiteSpace: 'nowrap'/);
  assert.match(wordmark, /fontWeight: 800/);
  assert.match(wordmark, /width: 'auto'/);
  assert.match(wordmark, /height: size/);
  assert.doesNotMatch(wordmark, /<img\b/);
  assert.doesNotMatch(wordmark, /textShadow/);
  assert.doesNotMatch(wordmark, /bg-black|rounded-lg|aspect-square|h-8 w-8/);
  assert.match(tokens, /#7C3AED/);
  assert.match(tokens, /label: 'SOFT'/);
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
    assert.doesNotMatch(source, /soft-admin-mark\.png/, `${file} must not use rectangular PNG mark`);
  }

  const header = read('src/hair/components/HairAppHeader.tsx');
  assert.doesNotMatch(header, /For Your Hair/, 'header must not render For Your Hair branding text');
  assert.doesNotMatch(header, /Salon Software/, 'header must not render Salon Software visible branding');
  assert.doesNotMatch(header, /FYH_ERP/, 'header must not render legacy salon ERP lockup text');
});
