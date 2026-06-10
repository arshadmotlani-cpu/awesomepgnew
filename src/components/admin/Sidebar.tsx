'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { IconLogo } from './icons';
import { NAV_SECTIONS } from './navItems';

function isActive(pathname: string, href: string) {
  if (href === '/admin') return pathname === '/admin';
  return pathname === href || pathname.startsWith(href + '/');
}

export function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname() ?? '/admin';

  return (
    <nav className="flex h-full w-64 shrink-0 flex-col border-r border-white/5 bg-[#1A1F27]/90 backdrop-blur-xl">
      <div className="flex items-center gap-2 px-5 py-5">
        <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-[#FF5A1F] text-white apg-glow-btn">
          <IconLogo width={18} height={18} />
        </span>
        <div>
          <p className="text-sm font-semibold tracking-tight text-white">Awesome PG</p>
          <p className="text-[11px] text-apg-silver">Admin console</p>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-3 pb-6">
        {NAV_SECTIONS.map((section) => (
          <div key={section.title} className="mt-4">
            <p className="px-3 pb-1.5 text-[10px] font-semibold uppercase tracking-wider text-apg-silver/70">
              {section.title}
            </p>
            <ul className="space-y-0.5">
              {section.items.map(({ href, label, icon: Icon }) => {
                const active = isActive(pathname, href);
                return (
                  <li key={href}>
                    <Link
                      href={href}
                      onClick={onNavigate}
                      aria-current={active ? 'page' : undefined}
                      className={
                        'group flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors ' +
                        (active
                          ? 'bg-[#FF5A1F]/15 font-medium text-[#FF5A1F]'
                          : 'text-apg-silver hover:bg-white/5 hover:text-white')
                      }
                    >
                      <Icon
                        width={18}
                        height={18}
                        className={
                          'shrink-0 ' +
                          (active ? 'text-[#FF5A1F]' : 'text-apg-silver/70 group-hover:text-white')
                        }
                      />
                      <span>{label}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>

      <div className="border-t border-white/5 px-5 py-3 text-[11px] text-apg-silver/60">
        SaaS admin · secured
      </div>
    </nav>
  );
}
