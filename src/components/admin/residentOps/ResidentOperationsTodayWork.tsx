import Link from 'next/link';
import type { TodayWorkItem } from '@/src/lib/residents/residentOperationsDashboard';
import {
  OpsPanel,
  OpsSection,
  TODAY_WORK_ICONS,
} from '@/src/components/admin/residentOps/residentOpsUi';

export function ResidentOperationsTodayWork({ items }: { items: TodayWorkItem[] }) {
  if (items.length === 0) {
    return (
      <OpsSection title="Today&apos;s work">
        <OpsPanel className="px-5 py-5">
          <p className="text-sm text-apg-silver">No scheduled move-ins, move-outs, or due bills today.</p>
        </OpsPanel>
      </OpsSection>
    );
  }

  return (
    <OpsSection
      title="Today's work"
      description="Your manager task list for today."
    >
      <OpsPanel className="divide-y divide-white/5">
        {items.map((item) => {
          const Icon = TODAY_WORK_ICONS[item.id] ?? TODAY_WORK_ICONS['move-in']!;
          return (
            <Link
              key={item.id}
              href={item.href}
              className="group flex items-center gap-4 px-5 py-4 transition hover:bg-white/[0.03]"
            >
              <span
                className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#FF5A1F]/12 text-[#FF5A1F] transition group-hover:bg-[#FF5A1F]/20"
                aria-hidden
              >
                <Icon width={20} height={20} />
              </span>
              <span className="flex-1 text-sm font-medium text-white">{item.label}</span>
              <span className="text-sm font-semibold text-[#FF5A1F] transition group-hover:translate-x-0.5">
                Go →
              </span>
            </Link>
          );
        })}
      </OpsPanel>
    </OpsSection>
  );
}
