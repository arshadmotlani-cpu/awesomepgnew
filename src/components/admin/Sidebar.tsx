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
    <nav className="flex h-full w-64 shrink-0 flex-col border-r border-zinc-200 bg-white">
      <div className="flex items-center gap-2 px-5 py-5">
        <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-indigo-600 text-white">
          <IconLogo width={18} height={18} />
        </span>
        <div>
          <p className="text-sm font-semibold tracking-tight text-zinc-900">Awesome PG</p>
          <p className="text-[11px] text-zinc-500">Property console</p>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-3 pb-6">
        {NAV_SECTIONS.map((section) => (
          <div key={section.title} className="mt-4">
            <p className="px-3 pb-1.5 text-[10px] font-semibold uppercase tracking-wider text-zinc-400">
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
                          ? 'bg-indigo-50 font-medium text-indigo-700'
                          : 'text-zinc-700 hover:bg-zinc-50 hover:text-zinc-900')
                      }
                    >
                      <Icon
                        width={18}
                        height={18}
                        className={
                          'shrink-0 ' +
                          (active ? 'text-indigo-600' : 'text-zinc-400 group-hover:text-zinc-600')
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

      <div className="border-t border-zinc-100 px-5 py-3 text-[11px] text-zinc-400">
        Phase 1 · Inventory live
      </div>
    </nav>
  );
}
