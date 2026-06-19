import Link from 'next/link';
import type { TodayWorkItem } from '@/src/lib/residents/residentOperationsDashboard';

export function ResidentOperationsTodayWork({ items }: { items: TodayWorkItem[] }) {
  if (items.length === 0) {
    return (
      <section className="mb-8 rounded-xl border border-white/10 bg-[#1A1F27] px-5 py-4">
        <h2 className="text-sm font-semibold text-white">Today&apos;s work</h2>
        <p className="mt-2 text-sm text-apg-silver">No scheduled move-ins, move-outs, or due bills today.</p>
      </section>
    );
  }

  return (
    <section className="mb-8">
      <header className="mb-4">
        <h2 className="text-lg font-bold text-white">Today&apos;s work</h2>
        <p className="mt-1 text-sm text-apg-silver">Your manager task list for today.</p>
      </header>
      <ul className="space-y-2">
        {items.map((item) => (
          <li key={item.id}>
            <Link
              href={item.href}
              className="flex items-center justify-between rounded-xl border border-white/10 bg-[#1A1F27] px-4 py-3 transition hover:border-[#FF5A1F]/40 hover:bg-white/[0.03]"
            >
              <span className="text-sm font-medium text-white">{item.label}</span>
              <span className="text-xs font-semibold text-[#FF5A1F]">Go →</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
