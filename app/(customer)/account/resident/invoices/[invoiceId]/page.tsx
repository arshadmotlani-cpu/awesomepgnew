import { notFound, redirect } from 'next/navigation';
import { resolveFinancialInvoiceRef } from '@/src/lib/billing/resolveFinancialInvoiceRef';
import { ensureInvoiceShareToken, invoicePublicSharePath } from '@/src/lib/billing/invoiceShareToken';

export const dynamic = 'force-dynamic';

/** Account-area alias — redirects to the public share URL (/i/{token}). */
export default async function ResidentInvoiceDetailPage({
  params,
}: {
  params: Promise<{ invoiceId: string }>;
}) {
  const { invoiceId: ref } = await params;
  const resolved = await resolveFinancialInvoiceRef(ref);
  if (!resolved) notFound();
  const shareToken = await ensureInvoiceShareToken(resolved.id);
  redirect(invoicePublicSharePath(shareToken));
}
