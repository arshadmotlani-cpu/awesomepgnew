import { notFound, redirect } from 'next/navigation';
import { resolveFinancialInvoiceRef } from '@/src/lib/billing/resolveFinancialInvoiceRef';
import { invoiceDetailHref } from '@/src/lib/billing/invoiceRoutes';

export const dynamic = 'force-dynamic';

/** Permanent share alias — /resident/invoices/{invoiceNumber|uuid} → canonical resident invoice page. */
export default async function ResidentInvoiceShareAliasPage({
  params,
}: {
  params: Promise<{ ref: string }>;
}) {
  const { ref } = await params;
  const resolved = await resolveFinancialInvoiceRef(ref);
  if (!resolved) notFound();

  redirect(invoiceDetailHref(resolved.id, 'resident'));
}
