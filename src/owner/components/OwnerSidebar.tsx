import Link from 'next/link';
import { OWNER_OS } from '@/src/lib/brand/ownerOsMetadata';
import { ownerNavItems } from '@/src/owner/lib/ownerNav';

export function OwnerSidebar({ activePath }: { activePath?: string }) {
  return (
    <aside className="hidden w-56 shrink-0 border-r border-white/10 bg-[#0f141b] p-4 md:block">
      <div className="mb-6">
        <p className="text-xs uppercase tracking-wide text-[#FF5A1F]">Owner OS</p>
        <p className="text-sm font-semibold text-white">{OWNER_OS.name}</p>
      </div>
      <nav className="space-y-1">
        {ownerNavItems.map((item) => (
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
