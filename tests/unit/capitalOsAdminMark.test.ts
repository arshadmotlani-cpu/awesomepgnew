import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

const root = process.cwd();

function read(rel: string) {
  return readFileSync(join(root, rel), 'utf8');
}

test('Capital admin mark is the finalized local AUTO PNG, not a redesigned SVG path', () => {
  const markSource = read('src/components/brand/capital-os/CapitalOsMark.tsx');
  assert.match(markSource, /export const CAPITAL_OS_MARK_SRC = '\/capital-os\/auto-admin-mark\.png'/);
  assert.match(markSource, /width: 512/);
  assert.match(markSource, /height: 328/);
  assert.match(markSource, /object-contain/);
  assert.match(markSource, /width: 'auto'/);
  assert.doesNotMatch(markSource, /CAPITAL_OS_BARS/);
  assert.doesNotMatch(markSource, />\s*Capital\s*OS\s*</);

  const fsPath = join(root, 'public/capital-os/auto-admin-mark.png');
  assert.equal(existsSync(fsPath), true, `${fsPath} must exist`);
});

test('Capital admin mark component is used in sidebar, header, login, and mobile nav', () => {
  const files = [
    'src/capital/components/CapitalTopBar.tsx',
    'src/capital/components/CapitalSidebar.tsx',
    'app/(capital)/auth/login/page.tsx',
    'src/capital/components/CapitalMobileNav.tsx',
  ];
  for (const file of files) {
    const source = read(file);
    assert.match(source, /CapitalOsMark|CapitalOsLogoLockup/, `${file} must render Capital branding mark`);
  }
});
