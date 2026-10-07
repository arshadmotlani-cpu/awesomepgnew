import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

const root = process.cwd();

function read(rel: string) {
  return readFileSync(join(root, rel), 'utf8');
}

test('Owner mobile shell separates safe-area padding from header touch row', () => {
  const css = read('src/owner/styles/globals.css');
  const topBar = read('src/owner/components/OwnerTopBar.tsx');
  const layout = read('app/(owner)/owner/(app)/layout.tsx');

  assert.match(css, /\.oo-app-header\s*\{[^}]*padding-top:\s*var\(--oo-safe-top\)/s);
  assert.match(css, /\.oo-app-header-row\s*\{[^}]*min-height:\s*3\.5rem/s);
  assert.match(css, /\.oo-app-column\s*\{[^}]*grid-template-rows:\s*auto minmax\(0,\s*1fr\)/s);
  assert.match(topBar, /oo-app-header/);
  assert.match(topBar, /oo-app-header-row/);
  assert.doesNotMatch(topBar, /sticky top-0/);
  assert.doesNotMatch(topBar, /min-h-14.*pt-\[/);
  assert.match(topBar, /OwnerOsMark/);
  assert.doesNotMatch(topBar, /OWNER_OS\.name/);
  assert.match(layout, /oo-app-column/);
});

test('Mobile nav drawers apply safe-area on wrapper, not flex-centered into notch', () => {
  const ownerNav = read('src/owner/components/OwnerMobileNav.tsx');

  assert.match(ownerNav, /paddingTop: 'var\(--oo-safe-top\)'/);
  assert.match(ownerNav, /min-h-14/);
});
