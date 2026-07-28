import { notFound } from 'next/navigation';
import { CustomerProfile } from '@/src/hair/components/customers/CustomerProfile';
import { getCustomerProfile } from '@/src/hair/services/customers';

type Props = {
  params: Promise<{ id: string }>;
};

export default async function CustomerDetailPage({ params }: Props) {
  const { id } = await params;
  const profile = await getCustomerProfile(id);
  if (!profile) notFound();

  return (
    <CustomerProfile
      customer={profile.customer}
      notes={profile.notes}
      timeline={profile.timeline}
    />
  );
}
