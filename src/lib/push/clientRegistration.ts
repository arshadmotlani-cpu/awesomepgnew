/**
 * Client-side Web Push registration — shared by AdminPushRegistration and diagnostics.
 */

export type PushClientDiagnostics = {
  serviceWorkerSupported: boolean;
  pushManagerSupported: boolean;
  notificationSupported: boolean;
  serviceWorkerRegistered: boolean;
  serviceWorkerScope: string | null;
  serviceWorkerScriptUrl: string | null;
  serviceWorkerReady: boolean;
  notificationPermission: NotificationPermission | 'unsupported';
  pushSubscriptionLocal: boolean;
  pushEndpoint: string | null;
  vapidKeyLoaded: boolean;
  vapidKeyError: string | null;
  subscriptionSaved: boolean | null;
  subscriptionSaveError: string | null;
  lastStep: string;
  lastError: string | null;
};

export function emptyPushDiagnostics(): PushClientDiagnostics {
  return {
    serviceWorkerSupported: false,
    pushManagerSupported: false,
    notificationSupported: false,
    serviceWorkerRegistered: false,
    serviceWorkerScope: null,
    serviceWorkerScriptUrl: null,
    serviceWorkerReady: false,
    notificationPermission: 'unsupported',
    pushSubscriptionLocal: false,
    pushEndpoint: null,
    vapidKeyLoaded: false,
    vapidKeyError: null,
    subscriptionSaved: null,
    subscriptionSaveError: null,
    lastStep: 'idle',
    lastError: null,
  };
}

function detectPlatform(): string {
  const ua = navigator.userAgent;
  if (/iPhone|iPad|iPod/i.test(ua)) return 'ios';
  if (/Android/i.test(ua)) return 'android';
  if (/Mac/i.test(ua)) return 'macos';
  if (/Win/i.test(ua)) return 'windows';
  return 'desktop';
}

function detectDeviceName(): string {
  const platform = detectPlatform();
  if (platform === 'ios') return 'iPhone / iPad';
  if (platform === 'android') return 'Android';
  return navigator.userAgent.includes('Mobile') ? 'Mobile browser' : 'Desktop browser';
}

export function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = window.atob(base64);
  const arr = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; ++i) arr[i] = raw.charCodeAt(i);
  return arr;
}

export async function fetchVapidPublicKey(): Promise<{ ok: boolean; publicKey?: string; error?: string }> {
  try {
    const res = await fetch('/api/push/vapid-public-key', { cache: 'no-store' });
    const json = (await res.json()) as { ok?: boolean; publicKey?: string; error?: string };
    if (!res.ok || !json.ok || !json.publicKey) {
      return { ok: false, error: json.error ?? `HTTP ${res.status}` };
    }
    return { ok: true, publicKey: json.publicKey };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export async function registerAdminServiceWorker(
  diag: PushClientDiagnostics,
): Promise<ServiceWorkerRegistration | null> {
  diag.lastStep = 'register_service_worker';
  if (!diag.serviceWorkerSupported) {
    diag.lastError = 'Service workers not supported';
    return null;
  }
  try {
    const reg = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
    diag.serviceWorkerRegistered = true;
    diag.serviceWorkerScope = reg.scope;
    diag.serviceWorkerScriptUrl = reg.active?.scriptURL ?? reg.installing?.scriptURL ?? '/sw.js';
    diag.lastStep = 'wait_service_worker_ready';
    await navigator.serviceWorker.ready;
    diag.serviceWorkerReady = true;
    return reg;
  } catch (err) {
    diag.lastError = err instanceof Error ? err.message : String(err);
    return null;
  }
}

export async function savePushSubscriptionToServer(
  sub: PushSubscription,
  diag: PushClientDiagnostics,
): Promise<boolean> {
  diag.lastStep = 'save_subscription';
  const json = sub.toJSON();
  if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) {
    diag.subscriptionSaveError = 'Invalid subscription keys';
    diag.subscriptionSaved = false;
    return false;
  }
  try {
    const res = await fetch('/api/push/subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        endpoint: json.endpoint,
        keys: { p256dh: json.keys.p256dh, auth: json.keys.auth },
        deviceName: detectDeviceName(),
        platform: detectPlatform(),
      }),
    });
    const body = (await res.json()) as { ok?: boolean; error?: string };
    if (!res.ok || !body.ok) {
      diag.subscriptionSaveError = body.error ?? `HTTP ${res.status}`;
      diag.subscriptionSaved = false;
      return false;
    }
    diag.subscriptionSaved = true;
    diag.subscriptionSaveError = null;
    return true;
  } catch (err) {
    diag.subscriptionSaveError = err instanceof Error ? err.message : String(err);
    diag.subscriptionSaved = false;
    return false;
  }
}

/**
 * Full push registration. Call requestPermission=true only from a user gesture (button tap).
 */
export async function runAdminPushRegistration(opts?: {
  requestPermission?: boolean;
}): Promise<PushClientDiagnostics> {
  const diag = emptyPushDiagnostics();
  diag.serviceWorkerSupported = 'serviceWorker' in navigator;
  diag.pushManagerSupported = 'PushManager' in window;
  diag.notificationSupported = 'Notification' in window;
  diag.notificationPermission = diag.notificationSupported
    ? Notification.permission
    : 'unsupported';

  if (!diag.serviceWorkerSupported || !diag.pushManagerSupported) {
    diag.lastError = 'Push not supported in this browser';
    diag.lastStep = 'unsupported';
    return diag;
  }

  const vapid = await fetchVapidPublicKey();
  diag.vapidKeyLoaded = vapid.ok;
  diag.vapidKeyError = vapid.ok ? null : (vapid.error ?? 'VAPID key missing');

  const reg = await registerAdminServiceWorker(diag);
  if (!reg) return diag;

  if (diag.notificationPermission === 'denied') {
    diag.lastStep = 'permission_denied';
    diag.lastError = 'Notifications blocked in browser settings';
    return diag;
  }

  if (diag.notificationPermission === 'default') {
    if (!opts?.requestPermission) {
      diag.lastStep = 'awaiting_user_permission';
      return diag;
    }
    diag.lastStep = 'request_permission';
    const perm = await Notification.requestPermission();
    diag.notificationPermission = perm;
    if (perm !== 'granted') {
      diag.lastError = perm === 'denied' ? 'Permission denied' : 'Permission not granted';
      diag.lastStep = 'permission_denied';
      return diag;
    }
  }

  if (!vapid.ok || !vapid.publicKey) {
    diag.lastStep = 'vapid_missing';
    diag.lastError = diag.vapidKeyError ?? 'VAPID not configured on server';
    return diag;
  }

  try {
    diag.lastStep = 'push_subscribe';
    let sub = await reg.pushManager.getSubscription();
    if (!sub) {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapid.publicKey) as BufferSource,
      });
    }
    diag.pushSubscriptionLocal = true;
    diag.pushEndpoint = sub.endpoint;
    await savePushSubscriptionToServer(sub, diag);
    if (!diag.subscriptionSaved) {
      diag.lastError = diag.subscriptionSaveError;
      return diag;
    }
    diag.lastStep = 'complete';
    diag.lastError = null;
  } catch (err) {
    diag.lastError = err instanceof Error ? err.message : String(err);
    diag.lastStep = 'push_subscribe_failed';
  }

  return diag;
}

export async function refreshPushDiagnosticsFromBrowser(): Promise<PushClientDiagnostics> {
  const diag = emptyPushDiagnostics();
  diag.serviceWorkerSupported = 'serviceWorker' in navigator;
  diag.pushManagerSupported = 'PushManager' in window;
  diag.notificationSupported = 'Notification' in window;
  diag.notificationPermission = diag.notificationSupported
    ? Notification.permission
    : 'unsupported';

  const vapid = await fetchVapidPublicKey();
  diag.vapidKeyLoaded = vapid.ok;
  diag.vapidKeyError = vapid.ok ? null : (vapid.error ?? 'VAPID key missing');

  if (diag.serviceWorkerSupported) {
    const reg = await navigator.serviceWorker.getRegistration('/');
    if (reg) {
      diag.serviceWorkerRegistered = true;
      diag.serviceWorkerScope = reg.scope;
      diag.serviceWorkerScriptUrl = reg.active?.scriptURL ?? null;
      try {
        await navigator.serviceWorker.ready;
        diag.serviceWorkerReady = true;
      } catch {
        diag.serviceWorkerReady = false;
      }
      if (diag.pushManagerSupported) {
        const sub = await reg.pushManager.getSubscription();
        if (sub) {
          diag.pushSubscriptionLocal = true;
          diag.pushEndpoint = sub.endpoint;
        }
      }
    }
  }

  try {
    const res = await fetch('/api/push/diagnostics', { cache: 'no-store' });
    if (res.ok) {
      const json = (await res.json()) as {
        subscriptionInDatabase?: boolean;
        subscriptionCount?: number;
        vapidConfigured?: boolean;
      };
      diag.subscriptionSaved = json.subscriptionInDatabase ?? false;
      if (json.vapidConfigured === false) {
        diag.vapidKeyLoaded = false;
        diag.vapidKeyError = 'Server VAPID keys not configured';
      }
    }
  } catch {
    // ignore
  }

  diag.lastStep = 'snapshot';
  return diag;
}
