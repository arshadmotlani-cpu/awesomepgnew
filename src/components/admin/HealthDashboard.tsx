'use client';

import { useCallback, useEffect, useState } from 'react';
import { Badge } from '@/src/components/admin/Badge';
import { Card, CardBody, CardHeader } from '@/src/components/admin/Card';
import { IntegrationsDiagnostics } from '@/src/components/admin/IntegrationsDiagnostics';
import { Table, TBody, TD, TH, THead, TR } from '@/src/components/admin/Table';
import type { IntegrationsHealthSummary } from '@/src/lib/integrations/status';

type HealthPayload = {
  status: string;
  dbStatus: string;
  envStatus: string;
  degradedMode: boolean;
  dbDegradedMode: boolean;
  safeMode: boolean;
  lastError: string | null;
  lastRecoveredAt: string | null;
  consecutiveFailures: number;
  retryHistory: Array<{ at: string; action: string; ok: boolean; detail?: string }>;
  env: {
    ok: boolean;
    missing: string[];
    degradedFeatures: string[];
    blobPrivateConfigured?: boolean;
    blobPublicConfigured?: boolean;
    kycUploadsAvailable?: boolean;
    integrations?: IntegrationsHealthSummary;
  };
  persisted: {
    status: string;
    dbStatus: string;
    envStatus: string;
    lastError: string | null;
    updatedAt: string;
  } | null;
};

function toneForStatus(status: string): 'emerald' | 'amber' | 'rose' {
  if (status === 'HEALTHY') return 'emerald';
  if (status === 'DEGRADED') return 'amber';
  return 'rose';
}

export function HealthDashboard({
  initial,
  initialError,
}: {
  initial: HealthPayload | null;
  initialError?: string | null;
}) {
  const [data, setData] = useState<HealthPayload | null>(initial);
  const [error, setError] = useState(initialError ?? null);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/health', { cache: 'no-store' });
      const json = (await res.json()) as { ok: boolean; data?: HealthPayload; error?: string };
      if (!res.ok || !json.ok || !json.data) {
        setError(json.error ?? 'Failed to load health data');
        return;
      }
      setData(json.data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load health data');
    }
  }, []);

  useEffect(() => {
    const id = setInterval(() => void refresh(), 60_000);
    return () => clearInterval(id);
  }, [refresh]);

  if (error && !data) {
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
        {error}
      </div>
    );
  }

  if (!data) return <p className="text-sm text-zinc-500">Loading health…</p>;

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardBody className="p-4">
            <p className="text-xs uppercase tracking-wide text-zinc-500">System</p>
            <div className="mt-2 flex items-center gap-2">
              <Badge tone={toneForStatus(data.status)}>{data.status}</Badge>
              {data.safeMode ? <Badge tone="rose">SAFE MODE</Badge> : null}
            </div>
          </CardBody>
        </Card>
        <Card>
          <CardBody className="p-4">
            <p className="text-xs uppercase tracking-wide text-zinc-500">Database</p>
            <p className="mt-2 text-lg font-semibold capitalize text-zinc-900">{data.dbStatus}</p>
          </CardBody>
        </Card>
        <Card>
          <CardBody className="p-4">
            <p className="text-xs uppercase tracking-wide text-zinc-500">Environment</p>
            <p className="mt-2 text-lg font-semibold capitalize text-zinc-900">{data.envStatus}</p>
          </CardBody>
        </Card>
      </div>

      {data.lastError ? (
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-900">
          <p className="font-semibold">Last error</p>
          <p className="mt-1 font-mono text-xs">{data.lastError}</p>
          {data.lastRecoveredAt ? (
            <p className="mt-2 text-xs">Last recovery: {new Date(data.lastRecoveredAt).toLocaleString()}</p>
          ) : null}
        </div>
      ) : null}

      {data.env.missing.length > 0 ? (
        <Card>
          <CardHeader title="Missing environment variables" />
          <CardBody>
            <ul className="list-inside list-disc text-sm text-zinc-700">
              {data.env.missing.map((key) => (
                <li key={key} className="font-mono">
                  {key}
                </li>
              ))}
            </ul>
          </CardBody>
        </Card>
      ) : null}

      {data.env.integrations ? (
        <IntegrationsDiagnostics
          integrations={data.env.integrations}
          databaseStatus={data.dbStatus}
        />
      ) : null}

      <Card>
        <CardHeader
          title="Retry history"
          description={`${data.consecutiveFailures} consecutive failures · auto-recovery every ~45s`}
        />
        <CardBody className="p-0">
          <Table>
            <THead>
              <TR>
                <TH>Time</TH>
                <TH>Action</TH>
                <TH>Result</TH>
                <TH>Detail</TH>
              </TR>
            </THead>
            <TBody>
              {data.retryHistory.length === 0 ? (
                <TR>
                  <TD colSpan={4} className="text-center text-zinc-500">
                    No retries recorded yet.
                  </TD>
                </TR>
              ) : (
                data.retryHistory.map((row) => (
                  <TR key={`${row.at}-${row.action}`}>
                    <TD className="font-mono text-xs">{new Date(row.at).toLocaleTimeString()}</TD>
                    <TD className="font-mono text-xs">{row.action}</TD>
                    <TD>
                      <Badge tone={row.ok ? 'emerald' : 'rose'}>{row.ok ? 'ok' : 'fail'}</Badge>
                    </TD>
                    <TD className="max-w-md truncate text-xs text-zinc-600">{row.detail ?? '—'}</TD>
                  </TR>
                ))
              )}
            </TBody>
          </Table>
        </CardBody>
      </Card>
    </div>
  );
}
