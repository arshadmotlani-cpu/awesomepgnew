import { IntegrationsUi } from '@/src/owner/components/wealth/IntegrationsUi';
import { reconcileIntegrationFacts } from '@/src/owner/services/reconciliation';
import { listRecurringObligations } from '@/src/owner/services/recurringObligations';

export default async function OwnerIntegrationsPage() {
  const [reconciliation, recurring] = await Promise.all([
    reconcileIntegrationFacts().catch(() => ({ sources: [] })),
    listRecurringObligations().catch(() => []),
  ]);

  return (
    <IntegrationsUi
      sources={reconciliation.sources}
      recurring={recurring.map((r) => ({
        id: r.id,
        name: r.name,
        amountPaise: r.amountPaise,
        frequency: r.frequency,
        nextDueDate: r.nextDueDate,
      }))}
    />
  );
}
