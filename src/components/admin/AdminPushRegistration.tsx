'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  bootstrapAdminPushRegistration,
  clearPushBannerDismissed,
  clearStoredPushRegistration,
  dismissPushBanner,
  readPushBannerDismissed,
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
  | 'bootstrapping'
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
  const [status, setStatus] = useState<PushStatus>('bootstrapping');
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
          setStatus('active');
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
          clearPushBannerDismissed();
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
          await applyBootstrapAction(action);
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
  }, [applyBootstrapAction]);

  if (status === 'bootstrapping' || status === 'active' || status === 'unsupported') {
    return null;
  }

  if (status === 'denied') {
    return (
      <div
        role="status"
        className="fixed bottom-[max(1rem,env(safe-area-inset-bottom))] left-3 right-3 z-40 mx-auto max-w-lg rounded-lg border border-white/10 bg-[#1A1F27]/95 px-3 py-2 shadow sm:left-auto sm:right-6"
      >
        <p className="text-xs text-apg-silver">
          Push notifications are blocked on this device. Enable them in your browser settings, or
          open{' '}
          <a href="/admin/settings/notifications" className="font-medium text-[#FF5A1F] hover:underline">
            Settings → Notifications
          </a>{' '}
          after allowing permission.
        </p>
      </div>
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

  if (status === 'awaiting_permission' || status === 'error') {
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

/** Manual enable from Settings → Notifications (after dismissing the one-time prompt). */
export function SettingsNotificationPush() {
  const [permission, setPermission] = useState<NotificationPermission | 'unsupported'>('default');
  const [bannerDismissed, setBannerDismissed] = useState(false);
  const [registering, setRegistering] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined' || !('Notification' in window)) {
      setPermission('unsupported');
      return;
    }
    setPermission(Notification.permission);
    setBannerDismissed(readPushBannerDismissed());
  }, []);

  async function handleEnable() {
    setRegistering(true);
    setMessage(null);
    setError(null);
    try {
      const result = await runAdminPushRegistration({ requestPermission: true });
      setPermission(result.notificationPermission as NotificationPermission);
      if (result.lastStep === 'complete') {
        clearPushBannerDismissed();
        setMessage('Push notifications enabled on this device.');
        return;
      }
      if (result.notificationPermission === 'denied') {
        setError('Permission blocked. Enable notifications in your browser settings, then try again.');
        return;
      }
      setError(result.lastError ?? 'Could not enable push notifications.');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setRegistering(false);
    }
  }

  if (permission === 'unsupported') {
    return (
      <p className="mt-4 text-sm text-apg-silver">
        Push notifications are not supported in this browser.
      </p>
    );
  }

  if (permission === 'granted') {
    return (
      <p className="mt-4 text-sm text-emerald-300">
        Push notifications are enabled on this device.
      </p>
    );
  }

  if (permission === 'denied') {
    return (
      <p className="mt-4 text-sm text-apg-silver">
        Notifications are blocked in your browser. Open site settings for this app and allow
        notifications, then return here to register this device.
      </p>
    );
  }

  if (bannerDismissed) {
    return (
      <div className="mt-4 space-y-2">
        <p className="text-sm text-apg-silver">
          Push alerts are off on this device. Enable them when you are ready.
        </p>
        <button
          type="button"
          disabled={registering}
          onClick={() => void handleEnable()}
          className="rounded-lg bg-[#FF5A1F] px-4 py-2 text-sm font-semibold text-white hover:brightness-110 disabled:opacity-50"
        >
          {registering ? 'Enabling…' : 'Enable push notifications'}
        </button>
        {message ? <p className="text-sm text-emerald-300">{message}</p> : null}
        {error ? <p className="text-sm text-rose-300">{error}</p> : null}
      </div>
    );
  }

  return (
    <p className="mt-4 text-sm text-apg-silver">
      You will be asked once in the admin app to enable push notifications.
    </p>
  );
}
