import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import {
  adminNavClickIsNoOp,
  adminNavModuleFor,
  adminNavPathOnly,
  adminNavShouldClientNavigate,
} from '../../src/lib/admin/adminNavLinkLogic';
import { pathnameToModule } from '../../src/lib/admin/navigation';

function read(rel: string): string {
  return readFileSync(join(process.cwd(), rel), 'utf8');
}

test('Billing Center href resolves to billing module', () => {
  assert.equal(adminNavPathOnly('/admin/billing'), '/admin/billing');
  assert.equal(adminNavModuleFor('/admin/billing'), 'billing');
  assert.equal(pathnameToModule('/admin/billing'), 'billing');
});

test('Collections → Billing Center is not a click no-op', () => {
  assert.equal(adminNavClickIsNoOp('/admin/collections', '/admin/billing'), false);
  assert.equal(adminNavShouldClientNavigate('/admin/collections', '/admin/billing'), true);
  assert.notEqual(
    adminNavModuleFor('/admin/collections'),
    adminNavModuleFor('/admin/billing'),
  );
});

test('Revenue legacy billing tab → Billing Center navigates', () => {
  assert.equal(pathnameToModule('/admin/revenue/billing'), 'revenue');
  assert.equal(adminNavClickIsNoOp('/admin/revenue/billing', '/admin/billing'), false);
  assert.equal(adminNavShouldClientNavigate('/admin/revenue/billing', '/admin/billing'), true);
});

test('Already on Billing Center path is a no-op without query in href', () => {
  assert.equal(adminNavClickIsNoOp('/admin/billing', '/admin/billing'), true);
  assert.equal(adminNavShouldClientNavigate('/admin/billing', '/admin/billing'), false);
});

test('Same path with query-only href change still navigates', () => {
  assert.equal(
    adminNavClickIsNoOp('/admin/billing', '/admin/billing?tab=rent'),
    true,
  );
  assert.equal(
    adminNavShouldClientNavigate('/admin/billing', '/admin/billing?tab=rent'),
    true,
  );
});

test('AdminNavLink uses explicit client navigation for cross-route clicks', () => {
  const nav = read('src/components/admin/AdminNavLink.tsx');
  assert.match(nav, /useRouter/);
  assert.match(nav, /router\.push\(href\)/);
  assert.match(nav, /adminNavClickIsNoOp/);
  assert.match(nav, /adminNavShouldClientNavigate/);
  assert.doesNotMatch(nav, /pathnameToModule\(pathname\).*pathnameToModule\(href\)/s);
});
