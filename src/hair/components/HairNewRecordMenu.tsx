'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ChevronDown } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Button } from '@/src/hair/components/ui/button';

/** Create new catalog / CRM records — not operational POS flows (see HairQuickActionsMenu). */
const CREATE_LINKS = [
  { href: '/appointments', label: 'New appointment' },
  { href: '/customers/new', label: 'New customer' },
  { href: '/services/new', label: 'New service' },
  { href: '/products/new', label: 'New product' },
  { href: '/loyalty', label: 'New package' },
  { href: '/loyalty', label: 'New membership' },
  { href: '/staff', label: 'New staff' },
] as const;

export function HairNewRecordMenu() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  return (
    <div className="relative">
      <Button type="button" size="sm" onClick={() => setOpen((v) => !v)} className="gap-1">
        + New
        <ChevronDown className="h-4 w-4 opacity-70" />
      </Button>
      {open ? (
        <>
          <button
            type="button"
            className="fixed inset-0 z-40 cursor-default"
            aria-label="Close menu"
            onClick={() => setOpen(false)}
          />
          <div className="absolute right-0 top-full z-50 mt-2 min-w-[12rem] overflow-hidden rounded-xl border border-[color:var(--fyh-border)] bg-[color:var(--fyh-surface)] py-1 shadow-xl">
            {CREATE_LINKS.map((item) => (
              <Link
                key={`${item.href}-${item.label}`}
                href={item.href}
                className="block px-4 py-2.5 text-sm text-fyh-text-secondary hover:bg-white/5 hover:text-fyh-text"
                onClick={() => setOpen(false)}
              >
                {item.label}
              </Link>
            ))}
          </div>
        </>
      ) : null}
    </div>
  );
}
