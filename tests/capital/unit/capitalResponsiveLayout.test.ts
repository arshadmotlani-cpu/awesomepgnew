import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

const root = process.cwd();

function read(rel: string) {
  return readFileSync(join(root, rel), 'utf8');
}

test('Capital app shell uses grid column and safe-area header row', () => {
  const layout = read('app/(capital)/(app)/layout.tsx');
  const css = read('src/capital/styles/globals.css');
  const topBar = read('src/capital/components/CapitalTopBar.tsx');
  const mobileNav = read('src/capital/components/CapitalMobileNav.tsx');

  assert.match(layout, /ac-capital-shell/);
  assert.match(layout, /ac-app-column/);
  assert.match(css, /overflow:\s*hidden/);
  assert.match(layout, /--ac-safe-bottom/);
  assert.match(css, /--ac-safe-top/);
  assert.match(css, /\.ac-app-header-row/);
  assert.match(css, /100dvh/);
  assert.match(topBar, /ac-app-header/);
  assert.match(topBar, /CapitalMobileNav/);
  assert.match(topBar, /min-h-11/);
  assert.match(mobileNav, /--ac-safe-top/);
  assert.match(mobileNav, /--ac-safe-bottom/);
  assert.match(mobileNav, /overflow-y-auto overscroll-contain/);
  assert.match(mobileNav, /document\.body\.style\.overflow = 'hidden'/);
});

test('Capital root layout and login respect safe areas', () => {
  const rootLayout = read('app/(capital)/layout.tsx');
  const login = read('app/(capital)/auth/login/page.tsx');
  assert.match(rootLayout, /min-h-\[100dvh\]/);
  assert.match(login, /safe-area-inset-top/);
  assert.match(login, /safe-area-inset-bottom/);
});

test('Capital command palette accounts for top safe area', () => {
  const palette = read('src/capital/components/CommandPalette.tsx');
  assert.match(palette, /safe-area-inset-top/);
});

test('Capital New Vehicle is in shell content on mobile, not header', () => {
  const layout = read('app/(capital)/(app)/layout.tsx');
  const topBar = read('src/capital/components/CapitalTopBar.tsx');
  assert.match(layout, /assets\/new/);
  assert.match(layout, /md:hidden/);
  assert.match(topBar, /hidden shrink-0 md:block/);
});
