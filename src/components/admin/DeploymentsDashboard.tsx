'use client';

import { useCallback, useEffect, useState } from 'react';
import { Badge } from '@/src/components/admin/Badge';
import { Card, CardBody, CardHeader } from '@/src/components/admin/Card';
import { Table, TBody, TD, TH, THead, TR } from '@/src/components/admin/Table';

type DashboardData = {
  tracker: {
    latestDeploymentId: string | null;
    lastStableDeploymentId: string | null;
    status: string;
  };
  vercelConfigured: boolean;
  vercelLatest: { id: string; url: string; state: string } | null;
  vercelRecent: Array<{ id: string; url: string; state: string; createdAt: number }>;
  events: Array<{
    id: number;
    deploymentId: string;
    status: string;
    errorSummary: string | null;
    createdAt: string;
  }>;
  lastRollback: {
    deploymentId: string;
    errorSummary: string | null;
    createdAt: string;
  } | null;
};

function toneForDeployStatus(status: string): 'emerald' | 'amber' | 'rose' | 'zinc' {
  if (status === 'stable') return 'emerald';
  if (status === 'checking' || status === 'rolling_back') return 'amber';
  if (status === 'failed') return 'rose';
  return 'zinc';
}

export function DeploymentsDashboard({
  initial,
  initialError,
}: {
  initial: DashboardData | null;
  initialError?: string | null;
}) {
  const [data, setData] = useState<DashboardData | null>(initial);
  const [error, setError] = useState(initialError ?? null);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/deployments', { cache: 'no-store' });
      const json = (await res.json()) as { ok: boolean; data?: DashboardData; error?: string };
      if (!res.ok || !json.ok || !json.data) {
        setError(json.error ?? 'Failed to load deployments');
        return;
      }
      setData(json.data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load deployments');
    }
  }, []);

  useEffect(() => {
    const id = setInterval(() => void refresh(), 30_000);
    return () => clearInterval(id);
  }, [refresh]);

  if (error && !data) {
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
        {error}
      </div>
    );
  }

  if (!data) return <p className="text-sm text-zinc-500">Loading…</p>;

  return (
    <div className="space-y-6">
      {!data.vercelConfigured ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          <p className="font-semibold">Vercel API not configured</p>
          <p className="mt-1">
            Set <code className="rounded bg-amber-100 px-1">VERCEL_TOKEN</code> and{' '}
            <code className="rounded bg-amber-100 px-1">VERCEL_PROJECT_ID</code> to enable
            auto-rollback.
          </p>
        </div>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardBody className="p-4">
            <p className="text-xs uppercase tracking-wide text-zinc-500">Watchdog status</p>
            <div className="mt-2">
              <Badge tone={toneForDeployStatus(data.tracker.status)}>{data.tracker.status}</Badge>
            </div>
          </CardBody>
        </Card>
        <Card>
          <CardBody className="p-4">
            <p className="text-xs uppercase tracking-wide text-zinc-500">Latest deployment</p>
            <p className="mt-2 font-mono text-xs text-zinc-900">
              {data.tracker.latestDeploymentId ?? data.vercelLatest?.id ?? '—'}
            </p>
          </CardBody>
        </Card>
        <Card>
          <CardBody className="p-4">
            <p className="text-xs uppercase tracking-wide text-zinc-500">Last stable</p>
            <p className="mt-2 font-mono text-xs text-zinc-900">
              {data.tracker.lastStableDeploymentId ?? '—'}
            </p>
          </CardBody>
        </Card>
      </div>

      {data.lastRollback ? (
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-900">
          <p className="font-semibold">Last rollback</p>
          <p className="mt-1 font-mono text-xs">{data.lastRollback.deploymentId}</p>
          <p className="mt-2">{data.lastRollback.errorSummary ?? 'No summary'}</p>
          <p className="mt-1 text-xs opacity-70">
            {new Date(data.lastRollback.createdAt).toLocaleString()}
          </p>
        </div>
      ) : null}

      <Card>
        <CardHeader title="Deployment timeline" description="Stable / failed / rollback events" />
        <CardBody className="p-0">
          <Table>
            <THead>
              <TR>
                <TH>Time</TH>
                <TH>Deployment</TH>
                <TH>Status</TH>
                <TH>Summary</TH>
              </TR>
            </THead>
            <TBody>
              {data.events.length === 0 ? (
                <TR>
                  <TD colSpan={4} className="text-center text-zinc-500">
                    No deployment events yet. Connect the Vercel deploy webhook.
                  </TD>
                </TR>
              ) : (
                data.events.map((row) => (
                  <TR key={row.id}>
                    <TD className="whitespace-nowrap font-mono text-xs">
                      {new Date(row.createdAt).toLocaleString()}
                    </TD>
                    <TD className="font-mono text-xs">{row.deploymentId.slice(0, 12)}…</TD>
                    <TD>
                      <Badge tone={toneForDeployStatus(row.status)}>{row.status}</Badge>
                    </TD>
                    <TD className="max-w-lg truncate text-xs text-zinc-600">
                      {row.errorSummary ?? '—'}
                    </TD>
                  </TR>
                ))
              )}
            </TBody>
          </Table>
        </CardBody>
      </Card>

      {data.vercelRecent.length > 0 ? (
        <Card>
          <CardHeader title="Vercel production deployments" />
          <CardBody className="space-y-2 text-sm">
            {data.vercelRecent.map((d) => (
              <div
                key={d.id}
                className="flex items-center justify-between gap-2 rounded border border-zinc-100 px-3 py-2"
              >
                <span className="font-mono text-xs">{d.id.slice(0, 16)}…</span>
                <span className="text-xs text-zinc-500">{d.state}</span>
              </div>
            ))}
          </CardBody>
        </Card>
      ) : null}
    </div>
  );
}
