/* eslint-disable no-console */
/**
 * Settle Saswat Baral (APG-2026-0094) room change fee INV-2026-SHA-0018 (₹90).
 *
 *   npx tsx scripts/saswat-room-change-fee-settle.ts --apply
 */
import { and, eq, inArray, sql } from 'drizzle-orm';
import { loadProductionAuditEnv, requireDatabaseUrl } from '../src/lib/db/loadEnv';

loadProductionAuditEnv();
requireDatabaseUrl('saswat-room-change-fee-settle.ts');

import { closeDb, db } from '../src/db/client';
import { adminUsers, financialInvoices, paymentLinks } from '../src/db/schema';
import { markFinancialInvoicePaidWithCash } from '../src/services/adminCashSettlement';
import { reconcileRoomChangePayAllAfterChildSettlement } from '../src/services/roomTransferBilling';
import type { AdminSession } from '../src/lib/auth/session';

const APPLY = process.argv.includes('--apply');

const FEE_ID = '7bfd01db-91ca-4fb4-8e58-f94f7ad8fc71';
const PAY_ALL_PORTAL = 'ecd30e6a-2e76-4bb8-aee8-61b16c4c7396';
const ROOM_CHANGE_PAY_ALL = '9744fe0a-4e37-4b58-8239-e6d14aceca05';
const REQUEST_ID = '69e185f9-32c3-439a-a0d4-cb63ca119ccb';
const RELATED = [FEE_ID, PAY_ALL_PORTAL, ROOM_CHANGE_PAY_ALL];

async function getSuperAdminSession(): Promise<AdminSession> {
  const [admin] = await db
    .select({
      id: adminUsers.id,
      email: adminUsers.email,
      fullName: adminUsers.fullName,
      role: adminUsers.role,
      pgScope: adminUsers.pgScope,
    })
    .from(adminUsers)
    .where(eq(adminUsers.role, 'super_admin'))
    .limit(1);
  if (!admin) throw new Error('No super_admin found');
  return {
    kind: 'admin',
    sessionId: 'saswat-rc-fee-settle',
    adminId: admin.id,
    email: admin.email,
    fullName: admin.fullName,
    role: admin.role,
    pgScope: admin.pgScope ?? [],
    mustChangePassword: false,
    rememberMe: false,
    expiresAt: new Date(Date.now() + 3600000),
  };
}

async function snapshot() {
  const rows = await db
    .select({
      id: financialInvoices.id,
      invoiceNumber: financialInvoices.invoiceNumber,
      sourceTable: financialInvoices.sourceTable,
      status: financialInvoices.status,
      amountPaise: financialInvoices.amountPaise,
    })
    .from(financialInvoices)
    .where(inArray(financialInvoices.id, RELATED));

  const open = (await db.execute(sql`
    SELECT invoice_number, source_table, status, amount_paise
    FROM financial_invoices
    WHERE booking_id = (SELECT id FROM bookings WHERE booking_code = 'APG-2026-0094')
      AND status IN ('sent','overdue','partial','draft','payment_in_progress')
  `)) as Array<{ invoice_number: string; source_table: string; status: string; amount_paise: string }>;

  return { rows, open };
}

async function main() {
  const before = await snapshot();
  console.log(JSON.stringify({ phase: 'before', apply: APPLY, ...before }, null, 2));

  if (!APPLY) {
    await closeDb();
    return;
  }

  const [fee] = await db
    .select({ status: financialInvoices.status })
    .from(financialInvoices)
    .where(eq(financialInvoices.id, FEE_ID))
    .limit(1);
  if (fee?.status === 'paid') {
    console.log('Fee invoice already paid — skipping markFinancialInvoicePaidWithCash');
  } else {
    const session = await getSuperAdminSession();
    const result = await markFinancialInvoicePaidWithCash(session, {
      financialInvoiceId: FEE_ID,
      notes: 'Room change fee (₹90) settled — operator request (Saswat Baral APG-2026-0094).',
      receivedAt: new Date().toISOString(),
    });
    if (!result.ok) throw new Error(result.error);
    console.log('markFinancialInvoicePaidWithCash', result);
  }

  const recon = await reconcileRoomChangePayAllAfterChildSettlement(REQUEST_ID);
  console.log('reconcileRoomChangePayAllAfterChildSettlement', recon);

  const [portal] = await db
    .select()
    .from(financialInvoices)
    .where(eq(financialInvoices.id, PAY_ALL_PORTAL))
    .limit(1);
  if (portal && ['sent', 'overdue', 'partial', 'draft'].includes(portal.status)) {
    await db.transaction(async (tx) => {
      await tx
        .update(financialInvoices)
        .set({
          status: 'cancelled',
          cancelledAt: new Date(),
          cancellationReason:
            'Stale pay-all — underlying rent and room-change fee settled individually',
          updatedAt: new Date(),
        })
        .where(eq(financialInvoices.id, PAY_ALL_PORTAL));
      if (portal.paymentLinkId) {
        await tx
          .update(paymentLinks)
          .set({ status: 'expired' })
          .where(
            and(eq(paymentLinks.id, portal.paymentLinkId), eq(paymentLinks.status, 'active')),
          );
      }
    });
    console.log('Cancelled stale resident_portal_pay_all', PAY_ALL_PORTAL);
  }

  const after = await snapshot();
  console.log(JSON.stringify({ phase: 'after', ...after }, null, 2));
  await closeDb();
}

main().catch(async (e) => {
  console.error(e);
  await closeDb();
  process.exit(1);
});
