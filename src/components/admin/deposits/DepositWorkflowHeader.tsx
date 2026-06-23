import Link from 'next/link';
import {
  DEPOSIT_WORKFLOW_STAGES,
  stageIndex,
  type DepositWorkflowPresentation,
} from '@/src/lib/deposits/depositWorkflowPresentation';

const PRIMARY =
  'inline-flex items-center justify-center rounded-lg bg-[#FF5A1F] px-5 py-2.5 text-sm font-semibold text-white hover:brightness-110';

export function DepositWorkflowHeader({
  workflow,
}: {
  workflow: DepositWorkflowPresentation;
}) {
  const activeIndex = stageIndex(workflow.currentStageId);

  return (
    <section className="mb-6 rounded-2xl border border-white/10 bg-[#1A1F27] p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-apg-silver">
            Deposit workflow
          </p>
          <p className="mt-1 text-lg font-semibold text-white">{workflow.currentStageLabel}</p>
          <p className="mt-1 text-sm text-apg-silver">{workflow.nextAction}</p>
        </div>
        {workflow.primaryAction ? (
          workflow.primaryAction.href.startsWith('#') ? (
            <a href={workflow.primaryAction.href} className={PRIMARY}>
              {workflow.primaryAction.label}
            </a>
          ) : (
            <Link href={workflow.primaryAction.href} className={PRIMARY}>
              {workflow.primaryAction.label}
            </Link>
          )
        ) : null}
      </div>

      <ol className="mt-5 flex flex-wrap gap-2">
        {DEPOSIT_WORKFLOW_STAGES.map((stage, index) => {
          const done = index < activeIndex;
          const current = index === activeIndex;
          return (
            <li
              key={stage.id}
              className={
                'rounded-full px-3 py-1 text-xs font-medium ' +
                (current
                  ? 'bg-[#FF5A1F] text-white'
                  : done
                    ? 'bg-emerald-500/15 text-emerald-200'
                    : 'bg-white/5 text-apg-silver')
              }
            >
              {stage.label}
            </li>
          );
        })}
      </ol>

      {workflow.blockedBySync ? (
        <p className="mt-3 text-xs text-amber-200">
          Primary collection and refund actions are blocked until wallet sync is resolved.
        </p>
      ) : null}
    </section>
  );
}
