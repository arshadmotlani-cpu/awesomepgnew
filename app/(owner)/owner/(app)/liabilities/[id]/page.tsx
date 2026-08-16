import { notFound } from 'next/navigation';
import { LiabilityDetailUi } from '@/src/owner/components/wealth/LiabilityUi';
import { getLiabilityDetail } from '@/src/owner/services/liabilities';
import { getAccountsWithBalancesResolved } from '@/src/owner/services/financialAccounts';

export default async function OwnerLiabilityDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [detail, accounts] = await Promise.all([
    getLiabilityDetail(id).catch(() => null),
    getAccountsWithBalancesResolved().catch(() => []),
  ]);

  if (!detail) notFound();

  return (
    <LiabilityDetailUi
      liability={{
        id: detail.liability.id,
        name: detail.liability.name,
        lender: detail.liability.lender,
        liabilityType: detail.liability.liabilityType,
        currentPrincipalPaise: detail.liability.currentPrincipalPaise,
        interestRateBps: detail.liability.interestRateBps,
      }}
      due={detail.due}
      accounts={accounts.map((a) => ({ id: a.id, name: a.name }))}
    />
  );
}
