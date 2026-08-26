import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

const root = process.cwd();

function read(rel: string) {
  return readFileSync(join(root, rel), 'utf8');
}

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

const HEADERS: Array<{ product: string; file: string; label: string; color: RegExp }> = [
  {
    product: 'Hair (Soft)',
    file: 'src/hair/components/HairAppHeader.tsx',
    label: 'Soft',
    color: /#C4A574/,
  },
  {
    product: 'Automotive Capital',
    file: 'src/capital/components/CapitalTopBar.tsx',
    label: 'Capital',
    color: /text-ac-accent/,
  },
  {
    product: 'Owner OS',
    file: 'src/owner/components/OwnerTopBar.tsx',
    label: 'Owner',
    color: /--oo-accent,#FF5A1F/,
  },
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
