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

const WORDMARK_PNGS = [
  'public/fyh/soft-admin-mark.png',
  'public/capital-os/auto-admin-mark.png',
  'public/owner-os/net-worth-admin-mark.png',
];

test('admin chrome uses dedicated transparent wordmark PNGs (not favicon squares)', () => {
  const fyh = read('src/components/brand/fyh/FyhMark.tsx');
  const capital = read('src/components/brand/capital-os/CapitalOsMark.tsx');
  const owner = read('src/components/brand/owner-os/OwnerOsMark.tsx');
  assert.match(fyh, /soft-admin-mark\.png/);
  assert.match(capital, /auto-admin-mark\.png/);
  assert.match(owner, /net-worth-admin-mark\.png/);
  for (const file of WORDMARK_PNGS) {
    assert.equal(existsSync(join(root, file)), true, `${file} must exist`);
  }
});

test('admin favicon metadata does not reference wordmark PNGs as tab icons', () => {
  for (const file of METADATA_AND_MANIFESTS) {
    const source = read(file);
    assert.doesNotMatch(
      source,
      /soft-admin-mark\.png/,
      `${file} must not use SOFT wordmark as favicon`,
    );
    assert.doesNotMatch(
      source,
      /auto-admin-mark\.png/,
      `${file} must not use AUTO wordmark as favicon`,
    );
    assert.doesNotMatch(
      source,
      /net-worth-admin-mark\.png/,
      `${file} must not use NET WORTH wordmark as favicon`,
    );
  }
});

test('admin favicon SVG masters are square compact marks, not wordmark plates', () => {
  for (const dir of ADMIN_FAVICON_DIRS) {
    const master = read(join(dir, 'mark-favicon-master.svg'));
    const fav32 = read(join(dir, 'favicon-32.svg'));
    assert.match(master, /viewBox="0 0 512 512"/, `${dir}/mark-favicon-master.svg must be square`);
    assert.doesNotMatch(master, /<image\b/, `${dir} master must not embed raster plate`);
    assert.doesNotMatch(master, /admin-mark\.png/, `${dir} master must not reference wordmark PNG`);
    assert.doesNotMatch(fav32, /<image\b/, `${dir}/favicon-32.svg must not embed raster plate`);
  }
});

test('logo generator script exists for SOFT, AUTO, and NET WORTH wordmarks + favicons', () => {
  const script = read('scripts/generate-admin-product-logos.mjs');
  assert.match(script, /ADMIN_WORDMARK_MASTERS/);
  assert.match(script, /ADMIN_FAVICON_MASTERS/);
  assert.match(script, /soft:/);
  assert.match(script, /auto:/);
  assert.match(script, /netWorth:/);
  assert.match(script, /soft-admin-mark\.png/);
  assert.match(script, /auto-admin-mark\.png/);
  assert.match(script, /net-worth-admin-mark\.png/);
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
