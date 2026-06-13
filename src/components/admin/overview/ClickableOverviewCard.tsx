import Link from 'next/link';
import type { ReactNode } from 'react';
import { OverviewStatCard } from '@/src/components/admin/OverviewStatCard';

type Accent = 'indigo' | 'emerald' | 'amber' | 'rose' | 'zinc' | 'sky' | 'violet' | 'orange';

export function ClickableOverviewCard({
  href,
  label,
  value,
  hint,
  icon,
  accent = 'indigo',
  large,
}: {
  href: string;
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  icon?: ReactNode;
  accent?: Accent;
  large?: boolean;
}) {
  return (
    <Link
      href={href}
      className={
        'group block rounded-xl transition ' +
        (large
          ? 'border border-[#FF5A1F]/20 bg-gradient-to-br from-[#1A1F27] to-[#141820] p-5 hover:border-[#FF5A1F]/50 hover:shadow-lg hover:shadow-[#FF5A1F]/5'
          : 'hover:opacity-95')
      }
    >
      <OverviewStatCard label={label} value={value} hint={hint} icon={icon} accent={accent} />
      <p className="mt-2 text-[10px] font-medium uppercase tracking-wider text-[#FF5A1F]/0 transition group-hover:text-[#FF5A1F]/90">
        Open module →
      </p>
    </Link>
  );
}
