#!/usr/bin/env npx tsx
/**
 * P0 unresolved_actions verification — badge SSOT smoke test.
 *
 *   npx tsx scripts/verify-unresolved-actions.ts
 */
import { createClient } from '../src/db/client';
import { loadScriptEnv } from '../src/lib/scripts/loadScriptEnv';
import {
  getOpenActionsCount,
  resolveAction,
  upsertOpenAction,
} from '../src/services/unresolvedActions';
import { syncUnresolvedActionsFromDomain } from '../src/services/unresolvedActionSync';
import { syncActionItemsForCron } from '../src/services/actionItems';
import type { AdminSession } from '../src/lib/auth/session';

loadScriptEnv();

const CRON_SESSION: AdminSession = {
  kind: 'admin',
  sessionId: 'verify',
  adminId: 'verify',
  email: 'verify@system',
  fullName: 'Verify',
  role: 'super_admin',
  pgScope: [],
  mustChangePassword: false,
  rememberMe: false,
  expiresAt: new Date(Date.now() + 86_400_000),
};

async function main() {
  const { close } = createClient();
  const testKey = `verify:smoke:${Date.now()}`;

  try {
    console.log('═'.repeat(60));
    console.log('P0 UNRESOLVED ACTIONS VERIFICATION');
    console.log('═'.repeat(60));

    const kycBefore = await getOpenActionsCount(CRON_SESSION, 'kyc');

    await upsertOpenAction({
      actionType: 'kyc_review',
      entityType: 'kyc_submission',
      entityId: 'verify-submission',
      residentId: null,
      priority: 'high',
      sourceKey: testKey,
      label: 'Verify smoke KYC',
      href: '/admin/residents/kyc',
    });

    const kycAfter = await getOpenActionsCount(CRON_SESSION, 'kyc');
    assertIncreased(kycBefore, kycAfter, 'KYC badge after upsert');

    const closed = await resolveAction({ sourceKey: testKey });
    if (closed !== 1) throw new Error(`Expected 1 closed, got ${closed}`);

    const kycFinal = await getOpenActionsCount(CRON_SESSION, 'kyc');
    if (kycFinal !== kycBefore) {
      throw new Error(`KYC badge did not return to baseline: ${kycFinal} vs ${kycBefore}`);
    }

    console.log('\nSync from domain (action_items → unresolved_actions)…');
    await syncActionItemsForCron();
    const syncResult = await syncUnresolvedActionsFromDomain(CRON_SESSION);
    console.log(`  Open keys: ${syncResult.open}, closed stale: ${syncResult.closed}`);

    const ops = await getOpenActionsCount(CRON_SESSION, 'operations');
    const payments = await getOpenActionsCount(CRON_SESSION, 'payments');
    const kyc = await getOpenActionsCount(CRON_SESSION, 'kyc');
    const checkout = await getOpenActionsCount(CRON_SESSION, 'checkout');
    console.log(`\nBadge counts — operations: ${ops}, payments: ${payments}, kyc: ${kyc}, checkout: ${checkout}`);

    console.log('\nOVERALL: PASS');
  } finally {
    await resolveAction({ sourceKey: testKey }).catch(() => undefined);
    await close();
  }
}

function assertIncreased(before: number, after: number, label: string) {
  if (after <= before) {
    throw new Error(`${label}: expected increase (${before} → ${after})`);
  }
  console.log(`  PASS ${label}: ${before} → ${after}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
