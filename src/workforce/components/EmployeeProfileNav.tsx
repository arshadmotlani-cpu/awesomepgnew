'use client';

import { cn } from '@/src/hair/lib/utils';

export const EMPLOYEE_PROFILE_SECTIONS = [
  { id: 'staff-details', label: 'Staff Details' },
  { id: 'credentials', label: 'Credentials' },
  { id: 'salary', label: 'Salary & Incentives' },
  { id: 'rights', label: 'Additional Rights' },
  { id: 'schedule', label: 'Shift Schedule' },
] as const;

export type EmployeeProfileSectionId = (typeof EMPLOYEE_PROFILE_SECTIONS)[number]['id'];

export function EmployeeProfileNav({
  active,
  onChange,
}: {
  active: EmployeeProfileSectionId;
  onChange: (id: EmployeeProfileSectionId) => void;
}) {
  return (
    <nav
      className="flex flex-wrap gap-1 border-b border-[color:var(--fyh-border)] pb-2"
      aria-label="Employee profile sections"
    >
      {EMPLOYEE_PROFILE_SECTIONS.map((section) => {
        const isActive = active === section.id;
        return (
          <button
            key={section.id}
            type="button"
            onClick={() => onChange(section.id)}
            aria-current={isActive ? 'page' : undefined}
            className={cn(
              'rounded-xl px-3 py-2 text-sm font-medium transition',
              isActive
                ? 'bg-[color:var(--fyh-nav-active-bg)] font-semibold text-fyh-text shadow-[inset_2px_0_0_var(--fyh-accent)]'
                : 'text-fyh-text-secondary hover:bg-white/6 hover:text-fyh-text',
            )}
          >
            {section.label}
          </button>
        );
      })}
    </nav>
  );
}
