import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

const root = process.cwd();

function read(rel: string) {
  return readFileSync(join(root, rel), 'utf8');
}

test('Capital admin mark is a premium CSS wordmark, not a rectangular PNG', () => {
  const markSource = read('src/components/brand/capital-os/CapitalOsMark.tsx');
  assert.match(markSource, /AdminProductWordmark/);
  assert.match(markSource, /product="auto"/);
  assert.doesNotMatch(markSource, /<img\b/);
  assert.doesNotMatch(markSource, /auto-admin-mark\.png/);
  assert.doesNotMatch(markSource, /CAPITAL_OS_BARS/);
  assert.doesNotMatch(markSource, />\s*Capital\s*OS\s*</);
});

test('AdminProductWordmark renders AUTO with electric blue token', () => {
  const tokens = read('src/lib/brand/adminWordmarkTokens.ts');
  assert.match(tokens, /#22D3EE/);
  assert.match(tokens, /label: 'AUTO'/);
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
    assert.doesNotMatch(source, /auto-admin-mark\.png/, `${file} must not use rectangular PNG mark`);
  }
});
