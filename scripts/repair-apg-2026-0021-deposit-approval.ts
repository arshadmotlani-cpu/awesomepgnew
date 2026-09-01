#!/usr/bin/env npx tsx
/**
 * Repair APG-2026-0021 deposit-link approval via application service (idempotent).
 *
 *   npx tsx scripts/repair-apg-2026-0021-deposit-approval.ts --dry-run
 *   npx tsx scripts/repair-apg-2026-0021-deposit-approval.ts --execute
 */
import { sql } from 'drizzle-orm';
import { db, closeDb } from '@/src/db/client';
import { loadProductionAuditEnv, requireDatabaseUrl } from '@/src/lib/db/loadEnv';
import type { AdminSession } from '@/src/lib/auth/session';
import { approveDepositLinkPaymentProof } from '@/src/services/residentCharges';

loadProductionAuditEnv();
requireDatabaseUrl('repair-apg-2026-0021-deposit-approval.ts');

const BOOKING_CODE = 'APG-2026-0021';
const BOOKING_ID = '90c6fd25-bf5b-41c4-9b34-527bfe9c969a';
const LINK_ID = '0d3e7d24-c6b7-474a-ac39-80f7e70e2990';
const INVOICE_NUMBER = 'INV-2026-SHA-0004';
const DEPOSIT_PAISE = 321_140;
const UTR = '624346908874';

const dryRun = !process.argv.includes('--execute');

const REPAIR_SESSION: AdminSession = {
  kind: 'admin',
  sessionId: 'repair-apg-2026-0021',
  adminId: '69b20ae4-657a-45ea-912a-04b0665e38f8',
  email: 'admin@foryour.co',
  fullName: 'APG-2026-0021 Deposit Repair',
  role: 'super_admin',
  pgScope: [],
  mustChangePassword: false,
  rememberMe: false,
  expiresAt: new Date(Date.now() + 86_400_000),
};

async function auditSnapshot(label: string) {
  const [link] = await db.execute(sql`
    SELECT id, status, amount::bigint::int AS amount_paise, payment_proof_transaction_ref
    FROM payment_links WHERE id = ${LINK_ID}
  `);
  const [invoice] = await db.execute(sql`
    SELECT invoice_number, status, amount_paise::bigint::int
    FROM financial_invoices WHERE invoice_number = ${INVOICE_NUMBER}
  `);
  const ledger = await db.execute(sql`
    SELECT id::text, entry_kind, amount_paise::bigint::int, reason, related_payment_id, created_at::text
    FROM deposit_ledger WHERE booking_id = ${BOOKING_ID} ORDER BY created_at
  `);
  const [rc] = await db.execute(sql`
    SELECT rcr.id, rcr.status, rcr.completed_at::text,
      rcr.quote_snapshot->'newRentChargePaise' AS new_rent_charge_paise,
      rcr.quote_snapshot->'newRentDuePaise' AS new_rent_due_paise,
      rcr.quote_snapshot->'depositDuePaise' AS deposit_due_paise,
      rcr.quote_snapshot->'unusedPrepaidCreditPaise' AS unused_prepaid_credit_paise
    FROM room_change_requests rcr
    JOIN bookings b ON b.id = rcr.booking_id
    WHERE b.booking_code = ${BOOKING_CODE}
    ORDER BY rcr.created_at DESC LIMIT 1
  `);
  const rooms = await db.execute(sql`
    SELECT r.room_number, b.bed_code, br.status, br.kind
    FROM bed_reservations br
    JOIN beds b ON b.id = br.bed_id
    JOIN rooms r ON r.id = b.room_id
    WHERE br.booking_id = ${BOOKING_ID} AND br.status = 'active'
    ORDER BY br.created_at
  `);
  const childInvoices = await db.execute(sql`
    SELECT invoice_number, source_table, status, amount_paise::bigint::int
    FROM financial_invoices
    WHERE booking_id = ${BOOKING_ID}
      AND source_table LIKE 'room_change_%'
    ORDER BY created_at
  `);
  const [septRent] = await db.execute(sql`
    SELECT invoice_number, status, rent_paise::bigint::int
    FROM rent_invoices
    WHERE booking_id = ${BOOKING_ID} AND billing_month = '2026-09-01'
    LIMIT 1
  `);
  const approvedRef = await db.execute(sql`
    SELECT transaction_ref_normalized, source_kind, source_id::text
    FROM pg_approved_transaction_refs
    WHERE transaction_ref_normalized = ${UTR}
  `);
  const deposit321Count = await db.execute(sql`
    SELECT count(*)::int AS n FROM deposit_ledger
    WHERE booking_id = ${BOOKING_ID} AND amount_paise = ${DEPOSIT_PAISE}
  `);

  console.log(`\n=== ${label} ===`);
  console.log(JSON.stringify({
    link,
    invoice,
    ledger,
    ledger321Count: deposit321Count,
    approvedRef,
    roomChange: rc,
    rooms,
    childInvoices,
    septRent,
  }, null, 2));
}

async function main() {
  console.log(`Mode: ${dryRun ? 'DRY-RUN (pass --execute to apply)' : 'EXECUTE'}`);
  console.log(`Target: ${BOOKING_CODE} deposit link ${LINK_ID}`);

  await auditSnapshot('BEFORE');

  if (dryRun) {
    console.log('\nWould call approveDepositLinkPaymentProof(session, linkId) twice (idempotency check).');
    await closeDb();
    return;
  }

  const first = await approveDepositLinkPaymentProof(REPAIR_SESSION, LINK_ID);
  console.log('\nFirst approval:', first);

  const second = await approveDepositLinkPaymentProof(REPAIR_SESSION, LINK_ID);
  console.log('Second approval (idempotency):', second);

  await auditSnapshot('AFTER');
  await closeDb();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
