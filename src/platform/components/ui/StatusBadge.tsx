const ORG_STATUS_STYLES: Record<string, string> = {
  active: 'bg-emerald-500/15 text-emerald-400',
  trial: 'bg-sky-500/15 text-sky-400',
  suspended: 'bg-red-500/15 text-red-400',
};

const SUB_STATUS_STYLES: Record<string, string> = {
  trial: 'bg-sky-500/15 text-sky-400',
  complimentary: 'bg-violet-500/15 text-violet-400',
  active: 'bg-emerald-500/15 text-emerald-400',
  past_due: 'bg-amber-500/15 text-amber-400',
  suspended: 'bg-red-500/15 text-red-400',
  cancelled: 'bg-slate-500/15 text-slate-400',
};

const INVITE_STATUS_STYLES: Record<string, string> = {
  pending: 'bg-sky-500/15 text-sky-400',
  accepted: 'bg-emerald-500/15 text-emerald-400',
  revoked: 'bg-slate-500/15 text-slate-400',
  expired: 'bg-amber-500/15 text-amber-400',
};

const USER_STATUS_STYLES: Record<string, string> = {
  active: 'bg-emerald-500/15 text-emerald-400',
  suspended: 'bg-red-500/15 text-red-400',
  invited: 'bg-sky-500/15 text-sky-400',
};

function badgeClass(status: string, map: Record<string, string>): string {
  const base = 'inline-flex items-center rounded px-2 py-0.5 text-[11px] font-medium capitalize';
  return `${base} ${map[status] ?? 'bg-slate-500/15 text-slate-400'}`;
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
    <span className="inline-flex items-center rounded px-2 py-0.5 text-[11px] font-medium bg-violet-500/15 text-violet-400">
      Platform admin
    </span>
  );
}
