/**
 * Profiles rent payment-approval hot-path costs against production.
 * Does NOT approve anything — measures queue rebuild + settlement read costs.
 *
 *   PAYMENT_APPROVAL_TIMING=1 DATABASE_URL=… npx tsx scripts/profile-rent-payment-approval.ts
 */
import postgres from 'postgres';

async function main() {
  const sql = postgres(process.env.DATABASE_URL as string, { max: 1 });
  const timings: Record<string, number> = {};

  const mark = async (name: string, fn: () => Promise<unknown>) => {
    const t0 = performance.now();
    await fn();
    timings[name] = Math.round((performance.now() - t0) * 10) / 10;
  };

  try {
    // Warm connection
    await sql`select 1`;

    await mark('count_open_rent_proofs', async () => {
      const rows = await sql`
        select count(*)::int as n
        from rent_invoices
        where payment_proof_url is not null
          and status in ('pending', 'overdue', 'payment_in_progress')
      `;
      timings.open_rent_proofs = rows[0]?.n ?? 0;
    });

    await mark('sample_invoice_lookup', async () => {
      await sql`
        select id, status, payment_proof_url, proof_snapshot_outstanding_paise
        from rent_invoices
        where payment_proof_url is not null
        order by updated_at desc nulls last
        limit 1
      `;
    });

    await mark('idempotency_probe_style', async () => {
      await sql`
        select id from payments
        where provider = 'upi_manual'
        order by created_at desc nulls last
        limit 1
      `;
    });

    // Approximate cost of the old next-key path: list many open proofs across kinds.
    await mark('legacy_next_key_proxy_list_rent_proofs', async () => {
      await sql`
        select ri.id, ri.status, ri.pg_id, ri.customer_id, ri.booking_id,
               ri.payment_proof_url, ri.proof_snapshot_outstanding_paise
        from rent_invoices ri
        where ri.payment_proof_url is not null
          and ri.status in ('pending', 'overdue', 'payment_in_progress')
        order by ri.proof_submitted_at asc nulls last
        limit 200
      `;
    });

    // Proxy for per-PG fan-out inside listPendingPaymentReviews (sequential across PGs).
    const pgs = await sql`select id from pgs where archived_at is null`;
    timings.active_pgs = pgs.length;

    await mark('legacy_next_key_proxy_rent_proofs_all_pgs', async () => {
      for (const pg of pgs) {
        await sql`
          select id from rent_invoices
          where pg_id = ${pg.id}
            and payment_proof_url is not null
            and status in ('pending', 'overdue', 'payment_in_progress')
        `;
      }
    });

    await mark('legacy_next_key_proxy_open_proofs_global', async () => {
      await Promise.all([
        sql`select count(*)::int as n from electricity_invoices where payment_proof_url is not null`,
        sql`select count(*)::int as n from stay_extensions where payment_proof_url is not null`,
      ]);
    });

    // Allocation persist proxy (was blocking response).
    await mark('allocation_persist_proxy_invoice_reread', async () => {
      await sql`
        select id, status, paid_principal_paise, paid_late_fee_paise, rent_paise
        from rent_invoices
        where payment_proof_url is not null
        order by updated_at desc nulls last
        limit 1
      `;
    });

    const beforeHotPathMs =
      Math.round(
        (timings.legacy_next_key_proxy_rent_proofs_all_pgs +
          timings.legacy_next_key_proxy_open_proofs_global +
          timings.allocation_persist_proxy_invoice_reread +
          timings.sample_invoice_lookup +
          800) * // settlement tx + heavy revalidate estimate
          10,
      ) / 10;

    const afterHotPathMs =
      Math.round((timings.sample_invoice_lookup + 800) * 10) / 10; // auth+load+settle+fast revalidate

    console.log(
      JSON.stringify(
        {
          note: 'Proxy measurements for approve hot path. Skipping full listPendingPaymentReviews is the largest win.',
          timings,
          estimated_response_before_ms: beforeHotPathMs,
          estimated_response_after_ms: afterHotPathMs,
          estimated_saved_ms: Math.round((beforeHotPathMs - afterHotPathMs) * 10) / 10,
          expected_hot_path_after_opt: [
            'auth',
            'load_invoice',
            'ensure_proof_snapshot',
            'settlement_tx',
            'fast_revalidate',
          ],
          deferred_after_opt: [
            'persistApprovalAllocationAfterSuccess',
            'getNextPendingPaymentReviewKey / listPendingPaymentReviews',
            'admin layout / revenue / billing revalidate',
            'audit / billing event / receipt / notify / referral (Promise.all)',
          ],
        },
        null,
        2,
      ),
    );
  } finally {
    await sql.end({ timeout: 2 });
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
