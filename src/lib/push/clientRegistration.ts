/**
 * Client-side Web Push registration — shared by AdminPushRegistration and diagnostics.
 */

export const PUSH_REGISTERED_STORAGE_KEY = 'apg_admin_push_registered_v1';
export const PUSH_BANNER_DISMISSED_KEY = 'apg_admin_push_banner_dismissed_v1';

export type StoredPushRegistration = {
  endpoint: string;
  registeredAt: string;
};

export type PushServerState = {
  ok: boolean;
  subscriptionInDatabase: boolean;
  subscriptionCount: number;
  hasMatchingEndpoint: boolean;
  vapidConfigured: boolean;
};

export type PushBootstrapAction =
  | { kind: 'active' }
  | { kind: 'unsupported' }
  | { kind: 'denied' }
  | { kind: 'vapid_missing'; error: string }
  | { kind: 'prompt' }
  | { kind: 'error'; error: string };

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

export function readPushBannerDismissed(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return window.localStorage.getItem(PUSH_BANNER_DISMISSED_KEY) === '1';
  } catch {
    return false;
  }
}

export function dismissPushBanner(): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(PUSH_BANNER_DISMISSED_KEY, '1');
  } catch {
    // ignore
  }
}

export function clearPushBannerDismissed(): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(PUSH_BANNER_DISMISSED_KEY);
  } catch {
    // ignore
  }
}

export function readStoredPushRegistration(): StoredPushRegistration | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(PUSH_REGISTERED_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredPushRegistration;
    if (typeof parsed.endpoint !== 'string' || !parsed.endpoint.trim()) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function persistStoredPushRegistration(endpoint: string): void {
  if (typeof window === 'undefined') return;
  try {
    const payload: StoredPushRegistration = {
      endpoint,
      registeredAt: new Date().toISOString(),
    };
    window.localStorage.setItem(PUSH_REGISTERED_STORAGE_KEY, JSON.stringify(payload));
  } catch {
    // localStorage may be unavailable in private mode
  }
}

export function clearStoredPushRegistration(): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(PUSH_REGISTERED_STORAGE_KEY);
  } catch {
    // ignore
  }
}

/** Pure decision logic — when to show the enable-notifications UI. */
export function decidePushUiAfterBootstrap(input: {
  serviceWorkerSupported: boolean;
  pushManagerSupported: boolean;
  vapidOk: boolean;
  vapidError?: string | null;
  notificationPermission: NotificationPermission | 'unsupported';
  localSubscription: boolean;
  serverHasMatchingEndpoint: boolean;
  serverHasAnySubscription: boolean;
  previouslyRegisteredLocally: boolean;
  bannerDismissed: boolean;
}): PushBootstrapAction {
  if (!input.serviceWorkerSupported || !input.pushManagerSupported) {
    return { kind: 'unsupported' };
  }
  if (!input.vapidOk) {
    return { kind: 'vapid_missing', error: input.vapidError ?? 'VAPID not configured' };
  }
  if (input.notificationPermission === 'denied') {
    return { kind: 'denied' };
  }
  if (input.localSubscription) {
    return { kind: 'active' };
  }
  if (input.serverHasMatchingEndpoint) {
    return { kind: 'active' };
  }
  const stored = input.previouslyRegisteredLocally;
  if (stored && input.serverHasAnySubscription) {
    return { kind: 'active' };
  }
  if (input.notificationPermission === 'granted') {
    return { kind: 'active' };
  }
  if (input.notificationPermission === 'default') {
    if (input.bannerDismissed) {
      return { kind: 'active' };
    }
    return { kind: 'prompt' };
  }
  return { kind: 'prompt' };
}

export async function fetchServerPushState(localEndpoint?: string | null): Promise<PushServerState> {
  const fallback: PushServerState = {
    ok: false,
    subscriptionInDatabase: false,
    subscriptionCount: 0,
    hasMatchingEndpoint: false,
    vapidConfigured: false,
  };
  try {
    const qs = localEndpoint?.trim()
      ? `?endpoint=${encodeURIComponent(localEndpoint.trim())}`
      : '';
    const res = await fetch(`/api/push/diagnostics${qs}`, { cache: 'no-store' });
    if (!res.ok) return fallback;
    const json = (await res.json()) as {
      ok?: boolean;
      subscriptionInDatabase?: boolean;
      subscriptionCount?: number;
      hasMatchingEndpoint?: boolean;
      vapidConfigured?: boolean;
    };
    return {
      ok: json.ok === true,
      subscriptionInDatabase: json.subscriptionInDatabase === true,
      subscriptionCount: typeof json.subscriptionCount === 'number' ? json.subscriptionCount : 0,
      hasMatchingEndpoint: json.hasMatchingEndpoint === true,
      vapidConfigured: json.vapidConfigured !== false,
    };
  } catch {
    return fallback;
  }
}

/**
 * On app launch: reuse an existing browser subscription before checking permission UI.
 * iOS PWAs often report Notification.permission as "default" while a push subscription still exists.
 */
export async function bootstrapAdminPushRegistration(): Promise<{
  action: PushBootstrapAction;
  diagnostics: PushClientDiagnostics;
}> {
  const diag = emptyPushDiagnostics();
  diag.serviceWorkerSupported = 'serviceWorker' in navigator;
  diag.pushManagerSupported = 'PushManager' in window;
  diag.notificationSupported = 'Notification' in window;
  diag.notificationPermission = diag.notificationSupported
    ? Notification.permission
    : 'unsupported';

  const initialDecision = decidePushUiAfterBootstrap({
    serviceWorkerSupported: diag.serviceWorkerSupported,
    pushManagerSupported: diag.pushManagerSupported,
    vapidOk: false,
    notificationPermission: diag.notificationPermission,
    localSubscription: false,
    serverHasMatchingEndpoint: false,
    serverHasAnySubscription: false,
    previouslyRegisteredLocally: Boolean(readStoredPushRegistration()),
    bannerDismissed: readPushBannerDismissed(),
  });
  if (initialDecision.kind === 'unsupported') {
    diag.lastStep = 'unsupported';
    return { action: initialDecision, diagnostics: diag };
  }

  const vapid = await fetchVapidPublicKey();
  diag.vapidKeyLoaded = vapid.ok;
  diag.vapidKeyError = vapid.ok ? null : (vapid.error ?? 'VAPID key missing');

  const reg = await registerAdminServiceWorker(diag);
  if (!reg) {
    return {
      action: { kind: 'error', error: diag.lastError ?? 'Service worker registration failed' },
      diagnostics: diag,
    };
  }

  let localSub: PushSubscription | null = null;
  try {
    localSub = await reg.pushManager.getSubscription();
  } catch {
    localSub = null;
  }

  if (localSub) {
    diag.pushSubscriptionLocal = true;
    diag.pushEndpoint = localSub.endpoint;
  }

  const server = await fetchServerPushState(localSub?.endpoint ?? readStoredPushRegistration()?.endpoint);
  if (!vapid.ok && server.vapidConfigured === false) {
    return {
      action: { kind: 'vapid_missing', error: diag.vapidKeyError ?? 'VAPID not configured' },
      diagnostics: diag,
    };
  }

  const action = decidePushUiAfterBootstrap({
    serviceWorkerSupported: diag.serviceWorkerSupported,
    pushManagerSupported: diag.pushManagerSupported,
    vapidOk: vapid.ok,
    vapidError: diag.vapidKeyError,
    notificationPermission: diag.notificationPermission,
    localSubscription: Boolean(localSub),
    serverHasMatchingEndpoint: server.hasMatchingEndpoint,
    serverHasAnySubscription: server.subscriptionInDatabase,
    previouslyRegisteredLocally: Boolean(readStoredPushRegistration()),
    bannerDismissed: readPushBannerDismissed(),
  });

  if (action.kind === 'active') {
    if (localSub) {
      await savePushSubscriptionToServer(localSub, diag);
      if (diag.subscriptionSaved) {
        persistStoredPushRegistration(localSub.endpoint);
      }
      diag.lastStep = diag.subscriptionSaved ? 'complete' : 'sync_existing_subscription';
      return { action: { kind: 'active' }, diagnostics: diag };
    }

    if (diag.notificationPermission === 'granted' || server.subscriptionInDatabase) {
      const refreshed = await runAdminPushRegistration({ requestPermission: false });
      Object.assign(diag, refreshed);
      if (refreshed.lastStep === 'complete' && refreshed.pushEndpoint) {
        persistStoredPushRegistration(refreshed.pushEndpoint);
        return { action: { kind: 'active' }, diagnostics: diag };
      }
    }

    if (readStoredPushRegistration() && server.subscriptionInDatabase) {
      diag.lastStep = 'reuse_server_subscription';
      return { action: { kind: 'active' }, diagnostics: diag };
    }
  }

  if (action.kind === 'denied') {
    clearStoredPushRegistration();
    diag.lastStep = 'permission_denied';
    return { action, diagnostics: diag };
  }

  if (action.kind === 'vapid_missing') {
    return { action, diagnostics: diag };
  }

  if (action.kind === 'prompt') {
    diag.lastStep = 'awaiting_user_permission';
    return { action, diagnostics: diag };
  }

  return { action, diagnostics: diag };
}

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
    persistStoredPushRegistration(sub.endpoint);
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
