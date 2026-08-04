/**
 * Smoke: approve one OPTVERIFY invoice and print timings.
 */
import { loadProductionAuditEnv, requireDatabaseUrl } from '@/src/lib/db/loadEnv';
process.env.PAYMENT_APPROVAL_TIMING = '1';
loadProductionAuditEnv();
requireDatabaseUrl('smoke-optverify');

import { eq, sql } from 'drizzle-orm';
import { closeDb, db } from '@/src/db/client';
import { adminUsers, rentInvoices } from '@/src/db/schema';
import type { AdminSession } from '@/src/lib/auth/session';
import { approveRentPaymentProof } from '@/src/services/rentInvoices';

async function main() {
  const [admin] = await db
    .select()
    .from(adminUsers)
    .where(eq(adminUsers.email, 'admin@foryour.in'))
    .limit(1);
  if (!admin) throw new Error('admin missing');

  const session: AdminSession = {
    kind: 'admin',
    sessionId: 'smoke',
    adminId: admin.id,
    email: admin.email,
    fullName: admin.fullName,
    role: admin.role,
    pgScope: [],
    mustChangePassword: false,
    rememberMe: false,
    expiresAt: new Date(Date.now() + 86_400_000),
  };

  const [inv] = await db.execute<{ id: string }>(sql`
    SELECT id FROM rent_invoices
    WHERE notes LIKE 'OPTVERIFY_%'
      AND status = 'pending'
      AND payment_proof_url IS NOT NULL
    ORDER BY created_at
    LIMIT 1
  `);
  if (!inv) throw new Error('no pending OPTVERIFY invoice');
  console.log('approving', inv.id);

  const t0 = performance.now();
  const result = await approveRentPaymentProof(session, inv.id);
  console.log('result', result, 'hot_ms', Math.round(performance.now() - t0));

  const [after] = await db
    .select({ status: rentInvoices.status, paymentId: rentInvoices.paymentId })
    .from(rentInvoices)
    .where(eq(rentInvoices.id, inv.id))
    .limit(1);
  console.log('invoice after', after);

  // Wait briefly for deferred
  await new Promise((r) => setTimeout(r, 3000));
  const side = await db.execute(sql`
    SELECT
      (SELECT count(*)::int FROM audit_log WHERE entity_id = ${inv.id}::uuid) AS audits,
      (SELECT count(*)::int FROM billing_events WHERE rent_invoice_id = ${inv.id}::uuid) AS events,
      (SELECT count(*)::int FROM payment_receipts WHERE rent_invoice_id = ${inv.id}::uuid) AS receipts,
      (SELECT count(*)::int FROM payments WHERE provider_payment_id = ${`rent-proof-${inv.id}`}) AS pays
  `);
  console.log('side effects', side);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => closeDb());
