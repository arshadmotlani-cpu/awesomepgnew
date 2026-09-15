import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';

const root = process.cwd();

function read(rel: string) {
  return readFileSync(join(root, rel), 'utf8');
}

describe('FYHAIR app shell responsive layout', () => {
  it('sidebar stays in drawer below lg and uses narrower width at desktop', () => {
    const sidebar = read('src/hair/components/HairSidebar.tsx');
    assert.match(sidebar, /lg:flex/);
    assert.doesNotMatch(sidebar, /md:flex md:flex-col/);
    assert.match(sidebar, /lg:w-40/);
    assert.match(sidebar, /xl:w-44/);
  });

  it('header uses drawer nav below lg and avoids duplicate logo when sidebar is visible', () => {
    const header = read('src/hair/components/HairAppHeader.tsx');
    assert.match(header, /lg:hidden/);
    assert.match(header, /FyhMark[\s\S]*lg:hidden/);
    assert.match(header, /min-w-0/);
    assert.match(header, /overflow-x-hidden/);
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

  it('app layout prevents horizontal overflow on the shell', () => {
    const layout = read('app/(hair)/fyh/(app)/layout.tsx');
    assert.match(layout, /overflow-x-hidden/);
    assert.match(layout, /min-w-0/);
    assert.match(layout, /lg:flex-row/);
  });

  it('FyhMark sets explicit max width from intrinsic aspect ratio', () => {
    const mark = read('src/components/brand/fyh/FyhMark.tsx');
    assert.match(mark, /FYH_MARK_INTRINSIC\.width/);
    assert.match(mark, /maxWidth:/);
  });
});
