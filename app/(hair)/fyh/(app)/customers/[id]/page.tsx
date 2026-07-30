import { Suspense } from 'react';
import { notFound } from 'next/navigation';
import { CustomerProfile } from '@/src/hair/components/customers/CustomerProfile';
import { getCustomerProfile } from '@/src/hair/services/customers';
import {
  getCustomerFinancialSummary,
  getUnifiedCustomerTimeline,
} from '@/src/hair/services/customerTimeline';

type Props = {
  params: Promise<{ id: string }>;
};

async function CustomerAccountData({ id }: { id: string }) {
  const profile = await getCustomerProfile(id);
  if (!profile) notFound();

  const [unifiedTimeline, financialSummary] = await Promise.all([
    getUnifiedCustomerTimeline(id),
    getCustomerFinancialSummary(id),
  ]);

  return (
    <CustomerProfile
      customer={profile.customer}
      notes={profile.notes}
      unifiedTimeline={unifiedTimeline}
      financialSummary={financialSummary}
    />
  );
}

function CustomerProfileSkeleton() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="fyh-glass h-36 rounded-2xl bg-white/5" />
      <div className="grid gap-3 sm:grid-cols-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="fyh-glass h-16 rounded-xl bg-white/5" />
        ))}
      </div>
      <div className="fyh-glass h-64 rounded-2xl bg-white/5" />
    </div>
  );
}

export default async function CustomerDetailPage({ params }: Props) {
  const { id } = await params;

  return (
    <Suspense fallback={<CustomerProfileSkeleton />}>
      <CustomerAccountData id={id} />
    </Suspense>
  );
}
