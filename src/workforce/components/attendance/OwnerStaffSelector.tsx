'use client';

type StaffOption = { id: string; fullName: string };

type Props = {
  roster: StaffOption[];
  selectedId?: string;
  name?: string;
  allowAll?: boolean;
  className?: string;
};

export function OwnerStaffSelector({ roster, selectedId, name = 'employeeId', allowAll, className }: Props) {
  return (
    <div className={className}>
      <label className="block text-xs font-medium uppercase tracking-wide text-fyh-text-secondary">
        Staff
      </label>
      <select
        name={name}
        defaultValue={allowAll ? selectedId ?? '' : selectedId}
        className="mt-1 w-full min-w-[220px] rounded-lg border border-[color:var(--fyh-border)] bg-[color:var(--fyh-surface)] px-3 py-2 text-sm"
      >
        {allowAll ? <option value="">All Staff</option> : null}
        {roster.map((r) => (
          <option key={r.id} value={r.id}>
            {r.fullName}
          </option>
        ))}
      </select>
    </div>
  );
}
