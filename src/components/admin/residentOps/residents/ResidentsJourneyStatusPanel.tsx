import type { JourneyStageCount } from '@/src/lib/residents/residentOperationsResidentsView';
import { OpsPanel, OpsSection } from '@/src/components/admin/residentOps/residentOpsUi';

export function ResidentsJourneyStatusPanel({ stages }: { stages: JourneyStageCount[] }) {
  const max = Math.max(...stages.map((s) => s.count), 1);

  return (
    <OpsSection
      id="journey"
      title="Resident journey status"
      description="Where residents sit in the lifecycle — bottlenecks show up as tall bars."
    >
      <OpsPanel className="p-5">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
          {stages.map((stage) => {
            const heightPct = stage.count === 0 ? 8 : Math.max(12, Math.round((stage.count / max) * 100));
            return (
              <div key={stage.id} className="flex flex-col items-center text-center">
                <div className="flex h-28 w-full items-end justify-center rounded-xl border border-white/10 bg-[#121820] px-2 pb-2 pt-3">
                  <div
                    className="w-full max-w-[48px] rounded-t-md bg-gradient-to-t from-[#FF5A1F]/80 to-[#FF5A1F]/30"
                    style={{ height: `${heightPct}%` }}
                    aria-hidden
                  />
                </div>
                <p className="mt-3 text-2xl font-bold tabular-nums text-white">{stage.count}</p>
                <p className="mt-1 text-[11px] font-medium leading-snug text-apg-silver">{stage.label}</p>
              </div>
            );
          })}
        </div>
      </OpsPanel>
    </OpsSection>
  );
}
