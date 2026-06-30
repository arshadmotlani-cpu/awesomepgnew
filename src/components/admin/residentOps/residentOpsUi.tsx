import type { ReactNode, SVGProps } from 'react';
import {
  IconAlertTriangle,
  IconBed,
  IconBell,
  IconCard,
  IconClipboard,
  IconDocument,
  IconDoor,
  IconUsers,
} from '@/src/components/admin/icons';
import type { AttentionBucketId } from '@/src/lib/residents/residentOperationsDashboard';
import type { ResidentLifecycleStage } from '@/src/lib/residents/residentOperationsDashboard';

export const OPS_ORANGE = '#FF5A1F';
export const OPS_PANEL = '#1A1F27';

type IconProps = SVGProps<SVGSVGElement>;

const svgBase = (props: IconProps) => ({
  width: 18,
  height: 18,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.75,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  ...props,
});

export const IconCalendar = (props: IconProps) => (
  <svg {...svgBase(props)}>
    <rect x="3" y="4" width="18" height="18" rx="2" />
    <path d="M16 2v4M8 2v4M3 10h18" />
  </svg>
);

export const IconKey = (props: IconProps) => (
  <svg {...svgBase(props)}>
    <path d="m15.5 7.5 2.3 2.3a3 3 0 0 1 0 4.24l-3.54 3.54a3 3 0 0 1-4.24 0l-.88-.88" />
    <path d="m9 15-5 5" />
    <path d="M14.5 7.5 18 4" />
  </svg>
);

export const IconFlag = (props: IconProps) => (
  <svg {...svgBase(props)}>
    <path d="M4 22V4a1 1 0 0 1 1-1h13l-3 4 3 4H5a1 1 0 0 1-1-1" />
  </svg>
);

export const IconUserCheck = (props: IconProps) => (
  <svg {...svgBase(props)}>
    <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
    <circle cx="9" cy="7" r="4" />
    <path d="m16 11 2 2 4-4" />
  </svg>
);

export const IconChevronRight = (props: IconProps) => (
  <svg {...svgBase({ ...props, width: 14, height: 14 })}>
    <path d="m9 6 6 6-6 6" />
  </svg>
);

export const BUCKET_ICONS: Record<AttentionBucketId, (props: IconProps) => ReactNode> = {
  rent_overdue: IconAlertTriangle,
  rent_due: IconCard,
  electricity_due: IconBell,
  payment_proof: IconDocument,
  kyc_pending: IconClipboard,
  bed_unassigned: IconBed,
  move_out: IconDoor,
  deposit_refund: IconCard,
  requests_pending: IconBell,
};

export const TODAY_WORK_ICONS: Record<string, (props: IconProps) => ReactNode> = {
  'move-in': IconUsers,
  'move-out': IconDoor,
  'deposit-refund': IconDocument,
  'rent-due': IconCard,
};

export const LIFECYCLE_ICONS: Record<ResidentLifecycleStage, (props: IconProps) => ReactNode> = {
  lead: IconUsers,
  applied: IconCalendar,
  verified: IconUserCheck,
  assigned: IconKey,
  moved_in: IconDoor,
  vacating: IconDoor,
  completed: IconFlag,
};

export function residentInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return `${parts[0]![0] ?? ''}${parts[parts.length - 1]![0] ?? ''}`.toUpperCase();
  }
  return name.slice(0, 2).toUpperCase();
}

export function OpsSection({
  id,
  title,
  description,
  children,
  className = '',
}: {
  id?: string;
  title: string;
  description?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section id={id} className={`mb-10 ${className}`}>
      <header className="mb-5">
        <h2 className="text-xl font-bold tracking-tight text-white">{title}</h2>
        {description ? <p className="mt-1.5 text-sm text-apg-silver">{description}</p> : null}
      </header>
      {children}
    </section>
  );
}

export function OpsPanel({
  children,
  className = '',
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`rounded-2xl border border-white/10 bg-[#1A1F27] shadow-[0_8px_32px_rgba(0,0,0,0.35)] ${className}`}
    >
      {children}
    </div>
  );
}

export function ResidentAvatar({ name }: { name: string }) {
  return (
    <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/10 text-xs font-semibold text-white ring-1 ring-white/10">
      {residentInitials(name)}
    </span>
  );
}
