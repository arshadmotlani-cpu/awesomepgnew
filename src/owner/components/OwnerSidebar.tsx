import Link from 'next/link';
import { OWNER_OS } from '@/src/lib/brand/ownerOsMetadata';
import { ownerNavGroups } from '@/src/owner/lib/ownerNav';

function isNavActive(activePath: string | undefined, href: string): boolean {
  if (!activePath) return false;
  if (href === '/dashboard') return activePath === '/dashboard';
  return activePath === href || activePath.startsWith(`${href}/`);
}

export function OwnerSidebar({ activePath }: { activePath?: string }) {
  return (
    <aside className="hidden w-56 shrink-0 border-r border-white/10 bg-[#0f141b] p-4 md:block">
      <div className="mb-6">
        <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-[#FF5A1F]">
          Owner OS
        </p>
        <p className="text-sm font-semibold text-white">{OWNER_OS.name}</p>
      </div>
      <nav className="space-y-4">
        {ownerNavGroups.map((group) => (
          <div key={group.id}>
            <p className="oo-nav-group-title px-2 pb-1">{group.title}</p>
            <div className="space-y-0.5">
              {group.items.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="oo-nav-link flex items-center gap-2 px-3"
                  data-active={isNavActive(activePath, item.href) ? 'true' : 'false'}
                >
                  <item.icon className="h-4 w-4 shrink-0 opacity-75" aria-hidden />
                  {item.label}
                </Link>
              ))}
            </div>
          </div>
        ))}
      </nav>
    </aside>
  );
}
