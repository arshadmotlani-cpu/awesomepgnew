'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  EXPENSES_GENERAL_HREF,
  EXPENSES_SALARY_HREF,
} from '@/src/hair/lib/expenseRoutes';

const SECTIONS = [
  {
    id: 'general',
    label: 'General Expenses',
    href: EXPENSES_GENERAL_HREF,
    isActive: (pathname: string) => pathname === EXPENSES_GENERAL_HREF,
  },
  {
    id: 'salary',
    label: 'Salary',
    href: EXPENSES_SALARY_HREF,
    isActive: (pathname: string) => pathname.startsWith(EXPENSES_SALARY_HREF),
  },
];

export function ExpensesSectionSubNav() {
  const pathname = usePathname();

  return (
    <nav className="mb-6 flex flex-wrap gap-2" aria-label="Expenses sections">
      {SECTIONS.map((section) => {
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
