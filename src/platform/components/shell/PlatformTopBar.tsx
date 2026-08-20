'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { FormEvent, useState } from 'react';
import { Bell, Menu, Search } from 'lucide-react';
import { platformLogoutAction } from '@/src/platform/actions/auth';

type Props = {
  adminEmail: string;
  onMenuClick: () => void;
};

export function PlatformTopBar({ adminEmail, onMenuClick }: Props) {
  const router = useRouter();
  const [query, setQuery] = useState('');

  function onSearch(e: FormEvent) {
    e.preventDefault();
    const q = query.trim();
    if (q) router.push(`/platform/admin/search?q=${encodeURIComponent(q)}`);
  }

  return (
    <header
      className="flex h-[var(--plt-header-height)] shrink-0 items-center gap-3 border-b border-[var(--plt-border)] bg-[var(--plt-bg-elevated)] px-4"
    >
      <button
        type="button"
        className="rounded-md p-1.5 text-[var(--plt-text-muted)] hover:bg-white/5 lg:hidden"
        onClick={onMenuClick}
        aria-label="Open menu"
      >
        <Menu className="h-5 w-5" />
      </button>
      <form onSubmit={onSearch} className="relative flex-1 max-w-md">
        <Search
          className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--plt-text-subtle)]"
          aria-hidden
        />
        <input
          type="search"
          placeholder="Search organizations, users…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="plt-input pl-9 py-1.5"
          aria-label="Global search"
        />
      </form>
      <div className="flex items-center gap-2">
        <button
          type="button"
          className="rounded-md p-1.5 text-[var(--plt-text-muted)] hover:bg-white/5"
          aria-label="Notifications"
          title="No new notifications"
        >
          <Bell className="h-4 w-4" />
        </button>
        <div className="hidden sm:block text-right">
          <p className="text-xs text-[var(--plt-text-subtle)]">Platform administrator</p>
          <p className="text-sm font-medium text-[var(--plt-text)] truncate max-w-[180px]">
            {adminEmail}
          </p>
        </div>
        <form action={platformLogoutAction}>
          <button type="submit" className="plt-btn-secondary text-xs py-1.5">
            Sign out
          </button>
        </form>
      </div>
    </header>
  );
}
