import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

const root = process.cwd();

function read(rel: string) {
  return readFileSync(join(root, rel), 'utf8');
}

test('Net Worth admin header uses the finalized NET WORTH mark, not a text wordmark', () => {
  const source = read('src/owner/components/OwnerTopBar.tsx');
  assert.match(source, /from '@\/src\/components\/brand\/owner-os\/OwnerOsMark'/);
  assert.match(source, /<OwnerOsMark\b/);
  assert.doesNotMatch(
    source,
    /font-extrabold[^>]*>\s*Owner\s*<\/span>/s,
    'header must not render a text "Owner" wordmark in place of the logo',
  );
});

test('Awesome PG admin header uses the finalized PG mark, not a text wordmark', () => {
  const source = read('src/components/admin/AdminTopNav.tsx');
  assert.match(source, /from '@\/src\/components\/brand\/apg-os\/ApgOsMark'/);
  assert.match(source, /<ApgOsMark\b/);
  assert.doesNotMatch(
    source,
    /font-extrabold[^>]*>\s*PG\s*<\/span>/s,
    'header must not render a text "PG" wordmark in place of the logo',
  );
});

test('Automotive Capital admin header uses the finalized AUTO mark, not a text wordmark', () => {
  const source = read('src/capital/components/CapitalTopBar.tsx');
  assert.match(source, /from '@\/src\/components\/brand\/capital-os\/CapitalOsMark'/);
  assert.match(source, /<CapitalOsMark\b/);
  assert.doesNotMatch(
    source,
    /font-extrabold[^>]*>\s*Capital\s*<\/span>/s,
    'header must not render a text "Capital" wordmark in place of the logo',
  );
});

test('Salon Software admin header uses the finalized SOFT mark, not a text wordmark', () => {
  const source = read('src/hair/components/HairAppHeader.tsx');
  assert.match(source, /from '@\/src\/components\/brand\/fyh\/FyhMark'/);
  assert.match(source, /<FyhMark\b/);
  assert.doesNotMatch(
    source,
    /font-extrabold[^>]*>\s*Soft\s*<\/span>/s,
    'header must not render a text "Soft" wordmark in place of the logo',
  );
});

const HEADERS: Array<{ product: string; file: string; label: string; color: RegExp }> = [
  {
    product: 'Platform',
    file: 'src/platform/components/shell/PlatformTopBar.tsx',
    label: 'Platform',
    color: /--plt-accent/,
  },
];

for (const { product, file, label, color } of HEADERS) {
  test(`${product} admin header shows the "${label}" wordmark in its brand colour`, () => {
    const source = read(file);
    const wordmark = new RegExp(`font-extrabold[^>]*>\\s*${label}\\s*<\\/span>`, 's');

    assert.match(source, wordmark, `${file} must render a bold "${label}" wordmark`);
    assert.match(source, color, `${file} wordmark must use the product brand colour`);
  });
}
