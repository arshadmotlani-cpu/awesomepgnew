import { Suspense } from 'react';
import { notFound } from 'next/navigation';
import { CustomerProfile } from '@/src/hair/components/customers/CustomerProfile';
import { getCustomerProfile } from '@/src/hair/services/customers';
import { getTenantContextForPage } from '@/src/hair/lib/tenant/getTenantContext';
import {
  getCustomerFinancialSummary,
  getUnifiedCustomerTimeline,
} from '@/src/hair/services/customerTimeline';
import {
  getCustomerCreditSummary,
  listCustomerCreditHistory,
} from '@/src/hair/services/customerAdvance';
import { requireHairAuthPage } from '@/src/hair/lib/auth/guards';
import { hasPermission } from '@/src/hair/lib/auth/permissionTypes';
import { ADVANCE_RECEIVE_PERMISSION } from '@/src/hair/lib/advancePaymentPermissions';

type Props = {
  params: Promise<{ id: string }>;
};

async function CustomerAccountData({ id }: { id: string }) {
  const ctx = await getTenantContextForPage();
  const admin = await requireHairAuthPage();
  const canReceiveAdvance = hasPermission(admin, ADVANCE_RECEIVE_PERMISSION);
  const profile = await getCustomerProfile(id, ctx);
  if (!profile) notFound();

  const [unifiedTimeline, financialSummary, creditSummary, creditHistory] = await Promise.all([
    getUnifiedCustomerTimeline(id),
    getCustomerFinancialSummary(id),
    getCustomerCreditSummary(id, ctx),
    listCustomerCreditHistory(id, ctx),
  ]);

  return (
    <CustomerProfile
      customer={profile.customer}
      notes={profile.notes}
      unifiedTimeline={unifiedTimeline}
      financialSummary={financialSummary}
      creditSummary={creditSummary}
      creditHistory={creditHistory}
      canReceiveAdvance={canReceiveAdvance}
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
