'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  EXPENSES_GENERAL_HREF,
  EXPENSES_SALARY_HREF,
} from '@/src/hair/lib/expenseRoutes';

export function ExpensesSectionSubNav({
  showGeneral = true,
  showSalary = true,
}: {
  showGeneral?: boolean;
  showSalary?: boolean;
}) {
  const pathname = usePathname();
  if (!showGeneral && !showSalary) return null;

  const sections = [
    showGeneral
      ? {
          id: 'general',
          label: 'General Expenses',
          href: EXPENSES_GENERAL_HREF,
          isActive: (p: string) => p === EXPENSES_GENERAL_HREF,
        }
      : null,
    showSalary
      ? {
          id: 'salary',
          label: 'Salary',
          href: EXPENSES_SALARY_HREF,
          isActive: (p: string) => p.startsWith(EXPENSES_SALARY_HREF),
        }
      : null,
  ].filter(Boolean) as Array<{
    id: string;
    label: string;
    href: string;
    isActive: (p: string) => boolean;
  }>;

  return (
    <nav className="mb-6 flex flex-wrap gap-2" aria-label="Expenses sections">
      {sections.map((section) => {
        const active = section.isActive(pathname);
        return (
          <Link
            key={section.id}
            href={section.href}
            className={`rounded-full px-3 py-1.5 text-sm font-medium transition ${
              active
                ? 'bg-fyh-accent text-black'
                : 'border border-[color:var(--fyh-border)] bg-[color:var(--fyh-surface)] text-fyh-text-secondary hover:text-fyh-text-primary'
            }`}
          >
            {section.label}
          </Link>
        );
      })}
    </nav>
  );
}
