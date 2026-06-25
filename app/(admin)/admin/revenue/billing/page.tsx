import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

/** Legacy route — Billing Center moved to /admin/billing */
export default async function LegacyBillingRedirect({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; month?: string }>;
}) {
  const sp = await searchParams;
  const params = new URLSearchParams();
  if (sp.tab) params.set('tab', sp.tab);
  if (sp.month) params.set('month', sp.month);
  const qs = params.toString();
  redirect(`/admin/billing${qs ? `?${qs}` : ''}`);
}
