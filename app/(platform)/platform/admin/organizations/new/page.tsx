import Link from 'next/link';
import { redirect } from 'next/navigation';

type Props = { searchParams: Promise<{ success?: string; orgId?: string }> };

export default async function NewOrganizationPage({ searchParams }: Props) {
  const params = await searchParams;
  const query = new URLSearchParams();
  if (params.success) query.set('success', params.success);
  if (params.orgId) query.set('orgId', params.orgId);
  const suffix = query.toString() ? `?${query.toString()}` : '';
  redirect(`/platform/admin/onboarding${suffix}`);
}
