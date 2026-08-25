import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

const root = process.cwd();

function read(rel: string) {
  return readFileSync(join(root, rel), 'utf8');
}

const HEADERS: Array<{ product: string; file: string; label: string; color: RegExp }> = [
  {
    product: 'Awesome PG',
    file: 'src/components/admin/AdminTopNav.tsx',
    label: 'PG',
    color: /--apg-os-primary,#2563EB/,
  },
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
    const wordmark = new RegExp(
      `font-extrabold[^>]*>\\s*${label}\\s*<\\/span>`,
      's',
    );

    assert.match(source, wordmark, `${file} must render a bold "${label}" wordmark`);
    assert.match(source, color, `${file} wordmark must use the product brand colour`);
  });
}
