'use client';

import { useCallback, useEffect, useState } from 'react';
import { Badge } from '@/src/components/admin/Badge';
import { Card, CardBody, CardHeader } from '@/src/components/admin/Card';
import { Table, TBody, TD, TH, THead, TR } from '@/src/components/admin/Table';
import type { RuntimeDiagnosticsSnapshot } from '@/src/lib/monitoring/runtimeDiagnostics';

type Props = {
  initial: RuntimeDiagnosticsSnapshot | null;
  initialError?: string | null;
};

function StatTile({ label, value }: { label: string; value: string | number | null }) {
  return (
    <div className="rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2">
      <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">{label}</p>
      <p className="mt-1 text-lg font-semibold tabular-nums text-zinc-900">
        {value ?? '—'}
      </p>
    </div>
  );
}

function RankedTable({
  title,
  rows,
  valueLabel,
}: {
  title: string;
  rows: RuntimeDiagnosticsSnapshot['queries']['slowest'];
  valueLabel: string;
}) {
  if (rows.length === 0) {
    return (
      <div>
        <p className="mb-2 text-sm font-medium text-zinc-700">{title}</p>
        <p className="text-sm text-zinc-500">No data yet — metrics accumulate in-process.</p>
      </div>
    );
  }

  return (
    <div>
      <p className="mb-2 text-sm font-medium text-zinc-700">{title}</p>
      <Table>
        <THead>
          <TR>
            <TH>Name</TH>
            <TH>Count</TH>
            <TH>Avg (ms)</TH>
            <TH>{valueLabel}</TH>
          </TR>
        </THead>
        <TBody>
          {rows.map((row) => (
            <TR key={row.key}>
              <TD className="max-w-xs truncate font-mono text-xs">{row.key}</TD>
              <TD>{row.count}</TD>
              <TD>{row.avgMs}</TD>
              <TD>{valueLabel === 'Max (ms)' ? row.maxMs : row.count}</TD>
            </TR>
          ))}
        </TBody>
      </Table>
    </div>
  );
}

export function CacheDiagnosticsPanel({ initial, initialError }: Props) {
  const [data, setData] = useState<RuntimeDiagnosticsSnapshot | null>(initial);
  const [error, setError] = useState<string | null>(initialError ?? null);
  const [loading, setLoading] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/cache-diagnostics', { cache: 'no-store' });
      const json = (await res.json()) as {
        ok: boolean;
        data?: RuntimeDiagnosticsSnapshot;
        error?: string;
      };
      if (!res.ok || !json.ok || !json.data) {
        setError(json.error ?? 'Failed to load cache diagnostics');
        return;
      }
      setData(json.data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load cache diagnostics');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const id = setInterval(() => {
      void fetchData();
    }, 60_000);
    return () => clearInterval(id);
  }, [fetchData]);

  if (error && !data) {
    return (
      <Card>
        <CardHeader title="Redis & runtime diagnostics" />
        <CardBody>
          <p className="text-sm text-amber-800">{error}</p>
        </CardBody>
      </Card>
    );
  }

  if (!data) {
    return (
      <Card>
        <CardHeader title="Redis & runtime diagnostics" />
        <CardBody>
          <p className="text-sm text-zinc-500">Loading diagnostics…</p>
        </CardBody>
      </Card>
    );
  }

  const { cache } = data;

  return (
    <Card>
      <CardHeader
        title="Redis & runtime diagnostics"
        actions={
          <div className="flex items-center gap-2">
            {loading ? <span className="text-xs text-zinc-400">Refreshing…</span> : null}
            <Badge tone={data.redisConfigured ? 'emerald' : 'zinc'}>
              {data.redisConfigured ? 'Redis configured' : 'Redis optional (DB fallback)'}
            </Badge>
          </div>
        }
      />
      <CardBody className="space-y-6">
        <p className="text-sm text-zinc-600">
          In-process counters since last deploy. Uptime: {data.processUptimeSeconds}s. Use this to
          measure cache hit rate and find slow DB queries without Vercel log diving.
        </p>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <StatTile label="Cache hits" value={cache.totals.hits} />
          <StatTile label="Cache misses" value={cache.totals.misses} />
          <StatTile
            label="Hit rate"
            value={
              cache.hitRatePercent != null ? `${cache.hitRatePercent.toFixed(1)}%` : null
            }
          />
          <StatTile label="Cache bypass (no Redis)" value={cache.totals.bypass} />
          <StatTile label="Redis errors" value={cache.totals.errors} />
          <StatTile label="DB fetches (cache layer)" value={cache.totals.dbFetches} />
          <StatTile
            label="Avg DB query (ms)"
            value={data.queries.avgDurationMs}
          />
          <StatTile
            label="Avg endpoint (ms)"
            value={data.endpoints.avgDurationMs}
          />
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          <RankedTable
            title="Slowest DB queries"
            rows={data.queries.slowest}
            valueLabel="Max (ms)"
          />
          <RankedTable
            title="Most frequent DB queries"
            rows={data.queries.mostFrequent}
            valueLabel="Count"
          />
          <RankedTable
            title="Slowest endpoints"
            rows={data.endpoints.slowest}
            valueLabel="Max (ms)"
          />
          <RankedTable
            title="Most queried endpoints"
            rows={data.endpoints.mostFrequent}
            valueLabel="Count"
          />
        </div>
      </CardBody>
    </Card>
  );
}
