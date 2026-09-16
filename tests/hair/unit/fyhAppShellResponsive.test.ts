import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';

const root = process.cwd();

function read(rel: string) {
  return readFileSync(join(root, rel), 'utf8');
}

describe('FYHAIR app shell responsive layout', () => {
  it('desktop sidebar uses token width at lg+ only; drawer variant for touch', () => {
    const sidebar = read('src/hair/components/HairSidebar.tsx');
    assert.match(sidebar, /variant\?: 'desktop' \| 'drawer'/);
    assert.match(sidebar, /lg:w-\[var\(--fyh-sidebar-width\)\]/);
    assert.match(sidebar, /hidden lg:flex/);
    assert.doesNotMatch(sidebar, /truncate/);
    assert.match(sidebar, /fyh-nav-label/);
  });

  it('header uses drawer below lg with scrim, safe-area, and route-close', () => {
    const header = read('src/hair/components/HairAppHeader.tsx');
    assert.match(header, /fyh-nav-drawer-root/);
    assert.match(header, /fyh-nav-drawer-panel/);
    assert.match(header, /lg:hidden/);
    assert.match(header, /safe-area-inset-top/);
    assert.match(header, /usePathname/);
    assert.match(header, /onNavigate=\{closeNav\}/);
    assert.match(header, /document\.body\.style\.overflow = 'hidden'/);
  });

  it('global search shrinks with viewport instead of fixed wide max width', () => {
    const search = read('src/hair/components/HairGlobalSearch.tsx');
    assert.match(search, /min-w-0/);
    assert.match(search, /max-w-full/);
    assert.doesNotMatch(search, /max-w-md lg:max-w-lg/);
  });

  it('tenant context bar truncates org/location and wraps controls', () => {
    const bar = read('src/hair/components/HairTenantContextBar.tsx');
    assert.match(bar, /truncate/);
    assert.match(bar, /min-w-0/);
    assert.match(bar, /flex-col gap-2 sm:flex-row/);
  });

  it('app layout uses fyh-app-shell and prevents horizontal overflow', () => {
    const layout = read('app/(hair)/fyh/(app)/layout.tsx');
    assert.match(layout, /fyh-app-shell/);
    assert.match(layout, /overflow-x-clip/);
    assert.match(layout, /min-w-0/);
    assert.match(layout, /lg:flex-row/);
  });

  it('shell tokens define sidebar and drawer widths with tablet drawer override', () => {
    const css = read('src/hair/styles/globals.css');
    assert.match(css, /--fyh-sidebar-width/);
    assert.match(css, /--fyh-nav-drawer-width/);
    assert.match(css, /100dvh/);
    assert.match(css, /@media \(min-width: 768px\) and \(max-width: 1023\.98px\)/);
  });

  it('FyhMark sets explicit max width from intrinsic aspect ratio', () => {
    const mark = read('src/components/brand/fyh/FyhMark.tsx');
    assert.match(mark, /FYH_MARK_INTRINSIC\.width/);
    assert.match(mark, /maxWidth:/);
  });

  it('sidebar nav uses compact focus-visible rings (not default browser outline)', () => {
    const css = read('src/hair/styles/globals.css');
    assert.match(css, /\.fyh-nav-link:focus-visible/);
    assert.match(css, /\.fyh-nav-sublink:focus-visible/);
    assert.match(css, /fyh-nav-group-children/);
    const sidebar = read('src/hair/components/HairSidebar.tsx');
    assert.match(sidebar, /aria-expanded/);
    assert.match(sidebar, /fyh-nav-group-children/);
  });

  it('nav labels wrap instead of ellipsis truncation', () => {
    const css = read('src/hair/styles/globals.css');
    assert.match(css, /\.fyh-nav-label/);
    assert.match(css, /overflow-wrap/);
  });
});
