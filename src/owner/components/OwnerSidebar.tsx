import Link from 'next/link';
import { OWNER_OS } from '@/src/lib/brand/ownerOsMetadata';

const NAV = [
  { href: '/dashboard', label: 'Dashboard' },
  { href: '/net-worth', label: 'Net Worth' },
  { href: '/cashflow', label: 'Cashflow' },
  { href: '/assets', label: 'Assets' },
  { href: '/liabilities', label: 'Liabilities' },
  { href: '/investments', label: 'Investments' },
  { href: '/wealth', label: 'Wealth' },
  { href: '/settings', label: 'Settings' },
] as const;

export function OwnerSidebar({ activePath }: { activePath?: string }) {
  return (
    <aside className="hidden w-56 shrink-0 border-r border-white/10 bg-[#0f141b] p-4 md:block">
      <div className="mb-6">
        <p className="text-xs uppercase tracking-wide text-[#FF5A1F]">Owner OS</p>
        <p className="text-sm font-semibold text-white">{OWNER_OS.name}</p>
      </div>
      <nav className="space-y-1">
        {NAV.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="oo-nav-link"
            data-active={activePath === item.href ? 'true' : 'false'}
          >
            {item.label}
          </Link>
        ))}
      </nav>
    </aside>
  );
}
