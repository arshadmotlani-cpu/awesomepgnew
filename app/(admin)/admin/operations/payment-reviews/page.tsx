import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

/** Filtered view of unified Operations queue — payment proof review panel. */
export default async function OperationsPaymentReviewsRedirectPage({
  searchParams,
}: {
  searchParams: Promise<{ booking?: string }>;
}) {
  const sp = await searchParams;
  const qs = new URLSearchParams({ filter: 'payment_proof' });
  if (sp.booking) qs.set('booking', sp.booking);
  redirect(`/admin/operations?${qs.toString()}`);
}
