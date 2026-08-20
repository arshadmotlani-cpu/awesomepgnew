'use client';

import Link from 'next/link';
import { X } from 'lucide-react';
import { isPlatformNavActive, platformNavGroups } from '@/src/platform/lib/platformNav';

type Props = {
  activePath: string;
  open: boolean;
  onClose: () => void;
};

export function PlatformSidebar({ activePath, open, onClose }: Props) {
  return (
    <>
      {open ? (
        <button
          type="button"
          className="fixed inset-0 z-40 bg-black/50 lg:hidden"
          aria-label="Close navigation"
          onClick={onClose}
        />
      ) : null}
      <aside
        className={[
          'fixed inset-y-0 left-0 z-50 flex w-[var(--plt-sidebar-width)] flex-col border-r border-[var(--plt-border)] bg-[var(--plt-bg-elevated)] transition-transform lg:static lg:translate-x-0',
          open ? 'translate-x-0' : '-translate-x-full',
        ].join(' ')}
      >
        <div className="flex h-[var(--plt-header-height)] items-center justify-between border-b border-[var(--plt-border)] px-4 lg:px-3">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--plt-accent)]">
              FYHAIR SaaS
            </p>
            <p className="text-sm font-semibold text-[var(--plt-text)]">Platform Admin</p>
          </div>
          <button
            type="button"
            className="rounded-md p-1 text-[var(--plt-text-muted)] hover:bg-white/5 lg:hidden"
            onClick={onClose}
            aria-label="Close menu"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <nav className="flex-1 overflow-y-auto p-3 space-y-5">
          {platformNavGroups.map((group) => (
            <div key={group.id}>
              <p className="plt-nav-group-title">{group.title}</p>
              <div className="mt-1 space-y-0.5">
                {group.items.map((item) => {
                  const active = isPlatformNavActive(
                    activePath,
                    item.href,
                    item.matchPrefix ?? true,
                  );
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      className="plt-nav-link"
                      data-active={active ? 'true' : 'false'}
                      onClick={onClose}
                    >
                      <item.icon className="h-4 w-4 shrink-0 opacity-80" aria-hidden />
                      {item.label}
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>
        <div className="border-t border-[var(--plt-border)] p-3">
          <Link
            href="/platform/dashboard"
            className="plt-nav-link text-xs"
            onClick={onClose}
          >
            User dashboard
          </Link>
        </div>
      </aside>
    </>
  );
}
