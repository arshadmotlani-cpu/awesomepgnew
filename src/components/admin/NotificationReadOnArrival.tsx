'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useRef } from 'react';

function appendNotifReadParam(href: string, notificationId: string): string {
  try {
    const url = new URL(href, typeof window !== 'undefined' ? window.location.origin : 'https://local');
    url.searchParams.set('notifRead', notificationId);
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    const sep = href.includes('?') ? '&' : '?';
    return `${href}${sep}notifRead=${encodeURIComponent(notificationId)}`;
  }
}

export { appendNotifReadParam };

function NotificationReadOnArrivalInner() {
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  const processedRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    const notifRead = searchParams.get('notifRead');
    if (!notifRead || processedRef.current.has(notifRead)) return;
    processedRef.current.add(notifRead);

    void fetch('/api/admin/notifications/read', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ notificationId: notifRead }),
    })
      .then((res) => res.json())
      .then((json: { ok?: boolean; unreadCount?: number }) => {
        if (typeof window !== 'undefined') {
          window.dispatchEvent(
            new CustomEvent('admin-badges-updated', {
              detail: {
                unreadCount: json.ok && typeof json.unreadCount === 'number' ? json.unreadCount : 0,
              },
            }),
          );
        }
      })
      .catch(() => undefined);

    const params = new URLSearchParams(searchParams.toString());
    params.delete('notifRead');
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }, [pathname, router, searchParams]);

  return null;
}

export function NotificationReadOnArrival() {
  return (
    <Suspense fallback={null}>
      <NotificationReadOnArrivalInner />
    </Suspense>
  );
}
