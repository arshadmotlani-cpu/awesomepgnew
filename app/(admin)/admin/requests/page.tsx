import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

/** Legacy requests path — refund work lives in Refund Console; other requests in Operations. */
export default async function AdminRequestsRedirectPage({
  searchParams,
}: {
  searchParams: Promise<{ reviewed?: string; read?: string; type?: string }>;
}) {
  const sp = await searchParams;
  if (sp.type === 'deposit_refund' || sp.reviewed === 'deposit_refund') {
    redirect('/admin/refunds');
  }
  const params = new URLSearchParams({ filter: 'waiting_for_admin_review' });
  if (sp.read) params.set('read', sp.read);
  redirect(`/admin/operations?${params.toString()}`);
}
