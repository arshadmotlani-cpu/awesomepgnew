#!/usr/bin/env npx tsx
/**
 * P0 sidebar layout verification.
 *
 *   npx tsx scripts/verify-sidebar-layout.ts
 */
import { eq, sql } from 'drizzle-orm';
import { loadScriptEnv } from '../src/lib/scripts/loadScriptEnv';
import { createClient } from '../src/db/client';
import { adminUsers } from '../src/db/schema';
import type { AdminSession } from '../src/lib/auth/session';
import { getOpenActionsCount } from '../src/services/unresolvedActions';
import {
  getEditableSidebarLayout,
  getResolvedSidebarLayout,
  resetGlobalSidebarLayout,
  resetPersonalSidebarLayout,
  saveSidebarLayout,
} from '../src/services/sidebarLayouts';
import type { SidebarModuleKey } from '../src/lib/admin/sidebarModules';

loadScriptEnv();

const TEST_SESSION: AdminSession = {
  kind: 'admin',
  sessionId: 'sidebar-verify',
  adminId: '00000000-0000-4000-8000-000000000001',
  email: 'sidebar-verify@system',
  fullName: 'Sidebar Verify',
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
      'Sidebar Verify',
      'sidebar-verify@system',
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
    console.log('P1 SIDEBAR LAYOUT VERIFICATION');
    console.log('═'.repeat(60));

    await ensureTestAdmin(db);
    await resetPersonalSidebarLayout(TEST_SESSION);
    await resetGlobalSidebarLayout(TEST_SESSION);

    const reordered: SidebarModuleKey[] = [
      'residents',
      'operations',
      'pgs',
      'revenue',
      'overview',
      'invoices',
      'deposits',
      'checkoutSettlements',
      'kyc',
      'analytics',
      'system',
      'panel',
      'payment_reviews',
      'notifications',
      'pricing',
      'settings',
      'help_guide',
    ];

    await saveSidebarLayout(
      TEST_SESSION,
      'global',
      reordered.map((moduleKey, index) => ({
        moduleKey,
        sortOrder: index,
        hidden: ['help_guide', 'analytics', 'system'].includes(moduleKey),
        pinned: ['residents', 'operations', 'revenue'].includes(moduleKey),
      })),
    );

    const afterSave = await getResolvedSidebarLayout(TEST_SESSION);
    const visibleKeys = afterSave.visibleItems.map((i) => i.key);
    assert(afterSave.source === 'global', 'Expected global layout source');
    assert(!visibleKeys.includes('help_guide'), 'Hidden help_guide should not render');
    assert(!visibleKeys.includes('analytics'), 'Hidden analytics should not render');
    assert(visibleKeys[0] === 'residents', 'Pinned residents should be first');
    assert(visibleKeys[1] === 'operations', 'Pinned operations should be second');
    assert(visibleKeys[2] === 'revenue', 'Pinned revenue should be third');
    console.log('✓ Global reorder + hide + pin persists');

    const badges = await getOpenActionsCount(TEST_SESSION, 'operations');
    assert(typeof badges === 'number', 'Badge count should be a number');
    console.log(`✓ Badges still resolve (operations count=${badges})`);

    await saveSidebarLayout(
      TEST_SESSION,
      'personal',
      reordered.map((moduleKey, index) => ({
        moduleKey,
        sortOrder: index,
        hidden: moduleKey === 'help_guide',
        pinned: moduleKey === 'pgs',
      })),
    );

    const personal = await getResolvedSidebarLayout(TEST_SESSION);
    assert(personal.source === 'personal', 'Personal layout should override global');
    assert(personal.visibleItems[0]?.key === 'pgs', 'Personal pin should win');
    assert(!personal.visibleItems.some((i) => i.key === 'help_guide'), 'Personal hide works');
    console.log('✓ Personal override works');

    const editableGlobal = await getEditableSidebarLayout(TEST_SESSION, 'global');
    assert(editableGlobal.source === 'global', 'Editable global scope');
    assert(editableGlobal.items.some((i) => i.key === 'residents'), 'Global layout rows still stored');
    console.log('✓ Global layout stored independently');

    await resetPersonalSidebarLayout(TEST_SESSION);
    const afterPersonalReset = await getResolvedSidebarLayout(TEST_SESSION);
    assert(afterPersonalReset.source === 'global', 'After personal reset, fall back to global');
    console.log('✓ Reset personal layout');

    await resetGlobalSidebarLayout(TEST_SESSION);
    const afterGlobalReset = await getResolvedSidebarLayout(TEST_SESSION);
    assert(afterGlobalReset.source === 'default', 'After global reset, use defaults');
    console.log('✓ Reset global layout');

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
