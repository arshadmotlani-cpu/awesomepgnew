export const ROLE_DESCRIPTIONS: Record<string, string> = {
  owner: 'Full organization access',
  co_owner: 'Full organization access except platform administration',
  manager: 'Manage staff/team and operational areas according to permissions',
  biller: 'Billing, appointments, and payment operations only',
  staff: 'Own appointments, services, performance and permitted operational information',
};

export function RoleBadge({ role }: { role: string }) {
  const label = role.replace('_', ' ');
  return (
    <span className="inline-flex items-center rounded px-2 py-0.5 text-[11px] font-medium bg-white/8 text-[var(--plt-text-muted)] capitalize">
      {label}
    </span>
  );
}

export function RoleDescription({ role }: { role: string }) {
  const description = ROLE_DESCRIPTIONS[role];
  if (!description) return null;
  return <p className="text-xs text-[var(--plt-text-subtle)] mt-0.5">{description}</p>;
}
