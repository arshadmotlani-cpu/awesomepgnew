import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

/** Legacy refund queue — canonical path is Checkout Settlements. */
export default async function AdminRequestsRedirectPage({
  searchParams,
}: {
  searchParams: Promise<{ reviewed?: string; read?: string }>;
}) {
  const sp = await searchParams;
  const params = new URLSearchParams();
  if (sp.reviewed) params.set('reviewed', sp.reviewed);
  if (sp.read) params.set('read', sp.read);
  const qs = params.toString();
  redirect(`/admin/checkout-settlements${qs ? `?${qs}` : ''}`);
}
