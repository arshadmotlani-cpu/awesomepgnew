import Link from 'next/link';
import type { ActionItemRow } from '@/src/services/actionItems';

export function PendingActionItemsOverview({
  items,
}: {
  items: Array<ActionItemRow & { ageDays: number }>;
}) {
  if (items.length === 0) return null;

  return (
    <section className="rounded-xl border border-white/10 bg-[#1A1F27] p-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-white">Oldest pending actions</h2>
        <Link href="/admin/operations" className="text-xs font-medium text-indigo-300 hover:text-indigo-200">
          View all
        </Link>
      </div>
      <ul className="mt-3 space-y-2">
        {items.map((item) => (
          <li
            key={item.id}
            className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-white/5 bg-black/20 px-3 py-2"
          >
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-white">{item.title}</p>
              <p className="text-[10px] text-apg-silver">
                {item.pgName}
                {item.roomNumber ? ` · R${item.roomNumber}` : ''}
                {item.bedCode ? ` · ${item.bedCode}` : ''}
              </p>
            </div>
            <span className="shrink-0 rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-medium text-amber-200">
              {item.ageDays === 0 ? 'Today' : `${item.ageDays}d old`}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
