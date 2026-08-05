'use client';

import type { OwnerTaskItem } from '@/src/owner/lib/tasks/ownerTasksComposer';

const PRIORITY_LABEL: Record<OwnerTaskItem['priority'], string> = {
  critical: 'Critical',
  high: 'High',
  medium: 'Medium',
  low: 'Low',
};

export function OwnerTasksPanel({ tasks }: { tasks: OwnerTaskItem[] }) {
  return (
    <section className="rounded-xl border border-white/10 bg-[color:var(--oo-surface,#1A1F27)] p-4">
      <h2 className="text-sm font-semibold text-white">Owner Tasks</h2>
      {tasks.length === 0 ? (
        <p className="mt-2 text-sm text-[color:var(--oo-muted,#9CA3AF)]">No open attention items.</p>
      ) : (
        <ul className="mt-3 space-y-2">
          {tasks.map((t) => (
            <li key={t.id} className="rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <a href={t.href} className="font-medium text-white hover:text-[#FF5A1F]">
                  {t.title}
                </a>
                <span className="rounded bg-white/10 px-1.5 py-0.5 text-[10px] uppercase text-[color:var(--oo-muted,#9CA3AF)]">
                  {PRIORITY_LABEL[t.priority]}
                </span>
                <span className="text-[10px] uppercase text-[color:var(--oo-muted,#9CA3AF)]">
                  {t.source.replace('_', ' ')}
                </span>
              </div>
              <p className="mt-1 text-xs text-[color:var(--oo-muted,#9CA3AF)]">{t.reason}</p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
