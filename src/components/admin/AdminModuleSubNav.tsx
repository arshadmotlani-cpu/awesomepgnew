'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

export type AdminModuleSubNavSection = {
  id: string;
  label: string;
  href: string;
  isActive?: (pathname: string) => boolean;
};

function sectionActive(pathname: string, section: AdminModuleSubNavSection): boolean {
  if (section.isActive) return section.isActive(pathname);
  return pathname === section.href || pathname.startsWith(`${section.href}/`);
}

export function AdminModuleSubNav({
  sections,
  ariaLabel,
}: {
  sections: AdminModuleSubNavSection[];
  ariaLabel: string;
}) {
  const pathname = usePathname();

  return (
    <nav className="mb-6 flex flex-wrap gap-2" aria-label={ariaLabel}>
      {sections.map((section) => {
        const active = sectionActive(pathname, section);
        return (
          <Link
            key={section.id}
            href={section.href}
            className={`rounded-full px-3 py-1.5 text-sm font-medium transition ${
              active
                ? 'bg-[#FF5A1F] text-white'
                : 'border border-white/10 bg-[#1A1F27] text-apg-silver hover:text-white'
            }`}
          >
            {section.label}
          </Link>
        );
      })}
    </nav>
  );
}
