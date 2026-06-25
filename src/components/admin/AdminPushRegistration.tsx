'use client';

import { useEffect, useRef, useState } from 'react';

function detectPlatform(): string {
  if (typeof navigator === 'undefined') return 'unknown';
  const ua = navigator.userAgent;
  if (/iPhone|iPad|iPod/i.test(ua)) return 'ios';
  if (/Android/i.test(ua)) return 'android';
  if (/Mac/i.test(ua)) return 'macos';
  if (/Win/i.test(ua)) return 'windows';
  return 'desktop';
}

function detectDeviceName(): string {
  if (typeof navigator === 'undefined') return 'Unknown device';
  const platform = detectPlatform();
  if (platform === 'ios') return 'iPhone / iPad';
  if (platform === 'android') return 'Android';
  return navigator.userAgent.includes('Mobile') ? 'Mobile browser' : 'Desktop browser';
}

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = window.atob(base64);
  const arr = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; ++i) arr[i] = raw.charCodeAt(i);
  return arr;
}

async function updateBadge(unreadCount: number) {
  if (!('setAppBadge' in navigator)) return;
  try {
    if (unreadCount <= 0) await navigator.clearAppBadge();
    else await navigator.setAppBadge(unreadCount);
  } catch {
    // Badge API not supported on this browser
  }
}

/**
 * Registers admin PWA service worker + Web Push subscription when permitted.
 */
export function AdminPushRegistration() {
  const [status, setStatus] = useState<'idle' | 'unsupported' | 'denied' | 'active' | 'error'>(
    'idle',
  );
  const registeringRef = useRef(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
      setStatus('unsupported');
      return;
    }

    async function syncBadge() {
      const res = await fetch('/api/admin/live', { cache: 'no-store' });
      if (!res.ok) return;
      const json = (await res.json()) as { unreadCount?: number };
      if (typeof json.unreadCount === 'number') {
        await updateBadge(json.unreadCount);
      }
    }

    async function subscribe(reg: ServiceWorkerRegistration, publicKey: string) {
      const existing = await reg.pushManager.getSubscription();
      const sub =
        existing ??
        (await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(publicKey) as BufferSource,
        }));

      const json = sub.toJSON();
      if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) {
        throw new Error('Invalid push subscription');
      }

      await fetch('/api/push/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          endpoint: json.endpoint,
          keys: { p256dh: json.keys.p256dh, auth: json.keys.auth },
          deviceName: detectDeviceName(),
          platform: detectPlatform(),
        }),
      });
    }

    async function register() {
      if (registeringRef.current) return;
      registeringRef.current = true;
      try {
        const keyRes = await fetch('/api/push/vapid-public-key');
        const keyJson = (await keyRes.json()) as { ok?: boolean; publicKey?: string };
        if (!keyJson.ok || !keyJson.publicKey) {
          setStatus('unsupported');
          return;
        }

        const reg = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
        await navigator.serviceWorker.ready;

        if (Notification.permission === 'denied') {
          setStatus('denied');
          return;
        }

        if (Notification.permission === 'default') {
          const perm = await Notification.requestPermission();
          if (perm !== 'granted') {
            setStatus(perm === 'denied' ? 'denied' : 'idle');
            return;
          }
        }

        await subscribe(reg, keyJson.publicKey);
        await syncBadge();
        setStatus('active');
      } catch {
        setStatus('error');
      } finally {
        registeringRef.current = false;
      }
    }

    void register();

    const onMessage = (event: MessageEvent) => {
      if (event.data?.type === 'PUSH_SUBSCRIPTION_EXPIRED') {
        void register();
      }
    };
    navigator.serviceWorker.addEventListener('message', onMessage);

    const onBadgeUpdate = (e: Event) => {
      const detail = (e as CustomEvent<{ unreadCount?: number }>).detail;
      if (typeof detail?.unreadCount === 'number') {
        void updateBadge(detail.unreadCount);
      }
    };
    window.addEventListener('admin-badges-updated', onBadgeUpdate);

    return () => {
      navigator.serviceWorker.removeEventListener('message', onMessage);
      window.removeEventListener('admin-badges-updated', onBadgeUpdate);
    };
  }, []);

  if (status === 'denied') {
    return (
      <p className="sr-only">
        Push notifications blocked — enable in browser settings to get alerts on this device.
      </p>
    );
  }

  return null;
}
