import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

const root = process.cwd();

function read(rel: string) {
  return readFileSync(join(root, rel), 'utf8');
}

const ADMIN_FAVICON_DIRS = [
  'public/fyh',
  'public/capital-os',
  'public/owner-os',
];

const METADATA_AND_MANIFESTS = [
  'src/lib/brand/fyhMetadata.ts',
  'src/lib/brand/capitalOsMetadata.ts',
  'src/lib/brand/ownerOsMetadata.ts',
  'public/fyh/manifest.webmanifest',
  'public/capital/manifest.webmanifest',
  'public/owner-os/manifest.webmanifest',
];

test('admin favicon metadata does not reference wide admin-mark PNGs', () => {
  for (const file of METADATA_AND_MANIFESTS) {
    const source = read(file);
    assert.doesNotMatch(source, /soft-admin-mark\.png/, `${file} must not use SOFT admin-mark PNG`);
    assert.doesNotMatch(source, /auto-admin-mark\.png/, `${file} must not use AUTO admin-mark PNG`);
    assert.doesNotMatch(
      source,
      /net-worth-admin-mark\.png/,
      `${file} must not use NET WORTH admin-mark PNG`,
    );
  }
});

test('admin favicon SVG masters are square vector marks, not embedded wide PNG plates', () => {
  for (const dir of ADMIN_FAVICON_DIRS) {
    const master = read(join(dir, 'mark-favicon-master.svg'));
    const fav32 = read(join(dir, 'favicon-32.svg'));
    assert.match(master, /viewBox="0 0 512 512"/, `${dir}/mark-favicon-master.svg must be square`);
    assert.doesNotMatch(master, /<image\b/, `${dir} master must not embed raster admin-mark PNG`);
    assert.doesNotMatch(master, /admin-mark\.png/, `${dir} master must not reference admin-mark PNG`);
    assert.doesNotMatch(fav32, /<image\b/, `${dir}/favicon-32.svg must not embed raster plate`);
  }
});

test('favicon generator script exists for SOFT, AUTO, and NET WORTH', () => {
  const script = read('scripts/generate-admin-product-favicons.mjs');
  assert.match(script, /ADMIN_FAVICON_MASTERS/);
  assert.match(script, /soft:/);
  assert.match(script, /auto:/);
  assert.match(script, /netWorth:/);
  assert.match(script, /public\/fyh/);
  assert.match(script, /public\/capital-os/);
  assert.match(script, /public\/owner-os/);
});

test('generated favicon PNGs exist for browser tab sizes', () => {
  const required = [
    'public/fyh/favicon-16.png',
    'public/fyh/favicon-32.png',
    'public/capital-os/favicon-16.png',
    'public/capital-os/favicon-32.png',
    'public/owner-os/favicon-16.png',
    'public/owner-os/favicon-32.png',
  ];
  for (const file of required) {
    assert.equal(existsSync(join(root, file)), true, `${file} must exist`);
  }
});

test('PG favicon metadata remains on admin-os PNG ladder', () => {
  const pg = read('src/lib/brand/apgOsAdminMetadata.ts');
  const mark = read('src/components/brand/apg-os/ApgOsMark.tsx');
  assert.match(pg, /iconBase = '\/admin-os'/);
  assert.match(pg, /favicon-32\.png/);
  assert.match(mark, /pg-admin-mark\.png/, 'PG header mark PNG unchanged');
  assert.doesNotMatch(pg, /AdminProductWordmark/);
});
