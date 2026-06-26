'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { AdminInboxNotificationRow } from '@/src/services/notificationEngine';

function relativeTime(iso: string): string {
  const date = new Date(iso);
  const diffMs = Date.now() - date.getTime();
  const mins = Math.floor(diffMs / 60_000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return hours === 1 ? 'Today' : `${hours}h ago`;
  return date.toLocaleDateString('en-IN', { day: 'numeric', month: 'long' });
}

export function AdminNotificationCenter({ initialUnread = 0 }: { initialUnread?: number }) {
  const [open, setOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(initialUnread);
  const [items, setItems] = useState<AdminInboxNotificationRow[]>([]);
  const [loading, setLoading] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  const fetchNotifications = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/notifications?state=unread', { cache: 'no-store' });
      const json = (await res.json()) as {
        ok: boolean;
        data?: AdminInboxNotificationRow[];
        unreadCount?: number;
      };
      if (json.ok) {
        setItems(json.data ?? []);
        setUnreadCount(json.unreadCount ?? json.data?.length ?? 0);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    setUnreadCount(initialUnread);
  }, [initialUnread]);

  useEffect(() => {
    function onBadgesUpdated(e: Event) {
      const detail = (e as CustomEvent<{ unreadCount?: number }>).detail;
      if (typeof detail?.unreadCount === 'number') {
        setUnreadCount(detail.unreadCount);
      }
    }
    window.addEventListener('admin-badges-updated', onBadgesUpdated);
    return () => window.removeEventListener('admin-badges-updated', onBadgesUpdated);
  }, []);

  useEffect(() => {
    if (typeof document === 'undefined') return;
    const timer = window.setInterval(() => {
      if (document.visibilityState !== 'visible') return;
      void fetch('/api/admin/live', { cache: 'no-store' })
        .then((res) => res.json())
        .then((json: { ok?: boolean; unreadCount?: number }) => {
          if (json.ok && typeof json.unreadCount === 'number') {
            setUnreadCount(json.unreadCount);
          }
        })
        .catch(() => undefined);
    }, 20_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (open) void fetchNotifications();
  }, [open, fetchNotifications]);

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [open]);

  async function onItemClick(item: AdminInboxNotificationRow) {
    await fetch('/api/admin/notifications/read', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ notificationId: item.id }),
    }).catch(() => undefined);
    setUnreadCount((c) => Math.max(0, c - 1));
    setOpen(false);
  }

  return (
    <div className="relative" ref={panelRef}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="relative inline-flex h-10 min-w-10 items-center justify-center rounded-lg border border-white/10 bg-[#1A1F27] text-apg-silver hover:bg-white/5 hover:text-white"
        aria-label={`Notifications${unreadCount > 0 ? `, ${unreadCount} unread` : ''}`}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
          <path
            d="M15 17H9l-1 2h8l-1-2ZM18 8a6 6 0 10-12 0c0 7-3 7-3 7h18s-3 0-3-7Z"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinejoin="round"
          />
        </svg>
        {unreadCount > 0 ? (
          <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-[#FF5A1F] px-1 text-[10px] font-bold text-white">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        ) : null}
      </button>

      {open ? (
        <div className="absolute right-0 top-full z-50 mt-2 w-[min(100vw-1.5rem,22rem)] overflow-hidden rounded-xl border border-white/10 bg-[#1A1F27] shadow-2xl">
          <div className="border-b border-white/10 px-4 py-3">
            <p className="text-sm font-semibold text-white">Notifications</p>
            <p className="text-[11px] text-apg-silver">Unread only — opening clears the badge</p>
          </div>
          <div className="max-h-[min(60vh,24rem)] overflow-y-auto">
            {loading ? (
              <p className="px-4 py-6 text-center text-xs text-apg-silver">Loading…</p>
            ) : items.length === 0 ? (
              <p className="px-4 py-6 text-center text-xs text-apg-silver">No new notifications</p>
            ) : (
              <ul className="divide-y divide-white/5">
                {items.map((item) => (
                  <li key={item.id}>
                    <Link
                      href={item.href}
                      onClick={() => void onItemClick(item)}
                      className="block px-4 py-3 hover:bg-white/5"
                    >
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-[#FF5A1F]">
                        {item.typeLabel}
                      </p>
                      <p className="mt-0.5 text-sm font-medium text-white">
                        {item.residentName ?? item.title}
                      </p>
                      {item.pgName ? (
                        <p className="text-xs text-apg-silver">{item.pgName}</p>
                      ) : null}
                      {item.detail ? (
                        <p className="mt-0.5 text-xs text-sky-200">{item.detail}</p>
                      ) : null}
                      <p className="mt-1 text-[10px] text-apg-silver/70">
                        {relativeTime(item.createdAt.toString())}
                      </p>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="border-t border-white/10 px-4 py-2">
            <Link
              href="/admin/notifications"
              onClick={() => setOpen(false)}
              className="text-xs font-medium text-[#FF5A1F] hover:underline"
            >
              View all →
            </Link>
          </div>
        </div>
      ) : null}
    </div>
  );
}
