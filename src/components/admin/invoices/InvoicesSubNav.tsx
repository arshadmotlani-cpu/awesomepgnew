'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const SECTIONS = [
  { id: 'main', label: 'Main Invoices', href: '/admin/invoices' },
  { id: 'rent-payment-map', label: 'Rent Payment Map', href: '/admin/invoices/rent-payment-map' },
] as const;

export function InvoicesSubNav() {
  const pathname = usePathname();

  return (
    <nav className="mb-6 flex flex-wrap gap-2" aria-label="Invoices sections">
      {SECTIONS.map((section) => {
        const active =
          section.href === '/admin/invoices'
            ? pathname === '/admin/invoices'
            : pathname.startsWith(section.href);
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
