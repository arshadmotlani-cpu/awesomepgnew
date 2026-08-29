import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

const root = process.cwd();

function read(rel: string) {
  return readFileSync(join(root, rel), 'utf8');
}

test('PG admin mark is the finalized local PNG, not a redesigned SVG path', () => {
  const markSource = read('src/components/brand/apg-os/ApgOsMark.tsx');
  assert.match(markSource, /export const APG_OS_MARK_SRC = '\/admin-os\/pg-admin-mark\.png'/);
  assert.match(markSource, /width: 512/);
  assert.match(markSource, /height: 462/);
  assert.match(markSource, /object-contain/);
  assert.match(markSource, /width: 'auto'/);
  assert.doesNotMatch(markSource, /APG_OS_SHIELD_PATH/);
  assert.doesNotMatch(markSource, />\s*ADMIN\s*</);

  const fsPath = join(root, 'public/admin-os/pg-admin-mark.png');
  assert.equal(existsSync(fsPath), true, `${fsPath} must exist`);
});

test('PG admin mark component is used in sidebar, header, and login chrome', () => {
  const files = [
    'src/components/admin/AdminTopNav.tsx',
    'src/components/brand/apg-os/ApgOsSidebarBrand.tsx',
    'src/components/brand/apg-os/AdminLoginShell.tsx',
  ];
  for (const file of files) {
    const source = read(file);
    assert.match(source, /ApgOsMark/, `${file} must render ApgOsMark`);
    assert.doesNotMatch(source, /ApgOsWordmark/, `${file} must not render ApgOsWordmark`);
  }
});
