'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  bootstrapAdminPushRegistration,
  clearStoredPushRegistration,
  dismissPushBanner,
  runAdminPushRegistration,
} from '@/src/lib/push/clientRegistration';

async function updateBadge(unreadCount: number) {
  if (!('setAppBadge' in navigator)) return;
  try {
    if (unreadCount <= 0) await navigator.clearAppBadge();
    else await navigator.setAppBadge(unreadCount);
  } catch {
    // Badge API not supported on this browser
  }
}

type PushStatus =
  | 'idle'
  | 'unsupported'
  | 'denied'
  | 'awaiting_permission'
  | 'vapid_missing'
  | 'active'
  | 'error';

/**
 * Registers admin PWA service worker + Web Push subscription.
 * Permission is requested only after an explicit user tap (required on mobile).
 */
export function AdminPushRegistration() {
  const [status, setStatus] = useState<PushStatus>('idle');
  const [errorDetail, setErrorDetail] = useState<string | null>(null);
  const [registering, setRegistering] = useState(false);
  const registeringRef = useRef(false);
  const bootstrappedRef = useRef(false);

  const syncBadge = useCallback(async () => {
    const res = await fetch('/api/admin/live', { cache: 'no-store' });
    if (!res.ok) return;
    const json = (await res.json()) as { unreadCount?: number };
    if (typeof json.unreadCount === 'number') {
      await updateBadge(json.unreadCount);
    }
  }, []);

  const applyBootstrapAction = useCallback(
    async (action: Awaited<ReturnType<typeof bootstrapAdminPushRegistration>>['action']) => {
      switch (action.kind) {
        case 'active':
          await syncBadge();
          setStatus('active');
          setErrorDetail(null);
          return;
        case 'unsupported':
          setStatus('unsupported');
          return;
        case 'denied':
          clearStoredPushRegistration();
          setStatus('denied');
          return;
        case 'vapid_missing':
          setStatus('vapid_missing');
          setErrorDetail(action.error);
          return;
        case 'prompt':
          setStatus('awaiting_permission');
          setErrorDetail(null);
          return;
        case 'error':
          setStatus('error');
          setErrorDetail(action.error);
          return;
        default:
          setStatus('awaiting_permission');
      }
    },
    [syncBadge],
  );

  const completeRegistration = useCallback(
    async (requestPermission: boolean) => {
      if (registeringRef.current) return;
      registeringRef.current = true;
      setRegistering(true);
      setErrorDetail(null);
      try {
        const result = await runAdminPushRegistration({ requestPermission });
        if (result.lastStep === 'complete') {
          await syncBadge();
          setStatus('active');
          return;
        }
        if (!result.serviceWorkerSupported || !result.pushManagerSupported) {
          setStatus('unsupported');
          setErrorDetail(result.lastError);
          return;
        }
        if (result.notificationPermission === 'denied') {
          clearStoredPushRegistration();
          setStatus('denied');
          return;
        }
        if (!result.vapidKeyLoaded) {
          setStatus('vapid_missing');
          setErrorDetail(result.vapidKeyError);
          return;
        }
        if (result.lastStep === 'awaiting_user_permission') {
          setStatus('awaiting_permission');
          return;
        }
        setStatus('error');
        setErrorDetail(result.lastError ?? result.lastStep);
      } catch (err) {
        setStatus('error');
        setErrorDetail(err instanceof Error ? err.message : String(err));
      } finally {
        registeringRef.current = false;
        setRegistering(false);
      }
    },
    [syncBadge],
  );

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (bootstrappedRef.current) return;
    bootstrappedRef.current = true;

    async function bootstrap() {
      const { action } = await bootstrapAdminPushRegistration();
      await applyBootstrapAction(action);
    }

    void bootstrap();

    const onMessage = (event: MessageEvent) => {
      if (event.data?.type === 'PUSH_SUBSCRIPTION_EXPIRED') {
        void (async () => {
          const { action } = await bootstrapAdminPushRegistration();
          if (action.kind === 'active') {
            await applyBootstrapAction(action);
            return;
          }
          if (Notification.permission === 'default') {
            setStatus('awaiting_permission');
            return;
          }
          await completeRegistration(false);
        })();
      }
    };
    navigator.serviceWorker?.addEventListener('message', onMessage);

    const onBadgeUpdate = (e: Event) => {
      const detail = (e as CustomEvent<{ unreadCount?: number }>).detail;
      if (typeof detail?.unreadCount === 'number') {
        void updateBadge(detail.unreadCount);
      }
    };
    window.addEventListener('admin-badges-updated', onBadgeUpdate);

    return () => {
      navigator.serviceWorker?.removeEventListener('message', onMessage);
      window.removeEventListener('admin-badges-updated', onBadgeUpdate);
    };
  }, [applyBootstrapAction, completeRegistration]);

  if (status === 'active' || status === 'unsupported') {
    return null;
  }

  if (status === 'denied') {
    return (
      <p className="sr-only">
        Push notifications blocked — enable in browser settings to get alerts on this device.
      </p>
    );
  }

  if (status === 'vapid_missing') {
    return (
      <div
        role="status"
        className="fixed bottom-[max(1rem,env(safe-area-inset-bottom))] left-3 right-3 z-50 mx-auto max-w-lg rounded-xl border border-amber-500/40 bg-[#1A1F27] p-4 shadow-lg sm:left-auto sm:right-6"
      >
        <p className="text-sm font-medium text-white">Push alerts unavailable</p>
        <p className="mt-1 text-xs text-apg-silver">
          Server VAPID keys are not configured. Ask your admin to set VAPID_PUBLIC_KEY and
          VAPID_PRIVATE_KEY in production.
          {errorDetail ? ` (${errorDetail})` : ''}
        </p>
      </div>
    );
  }

  if (status === 'awaiting_permission' || status === 'error' || status === 'idle') {
    return (
      <div
        role="dialog"
        aria-label="Enable push notifications"
        className="fixed bottom-[max(1rem,env(safe-area-inset-bottom))] left-3 right-3 z-50 mx-auto max-w-lg rounded-xl border border-[#FF5A1F]/40 bg-[#1A1F27] p-4 shadow-lg sm:left-auto sm:right-6"
      >
        <p className="text-sm font-medium text-white">Enable push notifications</p>
        <p className="mt-1 text-xs text-apg-silver">
          Get instant alerts for bookings, payments, and resident updates on this device.
        </p>
        {errorDetail ? <p className="mt-2 text-xs text-rose-300">{errorDetail}</p> : null}
        <div className="mt-3 flex gap-2">
          <button
            type="button"
            disabled={registering}
            onClick={() => void completeRegistration(true)}
            className="rounded-lg bg-[#FF5A1F] px-4 py-2 text-sm font-semibold text-white hover:brightness-110 disabled:opacity-50"
          >
            {registering ? 'Enabling…' : 'Enable notifications'}
          </button>
          <button
            type="button"
            disabled={registering}
            onClick={() => {
              dismissPushBanner();
              setStatus('active');
              setErrorDetail(null);
            }}
            className="rounded-lg border border-white/20 px-4 py-2 text-sm font-medium text-apg-silver hover:bg-white/5 disabled:opacity-50"
          >
            Not now
          </button>
        </div>
      </div>
    );
  }

  return null;
}
