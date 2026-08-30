const ORG_STATUS_STYLES: Record<string, string> = {
  active: 'bg-emerald-100 text-emerald-700',
  trial: 'bg-sky-100 text-sky-700',
  suspended: 'bg-red-100 text-red-700',
};

const SUB_STATUS_STYLES: Record<string, string> = {
  trial: 'bg-sky-100 text-sky-700',
  complimentary: 'bg-violet-100 text-violet-700',
  active: 'bg-emerald-100 text-emerald-700',
  past_due: 'bg-amber-100 text-amber-700',
  suspended: 'bg-red-100 text-red-700',
  cancelled: 'bg-slate-100 text-slate-600',
};

const INVITE_STATUS_STYLES: Record<string, string> = {
  pending: 'bg-sky-100 text-sky-700',
  accepted: 'bg-emerald-100 text-emerald-700',
  revoked: 'bg-slate-100 text-slate-600',
  expired: 'bg-amber-100 text-amber-700',
};

const USER_STATUS_STYLES: Record<string, string> = {
  active: 'bg-emerald-100 text-emerald-700',
  suspended: 'bg-red-100 text-red-700',
  invited: 'bg-sky-100 text-sky-700',
};

function badgeClass(status: string, map: Record<string, string>): string {
  const base = 'inline-flex items-center rounded px-2 py-0.5 text-[11px] font-medium capitalize';
  return `${base} ${map[status] ?? 'bg-slate-100 text-slate-600'}`;
}

export function OrgStatusBadge({ status }: { status: string }) {
  return <span className={badgeClass(status, ORG_STATUS_STYLES)}>{status.replace('_', ' ')}</span>;
}

export function SubscriptionStatusBadge({ status }: { status: string }) {
  return <span className={badgeClass(status, SUB_STATUS_STYLES)}>{status.replace('_', ' ')}</span>;
}

export function InvitationStatusBadge({ status }: { status: string }) {
  return <span className={badgeClass(status, INVITE_STATUS_STYLES)}>{status}</span>;
}

export function UserStatusBadge({ status }: { status: string }) {
  return <span className={badgeClass(status, USER_STATUS_STYLES)}>{status}</span>;
}

export function PlatformAdminBadge() {
  return (
    <span className="inline-flex items-center rounded px-2 py-0.5 text-[11px] font-medium bg-violet-100 text-violet-700">
      Platform admin
    </span>
  );
}
