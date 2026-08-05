/**
 * Profile electricity approval pipeline costs (read-path + structural compare).
 * Does NOT approve payments.
 *
 *   npx tsx --tsconfig tsconfig.json scripts/profile-electricity-payment-approval.ts
 */
import { loadProductionAuditEnv, requireDatabaseUrl } from '@/src/lib/db/loadEnv';
loadProductionAuditEnv();
requireDatabaseUrl('profile-electricity-approval');

import { eq, sql } from 'drizzle-orm';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { closeDb, db } from '@/src/db/client';
import { adminUsers } from '@/src/db/schema';
import type { AdminSession } from '@/src/lib/auth/session';
import { getNextPendingPaymentReviewKey } from '@/src/services/paymentProofQueue';

const OUT = join(process.cwd(), 'tmp');
const ACTIONS = join(process.cwd(), 'app/(admin)/admin/payments/actions.ts');
const ELEC_SVC = join(process.cwd(), 'src/services/electricityBilling.ts');

async function mark<T>(
  name: string,
  timings: Record<string, number>,
  fn: () => Promise<T>,
): Promise<T> {
  const t0 = performance.now();
  const result = await fn();
  timings[name] = Math.round((performance.now() - t0) * 10) / 10;
  console.log(`${name.padEnd(42)} ${timings[name]} ms`);
  return result;
}

function structuralAfter(): Record<string, boolean> {
  const actions = readFileSync(ACTIONS, 'utf8');
  const elecFn = actions.slice(actions.indexOf('export async function approveElectricityProofAction'));
  const elecEnd = elecFn.indexOf('\nexport async function approveExtensionProofAction');
  const elecBody = elecFn.slice(0, elecEnd);
  const rentFn = actions.slice(actions.indexOf('export async function approveRentProofAction'));
  const rentEnd = rentFn.indexOf('\nexport async function approveElectricityProofAction');
  const rentBody = rentFn.slice(0, rentEnd);

  const elecSvc = readFileSync(ELEC_SVC, 'utf8');
  const successFn = elecSvc.slice(
    elecSvc.indexOf('export async function recordElectricityPaymentSuccess'),
  );
  const successBody = successFn.slice(
    0,
    successFn.indexOf('\nexport async function recordElectricityPaymentFailure'),
  );

  return {
    electricity_uses_scheduleAfterPaymentApproval: /scheduleAfterPaymentApproval/.test(elecBody),
    electricity_nextKey_null: /nextKey:\s*null/.test(elecBody),
    electricity_no_withNextReviewKey: !/withNextReviewKey/.test(elecBody),
    electricity_defers_allocation: /scheduleAfterPaymentApproval[\s\S]*persistApprovalAllocationAfterSuccess/.test(
      elecBody,
    ),
    electricity_recordSuccess_defers_audit: /scheduleAfterPaymentApproval/.test(successBody),
    rent_parity_schedule: /scheduleAfterPaymentApproval/.test(rentBody),
    rent_parity_nextKey_null: /nextKey:\s*null/.test(rentBody),
  };
}

async function main() {
  mkdirSync(OUT, { recursive: true });
  const timings: Record<string, number> = {};

  const [admin] = await db
    .select({
      id: adminUsers.id,
      email: adminUsers.email,
      fullName: adminUsers.fullName,
      role: adminUsers.role,
    })
    .from(adminUsers)
    .where(eq(adminUsers.email, 'admin@foryour.in'))
    .limit(1);
  if (!admin) throw new Error('admin missing');

  const session: AdminSession = {
    kind: 'admin',
    sessionId: 'profile-ele',
    adminId: admin.id,
    email: admin.email,
    fullName: admin.fullName,
    role: admin.role,
    pgScope: [],
    mustChangePassword: false,
    rememberMe: false,
    expiresAt: new Date(Date.now() + 86_400_000),
  };

  console.log('\n=== Electricity approval profile (no mutate) ===\n');

  const pendingCount = await mark('count_pending_ele_proofs', timings, async () => {
    const [row] = await db.execute<{ n: number }>(sql`
      SELECT count(*)::int AS n
      FROM electricity_invoices
      WHERE payment_proof_url IS NOT NULL
        AND status = 'pending'
    `);
    return Number((row as { n: number })?.n ?? 0);
  });

  const sample = await mark('load_sample_ele_invoice', timings, async () => {
    const [row] = await db.execute<{ id: string }>(sql`
      SELECT ei.id
      FROM electricity_invoices ei
      WHERE ei.payment_proof_url IS NOT NULL
        AND ei.status = 'pending'
      ORDER BY ei.updated_at DESC NULLS LAST
      LIMIT 1
    `);
    if (row) return row as { id: string };
    const [anyPending] = await db.execute<{ id: string }>(sql`
      SELECT id FROM electricity_invoices WHERE status = 'pending' LIMIT 1
    `);
    return anyPending as { id: string } | undefined;
  });

  if (sample?.id) {
    await mark('fetch_ele_invoice_join_bill', timings, async () => {
      await db.execute(sql`
        SELECT ei.id, eb.room_id, eb.pg_id, eb.total_paise
        FROM electricity_invoices ei
        INNER JOIN electricity_bills eb ON eb.id = ei.electricity_bill_id
        WHERE ei.id = ${sample.id}::uuid
        LIMIT 1
      `);
    });
  }

  const nextKeyMs = await mark('getNextPendingPaymentReviewKey_legacy_cost', timings, async () => {
    await getNextPendingPaymentReviewKey(
      session,
      sample?.id ? `electricity:${sample.id}` : undefined,
    );
  });

  await mark('list_pending_ele_proofs_sql', timings, async () => {
    await db.execute(sql`
      SELECT ei.id, ei.customer_id, ei.booking_id, ei.payment_proof_url,
             ei.amount_paise, ei.paid_paise, ei.status, eb.pg_id
      FROM electricity_invoices ei
      INNER JOIN electricity_bills eb ON eb.id = ei.electricity_bill_id
      WHERE ei.payment_proof_url IS NOT NULL
        AND ei.status = 'pending'
      ORDER BY ei.updated_at ASC NULLS LAST
      LIMIT 200
    `);
  });

  const after = structuralAfter();
  const beforePath = join(OUT, 'electricity-approval-profile-before.json');
  const before = existsSync(beforePath)
    ? (JSON.parse(readFileSync(beforePath, 'utf8')) as {
        timings?: Record<string, number>;
        structuralFindings?: unknown;
      })
    : null;

  const report = {
    measuredAt: new Date().toISOString(),
    pendingEleProofs: pendingCount,
    sampleInvoiceId: sample?.id ?? null,
    timings,
    wave1HotPath: {
      note: 'Approve action no longer awaits getNextPendingPaymentReviewKey; listed cost is legacy queue rebuild avoided on hot path.',
      avoidedNextKeyLookupMs: nextKeyMs,
      structuralAfter: after,
      structuralParityWithRent:
        after.electricity_uses_scheduleAfterPaymentApproval &&
        after.electricity_nextKey_null &&
        after.electricity_no_withNextReviewKey &&
        after.electricity_defers_allocation &&
        after.electricity_recordSuccess_defers_audit,
    },
    beforeVsAfter: before
      ? {
          beforeTimings: before.timings ?? null,
          afterTimings: timings,
          deltasMs: Object.fromEntries(
            Object.keys(timings).map((k) => [
              k,
              Math.round(
                (timings[k]! - (before.timings?.[k] ?? timings[k]!)) * 10,
              ) / 10,
            ]),
          ),
        }
      : {
          note: 'No tmp/electricity-approval-profile-before.json — write one from a prior run to compare.',
        },
    structuralFindings: {
      before: [
        'await persistApprovalAllocationAfterSuccess (sync)',
        'revalidatePaymentReviewSurfaces full (sync + deferred)',
        'await withNextReviewKey → listPendingPaymentReviews via getNextPendingPaymentReviewKey',
        'await writeAuditLogNonBlocking after TX in recordElectricityPaymentSuccess',
      ],
      after: after,
    },
  };

  writeFileSync(join(OUT, 'electricity-approval-profile.json'), JSON.stringify(report, null, 2));
  if (!existsSync(beforePath)) {
    writeFileSync(beforePath, JSON.stringify(report, null, 2));
    console.log('\nSeeded tmp/electricity-approval-profile-before.json for future deltas');
  }
  console.log('\nWrote tmp/electricity-approval-profile.json\n');
  console.log(JSON.stringify(report, null, 2));
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => closeDb());
