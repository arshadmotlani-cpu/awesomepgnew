import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

const root = process.cwd();

function read(rel: string) {
  return readFileSync(join(root, rel), 'utf8');
}

const MARK_COMPONENTS = [
  {
    product: 'SOFT',
    file: 'src/components/brand/fyh/FyhMark.tsx',
    src: '/fyh/soft-admin-mark.png',
    intrinsicKey: 'soft',
  },
  {
    product: 'AUTO',
    file: 'src/components/brand/capital-os/CapitalOsMark.tsx',
    src: '/capital-os/auto-admin-mark.png',
    intrinsicKey: 'auto',
  },
  {
    product: 'NET WORTH',
    file: 'src/components/brand/owner-os/OwnerOsMark.tsx',
    src: '/owner-os/net-worth-admin-mark.png',
    intrinsicKey: 'netWorth',
  },
] as const;

for (const { product, file, src, intrinsicKey } of MARK_COMPONENTS) {
  test(`${product} admin mark uses transparent PNG asset like PG ApgOsMark`, () => {
    const source = read(file);
    assert.match(source, new RegExp(src.replace(/\//g, '\\/')));
    assert.match(source, /<img\b/);
    assert.match(source, /object-contain/);
    assert.match(source, /width: 'auto'/);
    assert.match(source, /height: size/);
    assert.match(source, /ADMIN_MARK_INTRINSIC/);
    assert.doesNotMatch(source, /AdminProductWordmark/);
    assert.doesNotMatch(source, /fontWeight: 800/);
    assert.doesNotMatch(source, /role="img"/);
  });

  test(`${product} intrinsic dimensions are registered for ${src}`, () => {
    const intrinsic = JSON.parse(read('src/lib/brand/adminMarkIntrinsic.json')) as Record<
      string,
      { width: number; height: number }
    >;
    const dims = intrinsic[intrinsicKey];
    assert.ok(dims?.width > 0, `${intrinsicKey} width must be set`);
    assert.ok(dims?.height > 0, `${intrinsicKey} height must be set`);
    assert.ok(
      dims.width / dims.height > 1.2,
      `${product} wordmark should be wider than tall (lettering fills canvas)`,
    );
  });
}

test('PG admin mark remains the finalized PNG and does not share SOFT/AUTO/NET WORTH assets', () => {
  const pg = read('src/components/brand/apg-os/ApgOsMark.tsx');
  assert.match(pg, /export const APG_OS_MARK_SRC = '\/admin-os\/pg-admin-mark\.png'/);
  assert.match(pg, /width: 512/);
  assert.match(pg, /height: 462/);
  assert.match(pg, /width: 'auto'/);
  assert.doesNotMatch(pg, /AdminProductWordmark/);
  assert.doesNotMatch(pg, /ADMIN_MARK_INTRINSIC/);
  assert.doesNotMatch(pg, /soft-admin-mark|auto-admin-mark|net-worth-admin-mark/);
});
