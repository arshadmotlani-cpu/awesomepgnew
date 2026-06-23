import Link from 'next/link';
import type { Resident360Workflow } from '@/src/lib/residents/resident360Workflow';

const PRIMARY =
  'inline-flex items-center justify-center rounded-lg bg-[#FF5A1F] px-5 py-2.5 text-sm font-semibold text-white hover:brightness-110';

export function Resident360WorkflowBar({ workflow }: { workflow: Resident360Workflow }) {
  return (
    <section className="mb-6 rounded-2xl border border-[#FF5A1F]/30 bg-[#FF5A1F]/10 p-5">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-orange-200/90">
        Current stage
      </p>
      <p className="mt-1 text-lg font-semibold text-white">{workflow.stateLine}</p>
      <p className="mt-1 text-sm text-apg-silver">{workflow.nextAction}</p>
      {workflow.primaryAction ? (
        <div className="mt-4">
          {workflow.primaryAction.href.startsWith('#') ? (
            <a href={workflow.primaryAction.href} className={PRIMARY}>
              {workflow.primaryAction.label}
            </a>
          ) : (
            <Link href={workflow.primaryAction.href} className={PRIMARY}>
              {workflow.primaryAction.label}
            </Link>
          )}
        </div>
      ) : null}
    </section>
  );
}
