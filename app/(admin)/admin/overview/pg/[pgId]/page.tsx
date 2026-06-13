import { redirect } from 'next/navigation';

export default async function LegacyOverviewPgRedirect({
  params,
  searchParams,
}: {
  params: Promise<{ pgId: string }>;
  searchParams: Promise<{ from?: string; month?: string }>;
}) {
  const { pgId } = await params;
  const sp = await searchParams;
  const from = sp.from ?? 'revenue';
  const qs = sp.month ? `?month=${sp.month}` : '';
  redirect(`/admin/${from}/pg/${pgId}${qs}`);
}
