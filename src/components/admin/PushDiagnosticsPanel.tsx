'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  type PushClientDiagnostics,
  refreshPushDiagnosticsFromBrowser,
  runAdminPushRegistration,
} from '@/src/lib/push/clientRegistration';

type ServerDiagnostics = {
  vapidConfigured: boolean;
  subscriptionCount: number;
  subscriptionInDatabase: boolean;
  subscriptions: Array<{
    id: string;
    endpointPreview: string;
    deviceName: string | null;
    platform: string | null;
    lastSeen: string | null;
  }>;
};

function StatusRow({
  label,
  ok,
  detail,
}: {
  label: string;
  ok: boolean | null;
  detail?: string | null;
}) {
  const tone =
    ok === null ? 'text-apg-silver' : ok ? 'text-emerald-300' : 'text-rose-300';
  const badge =
    ok === null ? '—' : ok ? 'OK' : 'FAIL';

  return (
    <div className="flex items-start justify-between gap-4 border-b border-white/5 py-3 last:border-0">
      <div>
        <p className="text-sm font-medium text-white">{label}</p>
        {detail ? <p className="mt-0.5 text-xs text-apg-silver">{detail}</p> : null}
      </div>
      <span className={`shrink-0 text-xs font-semibold uppercase tracking-wide ${tone}`}>
        {badge}
      </span>
    </div>
  );
}

export function PushDiagnosticsPanel() {
  const [client, setClient] = useState<PushClientDiagnostics | null>(null);
  const [server, setServer] = useState<ServerDiagnostics | null>(null);
  const [loading, setLoading] = useState(true);
  const [registering, setRegistering] = useState(false);
  const [testing, setTesting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const snap = await refreshPushDiagnosticsFromBrowser();
      setClient(snap);

      const res = await fetch('/api/push/diagnostics', { cache: 'no-store' });
      if (res.ok) {
        setServer((await res.json()) as ServerDiagnostics);
      } else {
        setServer(null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function handleEnablePush() {
    setRegistering(true);
    setMessage(null);
    setError(null);
    try {
      const result = await runAdminPushRegistration({ requestPermission: true });
      setClient(result);
      if (result.lastStep === 'complete') {
        setMessage('Push registered and saved successfully.');
      } else if (result.lastError) {
        setError(result.lastError);
      } else if (result.lastStep === 'awaiting_user_permission') {
        setError('Tap Enable to grant notification permission.');
      }
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setRegistering(false);
    }
  }

  async function handleTestPush() {
    setTesting(true);
    setMessage(null);
    setError(null);
    try {
      const res = await fetch('/api/push/test', { method: 'POST' });
      const json = (await res.json()) as { ok?: boolean; error?: string; sent?: number };
      if (!res.ok || !json.ok) {
        setError(json.error ?? `HTTP ${res.status}`);
        return;
      }
      setMessage(`Test notification sent to ${json.sent ?? 1} device(s).`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setTesting(false);
    }
  }

  const permissionLabel =
    client?.notificationPermission === 'granted'
      ? 'granted'
      : client?.notificationPermission === 'denied'
        ? 'denied'
        : client?.notificationPermission === 'default'
          ? 'not asked yet'
          : 'unsupported';

  return (
    <div className="space-y-6">
      <section className="rounded-xl border border-white/10 bg-[#1A1F27] p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-white">Push diagnostics</h2>
            <p className="mt-1 text-xs text-apg-silver">
              Traces service worker registration → permission → subscribe → database save.
            </p>
          </div>
          <button
            type="button"
            onClick={() => void refresh()}
            disabled={loading}
            className="rounded-lg border border-white/10 px-3 py-1.5 text-xs font-medium text-white hover:bg-white/5 disabled:opacity-50"
          >
            Refresh
          </button>
        </div>

        {loading && !client ? (
          <p className="mt-4 text-xs text-apg-silver">Loading diagnostics…</p>
        ) : (
          <div className="mt-4">
            <StatusRow
              label="Service worker registered"
              ok={client?.serviceWorkerRegistered ?? false}
              detail={
                client?.serviceWorkerScope
                  ? `Scope: ${client.serviceWorkerScope}`
                  : client?.lastError && client.lastStep === 'register_service_worker'
                    ? client.lastError
                    : null
              }
            />
            <StatusRow
              label="Service worker ready"
              ok={client?.serviceWorkerReady ?? false}
              detail={client?.serviceWorkerScriptUrl ?? undefined}
            />
            <StatusRow
              label="Notification permission"
              ok={
                client?.notificationPermission === 'granted'
                  ? true
                  : client?.notificationPermission === 'denied'
                    ? false
                    : null
              }
              detail={permissionLabel}
            />
            <StatusRow
              label="Push subscription (this device)"
              ok={client?.pushSubscriptionLocal ?? false}
              detail={client?.pushEndpoint ? `Endpoint: ${client.pushEndpoint.slice(0, 56)}…` : null}
            />
            <StatusRow
              label="Subscription saved in database"
              ok={server?.subscriptionInDatabase ?? client?.subscriptionSaved ?? false}
              detail={
                server
                  ? `${server.subscriptionCount} subscription(s) for your admin account`
                  : undefined
              }
            />
            <StatusRow
              label="VAPID public key loaded"
              ok={client?.vapidKeyLoaded ?? false}
              detail={client?.vapidKeyError ?? (server?.vapidConfigured === false ? 'Server keys missing' : null)}
            />
            {client?.lastStep && client.lastStep !== 'snapshot' && client.lastStep !== 'complete' ? (
              <StatusRow
                label="Last registration step"
                ok={null}
                detail={`${client.lastStep}${client.lastError ? ` — ${client.lastError}` : ''}`}
              />
            ) : null}
          </div>
        )}

        {message ? <p className="mt-4 text-xs text-emerald-300">{message}</p> : null}
        {error ? <p className="mt-4 text-xs text-rose-300">{error}</p> : null}

        <div className="mt-5 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => void handleEnablePush()}
            disabled={registering}
            className="rounded-lg bg-[#FF5A1F] px-4 py-2 text-sm font-semibold text-white hover:brightness-110 disabled:opacity-50"
          >
            {registering ? 'Registering…' : 'Enable push on this device'}
          </button>
          <button
            type="button"
            onClick={() => void handleTestPush()}
            disabled={testing || !server?.subscriptionInDatabase}
            className="rounded-lg border border-white/10 px-4 py-2 text-sm font-medium text-white hover:bg-white/5 disabled:opacity-50"
          >
            {testing ? 'Sending…' : 'Send test notification'}
          </button>
        </div>
      </section>

      {server && server.subscriptions.length > 0 ? (
        <section className="rounded-xl border border-white/10 bg-[#1A1F27] p-5">
          <h3 className="text-sm font-semibold text-white">Saved subscriptions</h3>
          <ul className="mt-3 space-y-2">
            {server.subscriptions.map((sub) => (
              <li
                key={sub.id}
                className="rounded-lg border border-white/5 bg-[#121820] px-3 py-2 text-xs text-apg-silver"
              >
                <p className="font-medium text-white">{sub.deviceName ?? 'Unknown device'}</p>
                <p className="mt-0.5">{sub.platform ?? 'unknown platform'}</p>
                <p className="mt-0.5 font-mono text-[10px]">{sub.endpointPreview}</p>
                {sub.lastSeen ? (
                  <p className="mt-0.5">Last seen: {new Date(sub.lastSeen).toLocaleString()}</p>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-5">
        <h3 className="text-sm font-semibold text-amber-200">Fresh PWA install checklist</h3>
        <ol className="mt-2 list-decimal space-y-1 pl-5 text-xs text-apg-silver">
          <li>Delete the old home-screen app, then add to Home Screen from Safari/Chrome.</li>
          <li>Open the installed app and log in as admin.</li>
          <li>Tap &quot;Enable push on this device&quot; — browsers require a tap before showing the permission prompt.</li>
          <li>Confirm all rows above show OK, then send a test notification.</li>
          <li>Ensure VAPID keys are set in production: VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, NEXT_PUBLIC_VAPID_PUBLIC_KEY.</li>
        </ol>
      </section>
    </div>
  );
}
