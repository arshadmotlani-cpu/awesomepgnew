import { notFound } from 'next/navigation';
import { LiabilityDetailUi } from '@/src/owner/components/wealth/LiabilityUi';
import { getLiabilityDetail } from '@/src/owner/services/liabilities';
import { getAccountsWithBalancesResolved } from '@/src/owner/services/financialAccounts';
import { coerceWealthPaise } from '@/src/owner/lib/wealth/paiseCoercion';

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
        currentPrincipalPaise: coerceWealthPaise(detail.liability.currentPrincipalPaise),
        originalPrincipalPaise: coerceWealthPaise(detail.liability.originalPrincipalPaise),
        interestRateBps: coerceWealthPaise(detail.liability.interestRateBps),
      }}
      due={detail.due}
      accounts={accounts.map((a) => ({ id: a.id, name: a.name }))}
      payments={detail.payments.map((p) => ({
        id: p.id,
        entryDate: p.entryDate,
        description: p.description,
        eventType: p.eventType,
        amountPaise: coerceWealthPaise(p.amountPaise),
        category: p.category,
        principalPaise: coerceWealthPaise(p.allocation?.principalPaise ?? 0),
        interestPaise:
          p.eventType === 'EXPENSE'
            ? coerceWealthPaise(p.amountPaise)
            : coerceWealthPaise(p.allocation?.interestPaise ?? 0),
      }))}
      totalPrincipalPaidPaise={coerceWealthPaise(detail.totalPrincipalPaidPaise)}
      totalInterestPaidPaise={coerceWealthPaise(detail.totalInterestPaidPaise)}
    />
  );
}
