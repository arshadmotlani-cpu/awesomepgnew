import { notFound, redirect } from 'next/navigation';
import { resolveFinancialInvoiceRef } from '@/src/lib/billing/resolveFinancialInvoiceRef';
import { ensureInvoiceShareToken, invoicePublicSharePath } from '@/src/lib/billing/invoiceShareToken';

export const dynamic = 'force-dynamic';

/** Legacy share alias — redirects to public /i/{shareToken}. */
export default async function ResidentInvoiceSharePage({
  params,
}: {
  params: Promise<{ ref: string }>;
}) {
  const { ref } = await params;
  const resolved = await resolveFinancialInvoiceRef(ref);
  if (!resolved) notFound();
  const shareToken = await ensureInvoiceShareToken(resolved.id);
  redirect(invoicePublicSharePath(shareToken));
}
