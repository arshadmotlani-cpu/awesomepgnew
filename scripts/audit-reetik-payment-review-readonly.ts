/**
 * READ-ONLY audit: why APG-2026-0096 room-change ₹90 appears as Deposit Collection.
 * Mutations: 0
 */
import { loadProductionAuditEnv, requireDatabaseUrl } from '@/src/lib/db/loadEnv';

loadProductionAuditEnv();
requireDatabaseUrl('audit-reetik-payment-review');

import { writeFileSync } from 'node:fs';
import { sql } from 'drizzle-orm';
import { closeDb, db } from '@/src/db/client';
import { paiseToInr } from '@/src/lib/format';

async function main() {
  const [bk] = (await db.execute(sql`
    SELECT bk.id::text, bk.booking_code, c.full_name, c.id::text AS customer_id,
           bk.deposit_paise, bk.deposit_due_paise, bk.deposit_collection_status::text
    FROM bookings bk
    JOIN customers c ON c.id = bk.customer_id
    WHERE bk.booking_code = 'APG-2026-0096'
    LIMIT 1
  `)) as any[];

  if (!bk) {
    console.log(JSON.stringify({ error: 'booking not found', mutations: 0 }));
    return;
  }

  const roomChanges = (await db.execute(sql`
    SELECT rcr.id::text, rcr.status::text, rcr.requested_shift_date::text,
           rcr.expected_transfer_date::text, rcr.quote_snapshot,
           rcr.created_at::text,
           fb.bed_code AS from_bed, fr.room_number AS from_room,
           tb.bed_code AS to_bed, tr.room_number AS to_room
    FROM room_change_requests rcr
    LEFT JOIN beds fb ON fb.id = rcr.from_bed_id
    LEFT JOIN rooms fr ON fr.id = fb.room_id
    LEFT JOIN beds tb ON tb.id = rcr.to_bed_id
    LEFT JOIN rooms tr ON tr.id = tb.room_id
    WHERE rcr.booking_id = ${bk.id}::uuid
    ORDER BY rcr.created_at DESC
  `)) as any[];

  const paymentLinks = (await db.execute(sql`
    SELECT pl.id::text, pl.purpose::text, pl.amount, pl.status::text,
           pl.title, pl.description,
           pl.payment_proof_url IS NOT NULL AS has_proof,
           pl.payment_proof_transaction_ref, pl.created_at::text,
           pl.invoice_id::text,
           'deposit-link-' || pl.id::text AS review_key
    FROM payment_links pl
    WHERE pl.booking_id = ${bk.id}::uuid
       OR pl.resident_id = ${bk.customer_id}::uuid
    ORDER BY pl.created_at DESC
    LIMIT 30
  `)) as any[];

  const financialInvoices = (await db.execute(sql`
    SELECT fi.id::text, fi.invoice_number, fi.invoice_type::text, fi.status::text,
           fi.amount_paise, fi.notes, fi.source_table, fi.source_id::text,
           fi.created_at::text, fi.breakdown, fi.payment_link_id::text
    FROM financial_invoices fi
    WHERE fi.booking_id = ${bk.id}::uuid
    ORDER BY fi.created_at DESC
    LIMIT 40
  `)) as any[];

  const payments = (await db.execute(sql`
    SELECT p.id::text, p.purpose::text, p.status::text, p.amount_paise,
           p.provider_payment_id, p.created_at::text
    FROM payments p
    WHERE p.booking_id = ${bk.id}::uuid
    ORDER BY p.created_at DESC
    LIMIT 30
  `)) as any[];

  const rentInvoices = (await db.execute(sql`
    SELECT ri.invoice_number, ri.billing_month::text, ri.rent_paise,
           ri.paid_principal_paise, ri.status::text, ri.notes, ri.is_adhoc
    FROM rent_invoices ri
    WHERE ri.booking_id = ${bk.id}::uuid
    ORDER BY ri.billing_month DESC
    LIMIT 12
  `)) as any[];

  const linksWithProof = paymentLinks.filter((p) => p.has_proof);

  const out = {
    mutations: 0,
    booking: {
      id: bk.id,
      code: bk.booking_code,
      name: bk.full_name,
      customerId: bk.customer_id,
      depositPaise: Number(bk.deposit_paise ?? 0),
      depositDuePaise: Number(bk.deposit_due_paise ?? 0),
      depositStatus: bk.deposit_collection_status,
    },
    roomChanges: roomChanges.map((r) => ({
      id: r.id,
      status: r.status,
      from: `${r.from_room} ${r.from_bed}`,
      to: `${r.to_room} ${r.to_bed}`,
      sameRoom: r.from_room === r.to_room,
      shiftDate: r.requested_shift_date ?? r.expected_transfer_date,
      quoteSnapshot: r.quote_snapshot,
      createdAt: r.created_at,
    })),
    paymentLinks: paymentLinks.map((p) => ({
      id: p.id,
      purpose: p.purpose,
      amountInr: paiseToInr(Number(p.amount ?? 0)),
      amountPaise: Number(p.amount ?? 0),
      status: p.status,
      title: p.title,
      description: p.description,
      hasProof: p.has_proof,
      txnRef: p.payment_proof_transaction_ref,
      invoiceId: p.invoice_id,
      reviewKey: p.review_key,
      createdAt: p.created_at,
    })),
    linksWithProof: linksWithProof.map((p) => ({
      id: p.id,
      purpose: p.purpose,
      amountInr: paiseToInr(Number(p.amount ?? 0)),
      status: p.status,
      title: p.title,
      invoiceId: p.invoice_id,
      reviewKey: p.review_key,
      txnRef: p.payment_proof_transaction_ref,
    })),
    financialInvoices: financialInvoices.map((f) => ({
      id: f.id,
      number: f.invoice_number,
      invoiceType: f.invoice_type,
      status: f.status,
      amountInr: paiseToInr(Number(f.amount_paise ?? 0)),
      notes: f.notes,
      sourceTable: f.source_table,
      sourceId: f.source_id,
      paymentLinkId: f.payment_link_id,
      breakdown: f.breakdown,
      createdAt: f.created_at,
    })),
    payments: payments.map((p) => ({
      id: p.id,
      purpose: p.purpose,
      status: p.status,
      amountInr: paiseToInr(Number(p.amount_paise ?? 0)),
      providerPaymentId: p.provider_payment_id,
      createdAt: p.created_at,
    })),
    rentInvoices: rentInvoices.map((r) => ({
      number: r.invoice_number,
      month: r.billing_month,
      rentInr: paiseToInr(Number(r.rent_paise ?? 0)),
      paidInr: paiseToInr(Number(r.paid_principal_paise ?? 0)),
      status: r.status,
      notes: r.notes,
      adhoc: r.is_adhoc,
    })),
  };

  writeFileSync('/tmp/audit-reetik-payment-review.json', JSON.stringify(out, null, 2));
  console.log(JSON.stringify(out, null, 2));
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => closeDb());
