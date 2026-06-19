import Link from 'next/link';
import {
  LIFECYCLE_STAGES,
  deriveResidentLifecycle,
  lifecycleStageIndex,
  type ResidentLifecycleStage,
} from '@/src/lib/residents/residentOperationsDashboard';
import type { ResidentListRow } from '@/src/services/residentAdmin';
import { formatDate } from '@/src/lib/format';
import {
  LIFECYCLE_ICONS,
  OpsPanel,
  OpsSection,
} from '@/src/components/admin/residentOps/residentOpsUi';

function stageDateLabel(
  stageId: ResidentLifecycleStage,
  resident: ResidentListRow,
): string | null {
  if (stageId === 'lead' || stageId === 'applied') {
    return formatDate(resident.createdAt);
  }
  return null;
}

export function ResidentOperationsTimeline({
  resident,
  clearHref,
}: {
  resident: ResidentListRow | null;
  clearHref: string;
}) {
  if (!resident) {
    return (
      <OpsSection id="timeline" title="Resident timeline">
        <OpsPanel className="px-6 py-8">
          <p className="text-sm text-apg-silver">
            Select a resident from the queue to see their lifecycle — no tab hunting.
          </p>
        </OpsPanel>
      </OpsSection>
    );
  }

  const stage = deriveResidentLifecycle({
    tenancyStatus: resident.tenancyStatus,
    kycStatus: resident.kycStatus,
    hasBooking: Boolean(resident.bookingId),
    hasBed: Boolean(resident.bedId),
  });
  const activeIndex = lifecycleStageIndex(stage);

  return (
    <OpsSection id="timeline" title="Resident timeline">
      <header className="-mt-2 mb-4 flex flex-wrap items-start justify-between gap-2">
        <p className="text-sm text-apg-silver">
          <Link
            href={`/admin/residents/${resident.id}`}
            className="font-semibold text-white hover:text-[#FF5A1F]"
          >
            {resident.fullName}
          </Link>
          {resident.pgName ? ` · ${resident.pgName}` : ''}
          {resident.roomNumber ? ` · Room R${resident.roomNumber}` : ''}
          {resident.bedCode ? ` · ${resident.bedCode}` : ''}
        </p>
        <Link href={clearHref} className="text-xs text-apg-silver hover:text-white">
          Clear selection
        </Link>
      </header>

      <OpsPanel className="overflow-x-auto px-4 py-8 sm:px-6">
        <ol className="flex min-w-[720px] items-start">
          {LIFECYCLE_STAGES.map((s, index) => {
            const state = stageState(index, activeIndex, stage, s.id);
            const Icon = LIFECYCLE_ICONS[s.id];
            const dateLabel = stageDateLabel(s.id, resident);
            const isLast = index === LIFECYCLE_STAGES.length - 1;

            return (
              <li key={s.id} className="relative flex flex-1 flex-col items-center">
                {!isLast ? (
                  <div
                    className={
                      'absolute left-[calc(50%+20px)] top-5 h-0.5 w-[calc(100%-40px)] ' +
                      (state === 'done'
                        ? 'bg-emerald-500/60'
                        : index < activeIndex
                          ? 'bg-emerald-500/60'
                          : 'border-t border-dashed border-white/15 bg-transparent')
                    }
                    aria-hidden
                  />
                ) : null}

                <div
                  className={
                    'relative z-10 flex h-10 w-10 items-center justify-center rounded-full ' +
                    (state === 'current'
                      ? 'bg-[#FF5A1F] text-white shadow-[0_0_24px_rgba(255,90,31,0.45)] ring-2 ring-[#FF5A1F]/30'
                      : state === 'done'
                        ? 'bg-emerald-500/20 text-emerald-300 ring-1 ring-emerald-400/40'
                        : 'bg-white/5 text-apg-silver ring-1 ring-white/10')
                  }
                >
                  {state === 'done' ? (
                    <span className="text-sm font-bold">✓</span>
                  ) : (
                    <Icon width={18} height={18} />
                  )}
                </div>

                <p
                  className={
                    'mt-3 text-center text-xs font-semibold ' +
                    (state === 'current'
                      ? 'text-white'
                      : state === 'done'
                        ? 'text-emerald-200/90'
                        : 'text-apg-silver')
                  }
                >
                  {s.label}
                </p>

                {state === 'current' ? (
                  <span className="mt-1.5 rounded-full bg-[#FF5A1F]/20 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-orange-100">
                    Now
                  </span>
                ) : dateLabel ? (
                  <span className="mt-1.5 text-[10px] text-apg-silver">{dateLabel}</span>
                ) : (
                  <span className="mt-1.5 text-[10px] text-apg-silver/50">—</span>
                )}
              </li>
            );
          })}
        </ol>
      </OpsPanel>
    </OpsSection>
  );
}

function stageState(
  index: number,
  activeIndex: number,
  currentStage: ResidentLifecycleStage,
  stageId: ResidentLifecycleStage,
): 'done' | 'current' | 'upcoming' {
  if (stageId === currentStage) return 'current';
  if (index < activeIndex) return 'done';
  if (currentStage === 'completed' && stageId !== 'completed') return 'done';
  return 'upcoming';
}
