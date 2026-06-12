'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import type {
  FunnelStep,
  LiveVisitorsSnapshot,
  PageAnalyticsRow,
  VisitorChartPoint,
  VisitorCountSummary,
} from '@/src/services/visitorAnalytics';

type BreakdownRow = { label: string; count: number; pct: number };

type LocationBreakdown = {
  countries: BreakdownRow[];
  states: BreakdownRow[];
  cities: BreakdownRow[];
};

type DetailsData = {
  chart: VisitorChartPoint[];
  pages: PageAnalyticsRow[];
  funnel: FunnelStep[];
  sources: BreakdownRow[];
  devices: BreakdownRow[];
  locations: LocationBreakdown;
};

function formatTs(iso: string | null): string {
  if (!iso) return '—';
  return new Intl.DateTimeFormat('en-IN', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(iso));
}

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return s > 0 ? `${m}m ${s}s` : `${m}m`;
}

function defaultFromDate(): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - 29);
  return d.toISOString().slice(0, 10);
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function VisitorBarChart({ points }: { points: VisitorChartPoint[] }) {
  const max = Math.max(...points.map((p) => p.visitors), 1);

  if (points.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-apg-silver">
        No visitor data for this range yet.
      </p>
    );
  }

  return (
    <div className="flex h-44 items-end gap-1 overflow-x-auto pb-2">
      {points.map((p) => {
        const h = Math.max(4, Math.round((p.visitors / max) * 100));
        const label = p.label.slice(0, 10);
        return (
          <div
            key={p.label}
            className="flex min-w-[2rem] flex-1 flex-col items-center gap-1"
            title={`${p.label}: ${p.visitors} visitors`}
          >
            <span className="text-[10px] text-apg-silver">{p.visitors}</span>
            <div
              className="w-full rounded-t bg-[#FF5A1F]/80 transition hover:bg-[#FF5A1F]"
              style={{ height: `${h}%` }}
            />
            <span className="max-w-full truncate text-[9px] text-apg-silver">{label}</span>
          </div>
        );
      })}
    </div>
  );
}

function BreakdownList({ rows, emptyLabel }: { rows: BreakdownRow[]; emptyLabel: string }) {
  if (rows.length === 0) {
    return <p className="text-sm text-apg-silver">{emptyLabel}</p>;
  }
  return (
    <ul className="space-y-2">
      {rows.map((r) => (
        <li key={r.label} className="flex items-center justify-between gap-3 text-sm">
          <span className="capitalize text-white">{r.label}</span>
          <span className="shrink-0 text-apg-silver">
            {r.count} <span className="text-[#FF5A1F]">({r.pct}%)</span>
          </span>
        </li>
      ))}
    </ul>
  );
}

function Panel({
  title,
  description,
  children,
  className = '',
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`rounded-2xl border border-white/10 bg-[#1A1F27] p-5 ${className}`}>
      <div className="mb-4">
        <h3 className="text-sm font-semibold text-white">{title}</h3>
        {description ? <p className="text-xs text-apg-silver">{description}</p> : null}
      </div>
      {children}
    </div>
  );
}

export function VisitorAnalyticsDashboard({
  initialVisitors,
  billingMonth,
}: {
  initialVisitors: VisitorCountSummary;
  billingMonth: string;
}) {
  const [visitors] = useState(initialVisitors);
  const [live, setLive] = useState<LiveVisitorsSnapshot | null>(null);
  const [liveError, setLiveError] = useState<string | null>(null);
  const [liveLoading, setLiveLoading] = useState(true);

  const [from, setFrom] = useState(defaultFromDate);
  const [to, setTo] = useState(todayIso);
  const [granularity, setGranularity] = useState<'daily' | 'weekly' | 'monthly'>('daily');
  const [details, setDetails] = useState<DetailsData | null>(null);
  const [detailsError, setDetailsError] = useState<string | null>(null);
  const [detailsLoading, setDetailsLoading] = useState(true);

  const fetchLive = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/analytics/live', { credentials: 'same-origin' });
      const json = (await res.json()) as { ok: boolean; data?: LiveVisitorsSnapshot; error?: string };
      if (!json.ok) {
        setLiveError(json.error ?? 'Could not load live visitors');
        return;
      }
      setLive(json.data ?? null);
      setLiveError(null);
    } catch {
      setLiveError('Network error loading live visitors');
    } finally {
      setLiveLoading(false);
    }
  }, []);

  const fetchDetails = useCallback(async () => {
    setDetailsLoading(true);
    try {
      const params = new URLSearchParams({ from, to, granularity, month: billingMonth });
      const res = await fetch(`/api/admin/analytics/details?${params}`, {
        credentials: 'same-origin',
      });
      const json = (await res.json()) as { ok: boolean; data?: DetailsData; error?: string };
      if (!json.ok) {
        setDetailsError(json.error ?? 'Could not load analytics');
        setDetails(null);
        return;
      }
      setDetails(json.data ?? null);
      setDetailsError(null);
    } catch {
      setDetailsError('Network error loading analytics');
      setDetails(null);
    } finally {
      setDetailsLoading(false);
    }
  }, [billingMonth, from, granularity, to]);

  useEffect(() => {
    void fetchLive();
    const id = window.setInterval(() => void fetchLive(), 30_000);
    return () => window.clearInterval(id);
  }, [fetchLive]);

  useEffect(() => {
    void fetchDetails();
  }, [fetchDetails]);

  const visitorCards = useMemo(
    () => [
      { label: 'Today', value: visitors.today },
      { label: 'This week', value: visitors.week },
      { label: 'This month', value: visitors.month },
      { label: 'All time', value: visitors.allTime },
    ],
    [visitors],
  );

  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-sm font-semibold text-white">Website visitor analytics</h2>
        <p className="text-xs text-apg-silver">
          Anonymous session tracking — no passwords, Aadhaar, or sensitive PII stored.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {visitorCards.map((c) => (
          <div
            key={c.label}
            className="rounded-xl border border-white/10 bg-[#1A1F27] p-4"
          >
            <p className="text-[10px] font-medium uppercase tracking-wide text-apg-silver">
              {c.label}
            </p>
            <p className="mt-2 text-2xl font-semibold text-white">
              {c.value.toLocaleString('en-IN')}
            </p>
          </div>
        ))}
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <Panel
          title="Live visitors"
          description="Sessions active in the last 5 minutes · refreshes every 30s"
        >
          {liveLoading && !live ? (
            <p className="text-sm text-apg-silver">Loading…</p>
          ) : liveError ? (
            <p className="text-sm text-rose-300">{liveError}</p>
          ) : (
            <div className="space-y-4">
              <div className="flex items-baseline gap-3">
                <span className="text-4xl font-bold text-[#FF5A1F]">{live?.count ?? 0}</span>
                <span className="text-sm text-apg-silver">on site now</span>
              </div>
              <p className="text-xs text-apg-silver">
                Last activity: {formatTs(live?.lastActivityAt ?? null)}
              </p>
              {live && live.pages.length > 0 ? (
                <ul className="space-y-1.5 border-t border-white/5 pt-3">
                  {live.pages.map((p) => (
                    <li
                      key={p.path}
                      className="flex items-center justify-between gap-2 text-xs"
                    >
                      <span className="truncate text-white">
                        {p.pageKey}
                        <span className="ml-1 text-apg-silver">({p.path})</span>
                      </span>
                      <span className="shrink-0 font-medium text-emerald-300">{p.count}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-xs text-apg-silver">No active page views right now.</p>
              )}
            </div>
          )}
        </Panel>

        <div className="xl:col-span-2">
          <Panel title="Visitor trends" description="Unique sessions by period">
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
              <label className="text-xs text-apg-silver">
                Granularity
                <select
                  value={granularity}
                  onChange={(e) =>
                    setGranularity(e.target.value as 'daily' | 'weekly' | 'monthly')
                  }
                  className="mt-1 block rounded-lg border border-white/10 bg-black/20 px-2 py-1.5 text-sm text-white"
                >
                  <option value="daily">Daily</option>
                  <option value="weekly">Weekly</option>
                  <option value="monthly">Monthly</option>
                </select>
              </label>
            </div>
            {detailsLoading && !details ? (
              <p className="text-sm text-apg-silver">Loading chart…</p>
            ) : detailsError ? (
              <p className="text-sm text-rose-300">{detailsError}</p>
            ) : (
              <VisitorBarChart points={details?.chart ?? []} />
            )}
          </Panel>
        </div>
      </div>

      {detailsLoading && !details ? (
        <p className="text-sm text-apg-silver">Loading breakdowns…</p>
      ) : detailsError ? null : details ? (
        <div className="grid gap-4 xl:grid-cols-2">
          <Panel title="Page analytics" description="Views, unique visitors, avg time on page">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-white/10 text-apg-silver">
                    <th className="pb-2 pr-3 font-medium">Page</th>
                    <th className="pb-2 pr-3 font-medium">Views</th>
                    <th className="pb-2 pr-3 font-medium">Unique</th>
                    <th className="pb-2 font-medium">Avg time</th>
                  </tr>
                </thead>
                <tbody>
                  {details.pages.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="py-4 text-apg-silver">
                        No page views in range.
                      </td>
                    </tr>
                  ) : (
                    details.pages.map((p) => (
                      <tr key={p.pageKey} className="border-b border-white/5">
                        <td className="py-2 pr-3 font-medium text-white">{p.pageKey}</td>
                        <td className="py-2 pr-3 text-apg-silver">{p.views}</td>
                        <td className="py-2 pr-3 text-apg-silver">{p.uniqueVisitors}</td>
                        <td className="py-2 text-apg-silver">
                          {formatDuration(p.avgDurationSeconds)}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </Panel>

          <Panel title="Booking funnel" description="Conversion % from previous step">
            <ul className="space-y-2">
              {details.funnel.map((step) => (
                <li
                  key={step.key}
                  className="flex items-center justify-between gap-3 rounded-lg border border-white/5 bg-white/[0.02] px-3 py-2 text-sm"
                >
                  <span className="text-white">{step.label}</span>
                  <span className="shrink-0 text-right">
                    <span className="font-semibold text-emerald-300">{step.count}</span>
                    {step.conversionPct != null ? (
                      <span className="ml-2 text-xs text-apg-silver">
                        {step.conversionPct}%
                      </span>
                    ) : null}
                  </span>
                </li>
              ))}
            </ul>
          </Panel>

          <Panel title="Traffic sources">
            <BreakdownList rows={details.sources} emptyLabel="No traffic data yet." />
          </Panel>

          <Panel title="Device analytics">
            <BreakdownList rows={details.devices} emptyLabel="No device data yet." />
          </Panel>

          <Panel title="Location — top countries" className="xl:col-span-1">
            <BreakdownList
              rows={details.locations.countries}
              emptyLabel="Geo headers unavailable or no data."
            />
          </Panel>

          <Panel title="Location — top states & cities">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <p className="mb-2 text-[10px] font-medium uppercase text-apg-silver">States</p>
                <BreakdownList
                  rows={details.locations.states}
                  emptyLabel="No state data."
                />
              </div>
              <div>
                <p className="mb-2 text-[10px] font-medium uppercase text-apg-silver">Cities</p>
                <BreakdownList
                  rows={details.locations.cities}
                  emptyLabel="No city data."
                />
              </div>
            </div>
          </Panel>
        </div>
      ) : null}
    </section>
  );
}
