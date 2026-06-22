import { notFound, redirect } from 'next/navigation';
import { resolveFinancialInvoiceRef } from '@/src/lib/billing/resolveFinancialInvoiceRef';
import { residentInvoiceSharePath } from '@/src/lib/billing/sendInvoiceOnWhatsApp';

export const dynamic = 'force-dynamic';

/** Account-area alias — redirects to the permanent share URL. */
export default async function ResidentInvoiceDetailPage({
  params,
}: {
  params: Promise<{ invoiceId: string }>;
}) {
  const { invoiceId: ref } = await params;
  const resolved = await resolveFinancialInvoiceRef(ref);
  if (!resolved) notFound();
  redirect(residentInvoiceSharePath(resolved.id));
}
