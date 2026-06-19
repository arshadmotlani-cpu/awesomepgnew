import Link from 'next/link';
import {
  LIFECYCLE_STAGES,
  deriveResidentLifecycle,
  lifecycleStageIndex,
  type ResidentLifecycleStage,
} from '@/src/lib/residents/residentOperationsDashboard';
import type { ResidentListRow } from '@/src/services/residentAdmin';

export function ResidentOperationsTimeline({
  resident,
  clearHref,
}: {
  resident: ResidentListRow | null;
  clearHref: string;
}) {
  if (!resident) {
    return (
      <section id="timeline" className="mb-8 rounded-xl border border-white/10 bg-[#1A1F27] px-5 py-6">
        <h2 className="text-sm font-semibold text-white">Resident timeline</h2>
        <p className="mt-2 text-sm text-apg-silver">
          Select a resident from the queue to see their lifecycle — no tab hunting.
        </p>
      </section>
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
    <section className="mb-8" id="timeline">
      <header className="mb-4 flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="text-lg font-bold text-white">Resident timeline</h2>
          <p className="mt-1 text-sm text-apg-silver">
            <Link
              href={`/admin/residents/${resident.id}`}
              className="font-medium text-white hover:text-[#FF5A1F]"
            >
              {resident.fullName}
            </Link>
            {resident.pgName ? ` · ${resident.pgName}` : ''}
            {resident.roomNumber ? ` · R${resident.roomNumber}` : ''}
            {resident.bedCode ? ` · ${resident.bedCode}` : ''}
          </p>
        </div>
        <Link href={clearHref} className="text-xs text-apg-silver hover:text-white">
          Clear selection
        </Link>
      </header>

      <div className="overflow-x-auto rounded-xl border border-white/10 bg-[#1A1F27] px-4 py-6">
        <ol className="flex min-w-[640px] items-start justify-between gap-1">
          {LIFECYCLE_STAGES.map((s, index) => {
            const state = stageState(index, activeIndex, stage, s.id);
            return (
              <li key={s.id} className="relative flex flex-1 flex-col items-center text-center">
                <div
                  className={
                    'flex h-9 w-9 items-center justify-center rounded-full text-xs font-bold ' +
                    (state === 'current'
                      ? 'bg-[#FF5A1F] text-white ring-2 ring-[#FF5A1F]/40'
                      : state === 'done'
                        ? 'bg-emerald-500/20 text-emerald-200 ring-1 ring-emerald-400/40'
                        : 'bg-white/5 text-apg-silver ring-1 ring-white/10')
                  }
                >
                  {state === 'done' ? '✓' : index + 1}
                </div>
                <p
                  className={
                    'mt-2 text-[11px] font-medium ' +
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
                  <span className="mt-1 rounded-full bg-[#FF5A1F]/20 px-2 py-0.5 text-[10px] font-semibold text-orange-100">
                    Now
                  </span>
                ) : null}
              </li>
            );
          })}
        </ol>
      </div>
    </section>
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
