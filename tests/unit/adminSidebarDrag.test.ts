import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import {
  entriesFromItems,
  reassignSidebarSortOrders,
  type SidebarNavItem,
} from '../../src/components/admin/sidebar/SidebarLayoutProvider';
import { SIDEBAR_MODULE_REGISTRY, isSidebarModuleKey } from '../../src/lib/admin/sidebarModules';

function read(rel: string): string {
  return readFileSync(join(process.cwd(), rel), 'utf8');
}

function item(
  key: SidebarNavItem['key'],
  sortOrder: number,
  opts: Partial<Pick<SidebarNavItem, 'pinned' | 'hidden'>> = {},
): SidebarNavItem {
  const def = SIDEBAR_MODULE_REGISTRY[key];
  return {
    key,
    label: def.label,
    href: def.href,
    module: def.module,
    badgeKey: def.badgeKey,
    sortOrder,
    hidden: opts.hidden ?? false,
    pinned: opts.pinned ?? false,
  };
}

test('reassignSidebarSortOrders keeps pinned block before navigation', () => {
  const input = [
    item('collections', 0),
    item('overview', 1, { pinned: true }),
    item('revenue', 2),
    item('operations', 3, { pinned: true }),
  ];
  const next = reassignSidebarSortOrders(input);
  const visible = next.filter((i) => !i.hidden);
  assert.deepEqual(
    visible.map((i) => i.key),
    ['overview', 'operations', 'collections', 'revenue'],
  );
  assert.ok(visible.every((row, index) => row.sortOrder === index));
});

test('reassignSidebarSortOrders preserves hidden modules at the end', () => {
  const input = [
    item('overview', 0, { pinned: true }),
    item('pricing', 1, { hidden: true }),
    item('settings', 2, { hidden: true }),
    item('revenue', 3),
  ];
  const next = reassignSidebarSortOrders(input);
  assert.equal(next.at(-2)?.key, 'pricing');
  assert.equal(next.at(-1)?.key, 'settings');
  assert.ok(next.every((row, index) => row.sortOrder === index));
});

test('entriesFromItems emits stable module keys for persistence', () => {
  const items = reassignSidebarSortOrders([
    item('residents', 0, { pinned: true }),
    item('operations', 1, { pinned: true }),
    item('revenue', 2),
    item('overview', 3, { pinned: true }),
  ]);
  const entries = entriesFromItems(items);
  assert.deepEqual(
    entries.map((e) => e.moduleKey),
    items.map((i) => i.key),
  );
  assert.ok(entries.every((entry, index) => entry.sortOrder === index));
});

test('invalid sidebar module keys are rejected before persistence', () => {
  assert.equal(isSidebarModuleKey('not_a_module'), false);
  assert.equal(isSidebarModuleKey('overview'), true);
  for (const key of Object.keys(SIDEBAR_MODULE_REGISTRY)) {
    assert.equal(isSidebarModuleKey(key), true, `expected registry key ${key} to validate`);
  }
});

test('drag handle owns dnd-kit listeners; nav link wrapper does not override them', () => {
  const src = read('src/components/admin/sidebar/DraggableSidebarRow.tsx');
  const handleBlock = src.slice(
    src.indexOf('aria-label={`Drag ${item.label}`}'),
    src.indexOf('<div className="min-w-0 flex-1">'),
  );
  assert.match(handleBlock, /\.\.\.attributes,\s*\.\.\.listeners/);
  assert.doesNotMatch(src, /<div className="min-w-0 flex-1">[\s\S]*\.\.\.listeners/);
  assert.doesNotMatch(src, /<div className="min-w-0 flex-1">[\s\S]*onPointerDown/);
});
