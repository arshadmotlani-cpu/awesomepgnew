'use client';

import { ApgCard } from '@/src/components/customer/design-system';
import type { ResidentMoveOutActionItem } from '@/src/lib/residents/residentMoveOutResidentActions';

export function ResidentMoveOutActionsCard({ items }: { items: ResidentMoveOutActionItem[] }) {
  return (
    <ApgCard tier="resident">
      <h2 className="text-sm font-semibold text-white">Before you leave</h2>
      <ul className="mt-4 space-y-3">
        {items.map((item) => (
          <li key={item.id} className="flex items-start gap-3 text-sm">
            <span
              className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${
                item.done
                  ? 'bg-emerald-500/20 text-emerald-300 ring-1 ring-emerald-400/40'
                  : 'bg-white/5 text-apg-silver ring-1 ring-white/15'
              }`}
            >
              {item.done ? '✓' : '○'}
            </span>
            <span className={item.done ? 'text-white' : 'text-apg-silver'}>{item.label}</span>
          </li>
        ))}
      </ul>
    </ApgCard>
  );
}
