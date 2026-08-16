import { LiabilitiesListUi } from '@/src/owner/components/wealth/LiabilitiesListUi';
import { listLiabilities, getLiabilityDue } from '@/src/owner/services/liabilities';
import { coerceWealthPaise } from '@/src/owner/lib/wealth/paiseCoercion';

export default async function OwnerLiabilitiesPage() {
  const liabilities = await listLiabilities().catch(() => []);

  const rows = await Promise.all(
    liabilities.map(async (l) => {
      const due = await getLiabilityDue(l.id).catch(() => null);
      return {
        id: l.id,
        name: l.name,
        lender: l.lender,
        liabilityType: l.liabilityType,
        currentPrincipalPaise: coerceWealthPaise(l.currentPrincipalPaise),
        interestDuePaise: coerceWealthPaise(due?.interestDuePaise ?? 0),
        totalDuePaise: coerceWealthPaise(due?.totalDuePaise ?? 0),
        dueDate: due?.dueDate ?? null,
      };
    }),
  );

  return <LiabilitiesListUi liabilities={rows} />;
}
