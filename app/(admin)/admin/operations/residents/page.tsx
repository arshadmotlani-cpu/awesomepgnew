import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

/** Legacy path — canonical Operations home is /admin/operations */
export default async function OperationsResidentsRedirectPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string }>;
}) {
  const params = await searchParams;
  const qs = new URLSearchParams();
  if (params.filter) qs.set('filter', params.filter);
  const query = qs.toString();
  redirect(query ? `/admin/operations?${query}` : '/admin/operations');
}
