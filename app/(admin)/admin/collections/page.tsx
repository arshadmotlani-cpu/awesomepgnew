import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

/** Collections merged into Revenue → Billing. */
export default async function CollectionsRedirectPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; month?: string }>;
}) {
  const sp = await searchParams;
  if (sp.tab === 'approvals') {
    redirect('/admin/operations/payment-reviews');
  }
  const params = new URLSearchParams();
  if (sp.tab) params.set('tab', sp.tab);
  if (sp.month) params.set('month', sp.month);
  const qs = params.toString();
  redirect(`/admin/revenue/billing${qs ? `?${qs}` : ''}`);
}
