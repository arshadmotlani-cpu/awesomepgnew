/* eslint-disable no-console */
import { readFileSync } from 'node:fs';
import { and, eq, isNotNull, sql } from 'drizzle-orm';

function loadDatabaseUrl(): void {
  if (process.env.DATABASE_URL?.trim()) return;
  for (const path of ['.env.prod.live', '.env.bak', '.env.off', '.env.local']) {
    try {
      const raw = readFileSync(path, 'utf8');
      const match = raw.match(/^DATABASE_URL=(.+)$/m);
      const value = match?.[1]?.trim().replace(/^["']|["']$/g, '');
      if (value) {
        process.env.DATABASE_URL = value;
        console.log(`Using DATABASE_URL from ${path}`);
        return;
      }
    } catch {
      // next
    }
  }
}

loadDatabaseUrl();

async function main() {
  const { listAdminElectricityInvoicesForReminders } = await import('../src/db/queries/admin');
  const { buildCollectionsQueue } = await import('../src/lib/billing/collectionsQueue');
  const { db } = await import('../src/db/client');
  const { electricityInvoices, customers } = await import('../src/db/schema');

  const elec = await listAdminElectricityInvoicesForReminders();
  const rows = elec.ok ? elec.data : [];
  const queue = buildCollectionsQueue({ rentRows: [], electricityRows: rows });

  console.log('\n=== Electricity Due queue (buildCollectionsQueue SSOT) ===');
  console.log('count:', queue.length);
  for (const q of queue) {
    console.log(`- ${q.customerFullName} | ${q.invoiceNumber} | ₹${(q.amountPaise / 100).toFixed(2)} | ${q.effectiveStatus}`);
  }

  const queueIds = new Set(queue.map((q) => q.sourceId));
  const rowById = new Map(rows.map((r) => [r.id, r]));

  console.log('\n=== Queue rows detail ===');
  for (const q of queue) {
    const r = rowById.get(q.sourceId);
    console.log({
      name: q.customerFullName,
      invoice: q.invoiceNumber,
      proof: r?.paymentProofUrl ? 'YES' : 'no',
      status: r?.effectiveStatus,
      outstanding: r?.outstandingPaise,
    });
  }

  const badProofInQueue = rows.filter((r) => r.paymentProofUrl && queueIds.has(r.id));
  console.log('\n=== BUG: in queue WITH payment proof ===', badProofInQueue.length);

  const pendingWithProof = await db
    .select({
      id: electricityInvoices.id,
      num: electricityInvoices.invoiceNumber,
      status: electricityInvoices.status,
      proof: electricityInvoices.paymentProofUrl,
      paidPaise: electricityInvoices.paidPaise,
      amountPaise: electricityInvoices.amountPaise,
      name: customers.fullName,
    })
    .from(electricityInvoices)
    .innerJoin(customers, eq(customers.id, electricityInvoices.customerId))
    .where(and(eq(electricityInvoices.status, 'pending'), isNotNull(electricityInvoices.paymentProofUrl)));

  console.log('\n=== Pending with proof (should NOT be in electricity due) ===');
  for (const r of pendingWithProof) {
    const inDue = queueIds.has(r.id) ? '*** IN DUE QUEUE ***' : 'ok (not in due)';
    console.log(`- ${r.name} | ${r.num} | ${inDue}`);
  }

  const partialPaid = await db.execute(sql`
    SELECT ei.id, ei.invoice_number, c.full_name, ei.status, ei.amount_paise, ei.paid_paise,
           ei.payment_proof_url IS NOT NULL AS has_proof,
           ei.late_fee_locked_paise
    FROM electricity_invoices ei
    JOIN customers c ON c.id = ei.customer_id
    WHERE ei.status = 'pending' AND ei.paid_paise > 0
    ORDER BY ei.updated_at DESC
  `);

  console.log('\n=== Partial paid still pending ===');
  for (const r of (partialPaid as { rows?: unknown[] }).rows ?? partialPaid) {
    const row = r as Record<string, unknown>;
    const inDue = queueIds.has(String(row.id)) ? 'IN DUE' : 'not in due';
    console.log({ ...row, inDue });
  }

  await db.$client.end?.();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
