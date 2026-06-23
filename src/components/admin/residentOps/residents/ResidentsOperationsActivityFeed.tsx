import type { OperationalActivityRow } from '@/src/lib/residents/residentOperationsResidentsView';
import { formatDateTime } from '@/src/lib/format';
import { OpsPanel, OpsSection } from '@/src/components/admin/residentOps/residentOpsUi';

export function ResidentsOperationsActivityFeed({
  items,
}: {
  items: OperationalActivityRow[];
}) {
  return (
    <OpsSection
      id="activity"
      title="Recent activity"
      description="Last operational events — read-only audit trail."
    >
      {items.length === 0 ? (
        <OpsPanel className="px-6 py-8">
          <p className="text-sm text-apg-silver">No recent operational events logged yet.</p>
        </OpsPanel>
      ) : (
        <OpsPanel className="divide-y divide-white/5">
          {items.map((row) => (
            <div key={row.id} className="flex flex-wrap items-start justify-between gap-3 px-5 py-3.5">
              <div>
                <p className="text-sm font-medium text-white">{row.label}</p>
                {row.detail ? (
                  <p className="mt-0.5 text-xs text-apg-silver">{row.detail}</p>
                ) : null}
              </div>
              <time className="shrink-0 text-xs tabular-nums text-apg-silver">
                {formatDateTime(row.occurredAt)}
              </time>
            </div>
          ))}
        </OpsPanel>
      )}
    </OpsSection>
  );
}
