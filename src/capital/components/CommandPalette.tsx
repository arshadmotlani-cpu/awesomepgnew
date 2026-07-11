'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Command } from 'cmdk';
import { Car, Plus, Receipt, Search, Wallet } from 'lucide-react';
import { cn } from '@/src/capital/lib/utils';

const nav = [
  { href: '/dashboard', label: 'Dashboard' },
  { href: '/assets', label: 'Assets' },
  { href: '/expenses', label: 'Expenses' },
  { href: '/payments', label: 'Payments' },
  { href: '/capital', label: 'Capital' },
  { href: '/ledger', label: 'Ledger' },
  { href: '/reports', label: 'Reports' },
];

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<
    { id: string; displayName: string; registrationNumber: string }[]
  >([]);
  const router = useRouter();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    if (!query.trim()) return;
    const t = setTimeout(async () => {
      const res = await fetch(`/api/capital/search?q=${encodeURIComponent(query)}`);
      if (res.ok) {
        const data = await res.json();
        setResults(data.results ?? []);
      }
    }, 300);
    return () => clearTimeout(t);
  }, [query]);

  const displayResults = query.trim() ? results : [];

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/60 p-4 pt-[15vh]">
      <Command
        className="ac-glass-card w-full max-w-lg overflow-hidden rounded-xl border border-white/10 shadow-2xl"
        shouldFilter={false}
      >
        <div className="flex items-center border-b border-white/10 px-3">
          <Search className="mr-2 h-4 w-4 text-ac-text-muted" />
          <Command.Input
            value={query}
            onValueChange={setQuery}
            aria-label="Search or jump to a page"
            className="flex h-12 w-full bg-transparent text-sm outline-none"
          />
        </div>
        <Command.List className="max-h-80 overflow-y-auto p-2">
          <Command.Empty className="py-6 text-center text-sm text-ac-text-muted">
            No results.
          </Command.Empty>
          <Command.Group heading="Navigate">
            {nav.map((item) => (
              <Command.Item
                key={item.href}
                onSelect={() => {
                  router.push(item.href);
                  setOpen(false);
                }}
                className={cn(
                  'flex cursor-pointer items-center rounded-lg px-3 py-2 text-sm',
                  'aria-selected:bg-white/10',
                )}
              >
                {item.label}
              </Command.Item>
            ))}
          </Command.Group>
          <Command.Group heading="Quick actions">
            {[
              { href: '/assets/new', label: 'Add asset', icon: Car },
              { href: '/capital', label: 'Add capital', icon: Wallet },
              { href: '/payments', label: 'Record payment', icon: Receipt },
            ].map(({ href, label, icon: Icon }) => (
              <Command.Item
                key={href}
                onSelect={() => {
                  router.push(href);
                  setOpen(false);
                }}
                className="flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-sm aria-selected:bg-white/10"
              >
                <Icon className="h-4 w-4" />
                {label}
              </Command.Item>
            ))}
          </Command.Group>
          {displayResults.length > 0 ? (
            <Command.Group heading="Assets">
              {displayResults.map((r) => (
                <Command.Item
                  key={r.id}
                  onSelect={() => {
                    router.push(`/assets/${r.id}`);
                    setOpen(false);
                  }}
                  className="flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-sm aria-selected:bg-white/10"
                >
                  <Plus className="h-4 w-4 text-ac-accent" />
                  {r.registrationNumber} — {r.displayName}
                </Command.Item>
              ))}
            </Command.Group>
          ) : null}
        </Command.List>
      </Command>
      <button
        type="button"
        className="fixed inset-0 -z-10"
        aria-label="Close"
        onClick={() => setOpen(false)}
      />
    </div>
  );
}
