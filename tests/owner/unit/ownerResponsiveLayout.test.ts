import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

const root = process.cwd();

function read(rel: string) {
  return readFileSync(join(root, rel), 'utf8');
}

test('Owner OS app shell uses grid column and safe-area header row', () => {
  const layout = read('app/(owner)/owner/(app)/layout.tsx');
  const css = read('src/owner/styles/globals.css');
  const topBar = read('src/owner/components/OwnerTopBar.tsx');
  const mobileNav = read('src/owner/components/OwnerMobileNav.tsx');

  assert.match(layout, /oo-shell/);
  assert.match(layout, /oo-app-column/);
  assert.match(css, /overflow:\s*hidden/);
  assert.match(layout, /--oo-safe-bottom/);
  assert.match(css, /--oo-safe-top/);
  assert.match(css, /\.oo-app-header-row/);
  assert.match(css, /100dvh/);
  assert.match(topBar, /oo-app-header/);
  assert.match(topBar, /OwnerMobileNav/);
  assert.match(topBar, /min-h-11/);
  assert.match(mobileNav, /--oo-safe-top/);
  assert.match(mobileNav, /--oo-safe-bottom/);
  assert.match(mobileNav, /overflow-y-auto overscroll-contain/);
  assert.match(mobileNav, /document\.body\.style\.overflow = 'hidden'/);
});

test('Owner OS root layout and login respect safe areas', () => {
  const rootLayout = read('app/(owner)/layout.tsx');
  const login = read('app/(owner)/owner/auth/login/login-form.tsx');
  assert.match(rootLayout, /min-h-\[100dvh\]/);
  assert.match(login, /safe-area-inset-top/);
  assert.match(login, /safe-area-inset-bottom/);
});

test('Owner nav items shared between sidebar and mobile drawer', () => {
  const nav = read('src/owner/lib/ownerNav.ts');
  const sidebar = read('src/owner/components/OwnerSidebar.tsx');
  const mobileNav = read('src/owner/components/OwnerMobileNav.tsx');
  assert.match(nav, /net-worth/);
  assert.match(sidebar, /ownerNavItems/);
  assert.match(mobileNav, /ownerNavItems/);
});
