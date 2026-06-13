'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import type { FunnelStep } from '@/src/services/visitorAnalytics';

function defaultFromDate(): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - 29);
  return d.toISOString().slice(0, 10);
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function posthogReplayUrl(): string | null {
  const key = process.env.NEXT_PUBLIC_POSTHOG_KEY?.trim();
  if (!key) return null;
  const host = (process.env.NEXT_PUBLIC_POSTHOG_HOST?.trim() || 'https://us.i.posthog.com').replace(
    /\/$/,
    '',
  );
  return `${host}/replay`;
}

export function BookingFunnelAnalyticsDashboard({ billingMonth }: { billingMonth: string }) {
  const [from, setFrom] = useState(defaultFromDate);
  const [to, setTo] = useState(todayIso);
  const [funnel, setFunnel] = useState<FunnelStep[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const replayUrl = posthogReplayUrl();

  const fetchFunnel = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ from, to, granularity: 'daily', month: billingMonth });
      const res = await fetch(`/api/admin/analytics/details?${params}`, {
        credentials: 'same-origin',
      });
      const json = (await res.json()) as {
        ok: boolean;
        data?: { funnel: FunnelStep[] };
        error?: string;
      };
      if (!json.ok) {
        setError(json.error ?? 'Could not load funnel');
        setFunnel([]);
        return;
      }
      setFunnel(json.data?.funnel ?? []);
      setError(null);
    } catch {
      setError('Network error loading funnel');
      setFunnel([]);
    } finally {
      setLoading(false);
    }
  }, [billingMonth, from, to]);

  useEffect(() => {
    void fetchFunnel();
  }, [fetchFunnel]);

  return (
    <section className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-sm font-semibold text-white">Booking funnel analytics</h2>
          <p className="text-xs text-apg-silver">
            Conversion between each booking step · mirrored to PostHog (no sensitive PII).
          </p>
        </div>
        {replayUrl ? (
          <Link
            href={replayUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex shrink-0 items-center justify-center rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs font-semibold text-white transition hover:border-[#FF5A1F]/40 hover:text-[#FF5A1F]"
          >
            PostHog session replay →
          </Link>
        ) : null}
      </div>

      <div className="rounded-2xl border border-white/10 bg-[#1A1F27] p-5">
        <div className="mb-4 flex flex-wrap items-end gap-3">
          <label className="text-xs text-apg-silver">
            From
            <input
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              className="mt-1 block rounded-lg border border-white/10 bg-black/20 px-2 py-1.5 text-sm text-white"
            />
          </label>
          <label className="text-xs text-apg-silver">
            To
            <input
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className="mt-1 block rounded-lg border border-white/10 bg-black/20 px-2 py-1.5 text-sm text-white"
            />
          </label>
        </div>

        {loading ? (
          <p className="text-sm text-apg-silver">Loading funnel…</p>
        ) : error ? (
          <p className="text-sm text-rose-300">{error}</p>
        ) : funnel.length === 0 ? (
          <p className="text-sm text-apg-silver">No funnel data for this range yet.</p>
        ) : (
          <ul className="space-y-2">
            {funnel.map((step, index) => (
              <li
                key={step.key}
                className="flex flex-col gap-1 rounded-lg border border-white/5 bg-white/[0.02] px-3 py-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="flex items-center gap-3">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#FF5A1F]/15 text-xs font-bold text-[#FF5A1F]">
                    {index + 1}
                  </span>
                  <span className="text-sm font-medium text-white">{step.label}</span>
                </div>
                <div className="flex items-baseline gap-3 pl-10 sm:pl-0">
                  <span className="text-lg font-semibold text-emerald-300">
                    {step.count.toLocaleString('en-IN')}
                  </span>
                  {step.conversionPct != null ? (
                    <span className="text-xs text-apg-silver">
                      {step.conversionPct}% from previous step
                    </span>
                  ) : (
                    <span className="text-xs text-apg-silver">Entry step</span>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
