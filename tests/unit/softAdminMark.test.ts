import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

const root = process.cwd();

function read(rel: string) {
  return readFileSync(join(root, rel), 'utf8');
}

test('Soft admin mark is the finalized local SOFT PNG, not a redesigned SVG path', () => {
  const markSource = read('src/components/brand/fyh/FyhMark.tsx');
  assert.match(markSource, /export const FYH_MARK_SRC = '\/fyh\/soft-admin-mark\.png'/);
  assert.match(markSource, /width: 512/);
  assert.match(markSource, /height: 152/);
  assert.match(markSource, /object-contain/);
  assert.match(markSource, /width: 'auto'/);
  assert.doesNotMatch(markSource, /FYH_F_PATH/);
  assert.doesNotMatch(markSource, /scissors|hair/i);

  const fsPath = join(root, 'public/fyh/soft-admin-mark.png');
  assert.equal(existsSync(fsPath), true, `${fsPath} must exist`);
});

test('Soft admin mark component is used in sidebar, header, and login chrome', () => {
  const files = [
    'src/hair/components/HairAppHeader.tsx',
    'src/components/brand/fyh/FyhSidebarBrand.tsx',
    'src/components/brand/fyh/FyhLoginBrandHeader.tsx',
    'src/hair/components/HairSidebar.tsx',
  ];
  for (const file of files) {
    const source = read(file);
    assert.match(source, /FyhMark|FyhSidebarBrand|FyhLoginBrandHeader/, `${file} must render Soft branding mark`);
  }
});
