import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

/** Legacy resident ops — canonical home is /admin/operations/residents */
export default async function OperationsRedirectPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string; filter?: string; resident?: string }>;
}) {
  const params = await searchParams;
  const qs = new URLSearchParams();
  if (params.filter) qs.set('filter', params.filter);
  const query = qs.toString();
  redirect(`/admin/operations/residents${query ? `?${query}` : ''}`);
}
