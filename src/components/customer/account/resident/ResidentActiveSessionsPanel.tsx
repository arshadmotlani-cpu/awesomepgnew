'use client';

import { useCallback, useEffect, useState } from 'react';
import { redirectAfterAuth } from '@/src/lib/auth/safeNext';
import { ApgCard } from '@/src/components/customer/design-system';

type SessionRow = {
  id: string;
  deviceLabel: string;
  ip: string | null;
  lastSeenAt: string;
  expiresAt: string;
  rememberMe: boolean;
  isCurrent: boolean;
};

function formatWhen(iso: string): string {
  try {
    return new Date(iso).toLocaleString('en-IN', {
      dateStyle: 'medium',
      timeStyle: 'short',
    });
  } catch {
    return iso;
  }
}

export function ResidentActiveSessionsPanel() {
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/auth/customer/sessions', { credentials: 'same-origin' });
      const data = (await res.json()) as {
        ok: boolean;
        message?: string;
        sessions?: SessionRow[];
      };
      if (!res.ok || !data.ok) {
        setError(data.message ?? 'Could not load sessions.');
        return;
      }
      setSessions(data.sessions ?? []);
    } catch {
      setError('Could not load sessions.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function revokeAll() {
    if (
      !window.confirm(
        'Sign out on every device? You will need to sign in again on this phone or computer too.',
      )
    ) {
      return;
    }
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch('/api/auth/customer/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ action: 'revoke_all' }),
      });
      const data = (await res.json()) as { ok: boolean; message?: string; signedOut?: boolean };
      if (!res.ok || !data.ok) {
        setError(data.message ?? 'Could not sign out everywhere.');
        return;
      }
      redirectAfterAuth('/login?message=signed_out_all_devices');
    } finally {
      setBusy(false);
    }
  }

  return (
    <ApgCard tier="resident" className="mt-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-white">Active sessions</h3>
          <p className="mt-1 text-xs text-apg-silver">
            Devices where you are signed in. We keep you signed in on trusted devices you choose at
            login.
          </p>
        </div>
        <button
          type="button"
          disabled={busy || loading}
          onClick={() => void revokeAll()}
          className="rounded-lg border border-rose-400/40 bg-rose-500/10 px-3 py-2 text-xs font-semibold text-rose-200 hover:bg-rose-500/20 disabled:opacity-50"
        >
          {busy ? 'Signing out…' : 'Log out from all devices'}
        </button>
      </div>

      {loading ? (
        <p className="mt-4 text-sm text-apg-silver">Loading sessions…</p>
      ) : error ? (
        <p className="mt-4 rounded-lg bg-rose-500/15 px-3 py-2 text-sm text-rose-200">{error}</p>
      ) : sessions.length === 0 ? (
        <p className="mt-4 text-sm text-apg-silver">No active sessions.</p>
      ) : (
        <ul className="mt-4 space-y-2">
          {sessions.map((row) => (
            <li
              key={row.id}
              className="rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-sm"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-medium text-white">
                  {row.deviceLabel}
                  {row.isCurrent ? (
                    <span className="ml-2 text-[10px] font-semibold uppercase tracking-wide text-emerald-300">
                      This device
                    </span>
                  ) : null}
                </p>
                {row.rememberMe ? (
                  <span className="text-[10px] font-semibold uppercase tracking-wide text-apg-cyan">
                    Remembered
                  </span>
                ) : null}
              </div>
              <p className="mt-1 text-xs text-apg-silver">
                Last active {formatWhen(row.lastSeenAt)}
                {row.ip ? ` · ${row.ip}` : ''}
              </p>
            </li>
          ))}
        </ul>
      )}

      {message ? (
        <p className="mt-3 rounded-lg bg-emerald-500/15 px-3 py-2 text-sm text-emerald-200">
          {message}
        </p>
      ) : null}
    </ApgCard>
  );
}
