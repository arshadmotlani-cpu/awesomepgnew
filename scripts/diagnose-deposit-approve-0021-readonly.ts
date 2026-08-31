/**
 * Read-only: diagnose deposit-link approval state for APG-2026-0021.
 */
import { sql } from 'drizzle-orm';
import { db } from '@/src/db/client';
import { loadProductionAuditEnv, requireDatabaseUrl } from '@/src/lib/db/loadEnv';
import { normalizeTransactionRef } from '@/src/lib/payments/transactionRefDuplicate';

loadProductionAuditEnv();
requireDatabaseUrl();

const BOOKING_CODE = 'APG-2026-0021';
const DEPOSIT_LINK_ID = '0d3e7d24-c6b7-474a-ac39-80f7e70e2990';

async function main() {
  const links = await db.execute(sql`
    SELECT pl.id, pl.purpose, pl.status, pl.amount::bigint::int AS amount_paise,
      pl.payment_proof_transaction_ref, pl.payment_proof_url IS NOT NULL AS has_screenshot,
      pl.invoice_id, pl.booking_id, pl.created_at::text
    FROM payment_links pl
    JOIN bookings b ON b.id = pl.booking_id
    WHERE b.booking_code = ${BOOKING_CODE}
    ORDER BY pl.created_at
  `);

  const [link] = await db.execute<{
    id: string;
    payment_proof_transaction_ref: string | null;
    amount_paise: number;
    status: string;
    invoice_id: string | null;
  }>(sql`
    SELECT id, payment_proof_transaction_ref, amount::bigint::int AS amount_paise, status, invoice_id
    FROM payment_links WHERE id = ${DEPOSIT_LINK_ID}
  `);

  const rawRef = link?.payment_proof_transaction_ref ?? null;
  const normalized = normalizeTransactionRef(rawRef);

  const approvedRefs = normalized
    ? await db.execute(sql`
        SELECT transaction_ref_normalized, source_kind, source_id::text, approved_at::text
        FROM pg_approved_transaction_refs
        WHERE transaction_ref_normalized = ${normalized}
      `)
    : [];

  const ledger = await db.execute(sql`
    SELECT id::text, entry_kind, amount_paise::bigint::int, reason, related_payment_id, created_at::text
    FROM deposit_ledger
    WHERE booking_id = (SELECT id FROM bookings WHERE booking_code = ${BOOKING_CODE} LIMIT 1)
    ORDER BY created_at
  `);

  const inv = link?.invoice_id
    ? await db.execute(sql`
        SELECT id::text, invoice_number, status, amount_paise::bigint::int, source_table, breakdown
        FROM financial_invoices WHERE id = ${link.invoice_id}
      `)
    : [];

  const audit = await db.execute(sql`
    SELECT action, entity, entity_id::text, created_at::text, diff
    FROM audit_log
    WHERE entity = 'deposit_ledger'
      AND diff::text LIKE '%90c6fd25-bf5b-41c4-9b34-527bfe9c969a%'
    ORDER BY created_at DESC
    LIMIT 10
  `);

  console.log(
    JSON.stringify(
      {
        links,
        depositLink: link,
        normalizedTxnRef: normalized,
        approvedRefs,
        ledger,
        depositInvoice: inv,
        recentDepositAudit: audit,
        providerPaymentId: `deposit-link-proof-${DEPOSIT_LINK_ID}`,
      },
      null,
      2,
    ),
  );
}

main().then(() => process.exit(0)).catch((e) => {
  console.error(e);
  process.exit(1);
});
