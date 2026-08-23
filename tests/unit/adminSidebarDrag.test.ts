import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import {
  entriesFromItems,
  reassignSidebarSortOrders,
  type SidebarNavItem,
} from '../../src/components/admin/sidebar/SidebarLayoutProvider';
import {
  moveSidebarItem,
  sidebarOrderFingerprint,
} from '../../src/components/admin/sidebar/sidebarOrder';
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

test('moveSidebarItem: drag A above B reorders correctly', () => {
  const items = [
    item('overview', 0),
    item('operations', 1),
    item('revenue', 2),
    item('residents', 3),
  ];
  const next = moveSidebarItem({
    items,
    activeKey: 'residents',
    overKey: 'revenue',
  });
  assert.ok(next);
  assert.deepEqual(
    next.filter((i) => !i.hidden).map((i) => i.key),
    ['overview', 'operations', 'residents', 'revenue'],
  );
});

test('moveSidebarItem: drag A below B reorders correctly', () => {
  const items = [
    item('overview', 0),
    item('operations', 1),
    item('revenue', 2),
    item('residents', 3),
  ];
  const next = moveSidebarItem({
    items,
    activeKey: 'operations',
    overKey: 'revenue',
  });
  assert.ok(next);
  assert.deepEqual(
    next.filter((i) => !i.hidden).map((i) => i.key),
    ['overview', 'revenue', 'operations', 'residents'],
  );
});

test('moveSidebarItem: invalid destination does not corrupt order', () => {
  const items = [
    item('overview', 0),
    item('operations', 1, { pinned: true }),
    item('revenue', 2),
  ];
  assert.equal(
    moveSidebarItem({ items, activeKey: 'revenue', overKey: 'operations' }),
    null,
    'cannot drop unpinned onto pinned section',
  );
  assert.equal(moveSidebarItem({ items, activeKey: 'revenue', overKey: 'revenue' }), null);
  assert.equal(moveSidebarItem({ items, activeKey: 'missing', overKey: 'overview' }), null);
});

test('moveSidebarItem: unrelated items keep relative order', () => {
  const items = [
    item('overview', 0),
    item('operations', 1),
    item('collections', 2),
    item('revenue', 3),
    item('residents', 4),
  ];
  const next = moveSidebarItem({
    items,
    activeKey: 'residents',
    overKey: 'operations',
  });
  assert.ok(next);
  const keys = next.filter((i) => !i.hidden).map((i) => i.key);
  assert.deepEqual(keys, ['overview', 'residents', 'operations', 'collections', 'revenue']);
});

test('entriesFromItems never introduces duplicate module keys', () => {
  const items = reassignSidebarSortOrders([
    item('residents', 0),
    item('revenue', 1),
    item('residents', 2),
  ]);
  const entries = entriesFromItems(items);
  const keys = entries.map((e) => e.moduleKey);
  assert.equal(new Set(keys).size, keys.length);
});

test('sidebarOrderFingerprint changes when order changes and is stable otherwise', () => {
  const a = [item('overview', 0), item('revenue', 1), item('residents', 2)];
  const b = [item('overview', 0), item('residents', 1), item('revenue', 2)];
  assert.equal(sidebarOrderFingerprint(a), sidebarOrderFingerprint([...a]));
  assert.notEqual(sidebarOrderFingerprint(a), sidebarOrderFingerprint(b));
});

test('saved order fingerprint matches reassigned sort orders', () => {
  // reassign sorts by sortOrder, then renumbers — array input order is not preserved.
  const items = reassignSidebarSortOrders([
    item('residents', 9),
    item('overview', 0),
    item('revenue', 3),
  ]);
  const again = reassignSidebarSortOrders(items);
  assert.equal(sidebarOrderFingerprint(items), sidebarOrderFingerprint(again));
  assert.deepEqual(
    items.map((i) => i.key),
    ['overview', 'revenue', 'residents'],
  );
  assert.ok(items.every((row, index) => row.sortOrder === index));
});

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

test('drag handle owns dnd-kit listeners; overlay preview must not use useSortable', () => {
  const row = read('src/components/admin/sidebar/DraggableSidebarRow.tsx');
  assert.match(row, /aria-label=\{`Drag \$\{item\.label\}`\}/);
  assert.match(row, /\{\.\.\.attributes\}/);
  assert.match(row, /\{\.\.\.listeners\}/);
  assert.match(row, /SidebarRowDragPreview/);
  assert.match(row, /must NOT call useSortable/);

  const previewFn = row.slice(row.indexOf('export function SidebarRowDragPreview'));
  assert.doesNotMatch(previewFn.slice(0, 500), /useSortable\(/);

  const nav = read('src/components/admin/sidebar/DraggableSidebarNav.tsx');
  assert.match(nav, /SortableContext items=\{sortableIds\}/);
  assert.doesNotMatch(nav, /SortableContext items=\{ids\}/);
});

test('persist action always writes personal layout (and global for super admin)', () => {
  const action = read('app/(admin)/admin/actions/sidebarLayout.ts');
  assert.match(action, /saveSidebarLayout\(session,\s*'personal'/);
  assert.match(action, /role === 'super_admin'/);
  assert.match(action, /saveSidebarLayout\(session,\s*'global'/);
  assert.doesNotMatch(
    action,
    /const scope = session\.role === 'super_admin' \? 'global' : 'personal'/,
  );
});

test('invalid sidebar module keys are rejected before persistence', () => {
  assert.equal(isSidebarModuleKey('not_a_module'), false);
  assert.equal(isSidebarModuleKey('overview'), true);
  for (const key of Object.keys(SIDEBAR_MODULE_REGISTRY)) {
    assert.equal(isSidebarModuleKey(key), true, `expected registry key ${key} to validate`);
  }
});

test('persist failure path rolls back local items and reports failure', () => {
  const provider = read('src/components/admin/sidebar/SidebarLayoutProvider.tsx');
  assert.match(provider, /if \(rollback\) setItems\(rollback\)/);
  assert.match(provider, /sidebar-persist-failed/);
  assert.match(provider, /confirmedOrderFingerprintRef\.current = fingerprint/);
  assert.match(provider, /LOCAL_MUTATION_GUARD_MS/);
});

test('provider ignores stale server initialItems after local reorder', () => {
  const provider = read('src/components/admin/sidebar/SidebarLayoutProvider.tsx');
  assert.match(provider, /withinGuard/);
  assert.match(provider, /serverFp === confirmedOrderFingerprintRef\.current/);
  assert.match(provider, /if \(withinGuard\) return/);
});

test('production-like sidebar structure can move Residents above Revenue', () => {
  const keys = [
    'overview',
    'operations',
    'checkoutSettlements',
    'billing',
    'pgs',
    'collections',
    'revenue',
    'invoices',
    'refunds',
    'deposits',
    'residents',
    'kyc',
    'analytics',
    'system',
  ] as const;

  const available = keys.filter((k) => isSidebarModuleKey(k));
  const items = available.map((key, index) => item(key as SidebarNavItem['key'], index));
  assert.ok(items.some((i) => i.key === 'residents'));
  assert.ok(items.some((i) => i.key === 'revenue'));

  const next = moveSidebarItem({
    items,
    activeKey: 'residents',
    overKey: 'revenue',
  });
  assert.ok(next);
  const visible = next.filter((i) => !i.hidden).map((i) => i.key);
  const residentsAt = visible.indexOf('residents');
  const revenueAt = visible.indexOf('revenue');
  assert.ok(residentsAt >= 0 && revenueAt >= 0);
  assert.ok(residentsAt < revenueAt);
});
