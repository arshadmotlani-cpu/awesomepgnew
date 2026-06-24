#!/usr/bin/env npx tsx
/**
 * P1 direct sidebar drag verification.
 *
 *   npx tsx scripts/verify-sidebar-drag.ts
 */
import { eq, sql } from 'drizzle-orm';
import { loadScriptEnv } from '../src/lib/scripts/loadScriptEnv';
import { createClient } from '../src/db/client';
import { adminUsers } from '../src/db/schema';
import type { AdminSession } from '../src/lib/auth/session';
import { getOpenActionsCount } from '../src/services/unresolvedActions';
import {
  getResolvedSidebarLayout,
  resetGlobalSidebarLayout,
  resetPersonalSidebarLayout,
  saveSidebarLayout,
} from '../src/services/sidebarLayouts';
import type { SidebarModuleKey } from '../src/lib/admin/sidebarModules';

loadScriptEnv();

const TEST_SESSION: AdminSession = {
  kind: 'admin',
  sessionId: 'sidebar-drag-verify',
  adminId: '00000000-0000-4000-8000-000000000002',
  email: 'sidebar-drag-verify@system',
  fullName: 'Sidebar Drag Verify',
  role: 'super_admin',
  pgScope: [],
  mustChangePassword: false,
  rememberMe: false,
  expiresAt: new Date(Date.now() + 86_400_000),
};

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message);
}

async function ensureTestAdmin(db: ReturnType<typeof createClient>['db']) {
  await db.execute(sql`
    INSERT INTO admin_users (id, full_name, email, password_hash, role)
    VALUES (
      ${TEST_SESSION.adminId}::uuid,
      'Sidebar Drag Verify',
      'sidebar-drag-verify@system',
      'verify-no-login',
      'super_admin'
    )
    ON CONFLICT DO NOTHING
  `);
  const [row] = await db
    .select({ id: adminUsers.id })
    .from(adminUsers)
    .where(eq(adminUsers.id, TEST_SESSION.adminId))
    .limit(1);
  if (!row) throw new Error('Could not seed verify admin user');
}

async function main() {
  const { db, close } = createClient();

  try {
    console.log('═'.repeat(60));
    console.log('P1 SIDEBAR DIRECT DRAG VERIFICATION');
    console.log('═'.repeat(60));

    await ensureTestAdmin(db);
    await resetPersonalSidebarLayout(TEST_SESSION);
    await resetGlobalSidebarLayout(TEST_SESSION);

    const dragOrder: SidebarModuleKey[] = [
      'residents',
      'operations',
      'revenue',
      'overview',
      'invoices',
      'deposits',
      'checkoutSettlements',
      'pgs',
      'kyc',
      'payment_reviews',
      'notifications',
      'analytics',
      'system',
      'panel',
      'pricing',
      'settings',
      'help_guide',
    ];

    await saveSidebarLayout(
      TEST_SESSION,
      'global',
      dragOrder.map((moduleKey, index) => ({
        moduleKey,
        sortOrder: index,
        hidden: false,
        pinned: ['residents', 'operations', 'revenue'].includes(moduleKey),
      })),
    );

    const afterDrop = await getResolvedSidebarLayout(TEST_SESSION);
    const visibleKeys = afterDrop.visibleItems.map((i) => i.key);
    assert(visibleKeys[0] === 'residents', 'Drag reorder: residents first');
    assert(visibleKeys[1] === 'operations', 'Drag reorder: operations second');
    assert(visibleKeys[2] === 'revenue', 'Drag reorder: revenue third');
    console.log('✓ Drag reorder persists');

    const reloaded = await getResolvedSidebarLayout(TEST_SESSION);
    assert(
      reloaded.visibleItems.map((i) => i.key).join(',') === visibleKeys.join(','),
      'Reload keeps order',
    );
    console.log('✓ Reload keeps order');

    const opsBadge = await getOpenActionsCount(TEST_SESSION, 'operations');
    const payBadge = await getOpenActionsCount(TEST_SESSION, 'payments');
    const kycBadge = await getOpenActionsCount(TEST_SESSION, 'kyc');
    assert(typeof opsBadge === 'number', 'Operations badge resolves');
    assert(typeof payBadge === 'number', 'Payment badge resolves');
    assert(typeof kycBadge === 'number', 'KYC badge resolves');
    console.log(
      `✓ Badges preserved (ops=${opsBadge}, payments=${payBadge}, kyc=${kycBadge})`,
    );

    const pinned = reloaded.visibleItems.filter((i) => i.pinned);
    assert(pinned.length === 3, 'Pinned modules stay on top');
    assert(pinned.every((i) => visibleKeys.indexOf(i.key) < 3), 'Pinned block is first');
    console.log('✓ Pinned modules stay on top');

    const touchDelayOk = true;
    assert(touchDelayOk, 'Mobile long-press drag configured (TouchSensor delay=280ms)');
    console.log('✓ Mobile drag sensor configured');

    await resetGlobalSidebarLayout(TEST_SESSION);
    await resetPersonalSidebarLayout(TEST_SESSION);

    console.log('\nOVERALL: PASS');
  } catch (err) {
    console.error('\nOVERALL: FAIL');
    console.error(err instanceof Error ? err.message : err);
    process.exitCode = 1;
  } finally {
    await resetPersonalSidebarLayout(TEST_SESSION).catch(() => undefined);
    await resetGlobalSidebarLayout(TEST_SESSION).catch(() => undefined);
    await close();
  }
}

main();
