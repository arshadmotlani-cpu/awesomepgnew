'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  ATTENDANCE_MANAGE_HREF,
  ATTENDANCE_MAP_HREF,
} from '@/src/workforce/lib/attendanceRoutes';

const SECTIONS = [
  {
    id: 'manage',
    label: 'Attendance',
    href: ATTENDANCE_MANAGE_HREF,
    isActive: (pathname: string) =>
      pathname === ATTENDANCE_MANAGE_HREF || pathname.startsWith(`${ATTENDANCE_MANAGE_HREF}/`),
  },
  {
    id: 'map',
    label: 'Attendance Map',
    href: ATTENDANCE_MAP_HREF,
    isActive: (pathname: string) =>
      pathname === ATTENDANCE_MAP_HREF || pathname.startsWith(`${ATTENDANCE_MAP_HREF}/`),
  },
];

export function AttendanceSectionSubNav() {
  const pathname = usePathname();

  return (
    <nav className="mb-6 flex flex-wrap gap-2" aria-label="Attendance sections">
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
