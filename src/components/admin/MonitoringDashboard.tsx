'use client';

import { useCallback, useEffect, useState } from 'react';
import { Badge } from '@/src/components/admin/Badge';
import { Card, CardBody, CardHeader } from '@/src/components/admin/Card';
import { Table, TBody, TD, TH, THead, TR } from '@/src/components/admin/Table';
import type { MonitoringSnapshot } from '@/src/db/queries/monitoring';

const LEVELS = ['all', 'info', 'warn', 'error', 'db', 'api'] as const;

type Props = {
  initial: MonitoringSnapshot | null;
  initialError?: string | null;
};

function toneForLevel(level: string): 'zinc' | 'amber' | 'rose' | 'emerald' | 'indigo' {
  if (level === 'error') return 'rose';
  if (level === 'warn') return 'amber';
  if (level === 'db') return 'indigo';
  if (level === 'api') return 'emerald';
  return 'zinc';
}

export function MonitoringDashboard({ initial, initialError }: Props) {
  const [data, setData] = useState<MonitoringSnapshot | null>(initial);
  const [error, setError] = useState<string | null>(initialError ?? null);
  const [level, setLevel] = useState<string>('all');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (level !== 'all') params.set('level', level);
      if (search.trim()) params.set('search', search.trim());
      const res = await fetch(`/api/admin/monitoring?${params.toString()}`, {
        cache: 'no-store',
      });
      const json = (await res.json()) as {
        ok: boolean;
        data?: MonitoringSnapshot;
        error?: string;
      };
      if (!res.ok || !json.ok || !json.data) {
        setError(json.error ?? 'Failed to load monitoring data');
        return;
      }
      setData(json.data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load monitoring data');
    } finally {
      setLoading(false);
    }
  }, [level, search]);

  useEffect(() => {
    const id = setInterval(() => {
      void fetchData();
    }, 8_000);
    return () => clearInterval(id);
  }, [fetchData]);

  if (error && !data) {
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
        <p className="font-semibold">Monitoring unavailable</p>
        <p className="mt-1">{error}</p>
      </div>
    );
  }

  if (!data) {
    return <p className="text-sm text-zinc-500">Loading monitoring data…</p>;
  }

  const successRate =
    data.traffic.requestsLastHour > 0
      ? Math.round((data.traffic.successCount / data.traffic.requestsLastHour) * 100)
      : 100;

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardBody className="p-4">
            <p className="text-xs uppercase tracking-wide text-zinc-500">Requests / hour</p>
            <p className="mt-1 text-2xl font-semibold text-zinc-900">
              {data.traffic.requestsLastHour}
            </p>
            <p className="mt-1 text-xs text-zinc-500">
              ~{data.traffic.requestsPerMinute}/min
            </p>
          </CardBody>
        </Card>
        <Card>
          <CardBody className="p-4">
            <p className="text-xs uppercase tracking-wide text-zinc-500">Success rate</p>
            <p className="mt-1 text-2xl font-semibold text-emerald-700">{successRate}%</p>
            <p className="mt-1 text-xs text-zinc-500">
              {data.traffic.failureCount} failures
            </p>
          </CardBody>
        </Card>
        <Card>
          <CardBody className="p-4">
            <p className="text-xs uppercase tracking-wide text-zinc-500">Slow requests</p>
            <p className="mt-1 text-2xl font-semibold text-amber-700">
              {data.slowRequests.length}
            </p>
            <p className="mt-1 text-xs text-zinc-500">&gt;500ms</p>
          </CardBody>
        </Card>
        <Card>
          <CardBody className="p-4">
            <p className="text-xs uppercase tracking-wide text-zinc-500">Slow DB queries</p>
            <p className="mt-1 text-2xl font-semibold text-indigo-700">
              {data.slowQueries.length}
            </p>
            <p className="mt-1 text-xs text-zinc-500">&gt;200ms</p>
          </CardBody>
        </Card>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-xs font-medium uppercase tracking-wide text-zinc-500">Level</span>
          <select
            className="rounded-lg border border-zinc-200 bg-white px-3 py-2"
            value={level}
            onChange={(e) => setLevel(e.target.value)}
          >
            {LEVELS.map((l) => (
              <option key={l} value={l}>
                {l}
              </option>
            ))}
          </select>
        </label>
        <label className="flex min-w-0 flex-1 flex-col gap-1 text-sm">
          <span className="text-xs font-medium uppercase tracking-wide text-zinc-500">
            Search route / requestId
          </span>
          <input
            className="rounded-lg border border-zinc-200 bg-white px-3 py-2"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="/pgs, /api/health, uuid…"
          />
        </label>
        <button
          type="button"
          onClick={() => void fetchData()}
          className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800"
        >
          {loading ? 'Refreshing…' : 'Refresh'}
        </button>
      </div>

      <Card>
        <CardHeader
          title="Live logs"
          description="Polling every 8 seconds · last hour"
          actions={<Badge tone="emerald">Live</Badge>}
        />
        <CardBody className="p-0">
          <Table>
            <THead>
              <TR>
                <TH>Time</TH>
                <TH>Level</TH>
                <TH>Route</TH>
                <TH>Message</TH>
                <TH>Request</TH>
              </TR>
            </THead>
            <TBody>
              {data.logs.length === 0 ? (
                <TR>
                  <TD colSpan={5} className="text-center text-zinc-500">
                    No logs yet — traffic will appear here.
                  </TD>
                </TR>
              ) : (
                data.logs.map((log) => (
                  <TR key={log.id}>
                    <TD className="whitespace-nowrap font-mono text-xs">
                      {new Date(log.createdAt).toLocaleTimeString()}
                    </TD>
                    <TD>
                      <Badge tone={toneForLevel(log.level)}>{log.level}</Badge>
                    </TD>
                    <TD className="font-mono text-xs">{log.route ?? '—'}</TD>
                    <TD className="max-w-md truncate text-xs">{log.message}</TD>
                    <TD className="font-mono text-xs">{log.requestId?.slice(0, 8) ?? '—'}</TD>
                  </TR>
                ))
              )}
            </TBody>
          </Table>
        </CardBody>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title="Errors" description="Grouped by message · last hour" />
          <CardBody className="space-y-3">
            {data.errors.length === 0 ? (
              <p className="text-sm text-zinc-500">No errors recorded.</p>
            ) : (
              data.errors.map((err) => (
                <div key={err.message} className="rounded-lg border border-rose-100 bg-rose-50/50 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-medium text-rose-900">{err.message}</p>
                    <Badge tone="rose">{err.count}×</Badge>
                  </div>
                  {err.latestStack ? (
                    <pre className="mt-2 max-h-24 overflow-auto text-xs text-rose-800">
                      {err.latestStack}
                    </pre>
                  ) : null}
                </div>
              ))
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Recent audit trail" description="Business actions from audit_log" />
          <CardBody className="space-y-2">
            {data.auditTrail.length === 0 ? (
              <p className="text-sm text-zinc-500">No audit entries yet.</p>
            ) : (
              data.auditTrail.map((entry) => (
                <div
                  key={entry.id}
                  className="flex items-center justify-between gap-2 rounded-lg border border-zinc-100 px-3 py-2 text-sm"
                >
                  <span>
                    <span className="font-medium">{entry.action}</span>
                    <span className="text-zinc-500"> · {entry.entity}</span>
                  </span>
                  <span className="font-mono text-xs text-zinc-500">
                    {new Date(entry.createdAt).toLocaleTimeString()}
                  </span>
                </div>
              ))
            )}
          </CardBody>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title="Slow requests" description="API/page requests &gt;500ms" />
          <CardBody className="space-y-2 text-sm">
            {data.slowRequests.map((row, i) => (
              <div key={`${row.requestId}-${i}`} className="flex justify-between gap-2 rounded border border-zinc-100 px-3 py-2">
                <span className="font-mono text-xs">{row.route ?? '—'}</span>
                <span className="font-semibold text-amber-700">{row.latencyMs}ms</span>
              </div>
            ))}
            {data.slowRequests.length === 0 ? (
              <p className="text-zinc-500">No slow requests.</p>
            ) : null}
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Slow DB queries" description="Queries &gt;200ms" />
          <CardBody className="space-y-2 text-sm">
            {data.slowQueries.map((row, i) => (
              <div key={`${row.query}-${i}`} className="rounded border border-zinc-100 px-3 py-2">
                <div className="flex justify-between gap-2">
                  <span className="truncate font-mono text-xs">{row.query}</span>
                  <span className="font-semibold text-indigo-700">{row.durationMs}ms</span>
                </div>
              </div>
            ))}
            {data.slowQueries.length === 0 ? (
              <p className="text-zinc-500">No slow queries.</p>
            ) : null}
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
