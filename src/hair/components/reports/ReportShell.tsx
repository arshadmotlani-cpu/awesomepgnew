import { ExportButton } from '@/src/hair/components/reports/ExportButton';
import type { FyhReportKey } from '@/src/hair/actions/reports';

export function ReportShell({
  title,
  subtitle,
  timezone,
  reportKey,
  children,
}: {
  title: string;
  subtitle?: string;
  timezone?: string;
  reportKey: FyhReportKey;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.22em] text-fyh-accent">Reports</p>
          <h1 className="fyh-display mt-1 text-3xl font-semibold">{title}</h1>
          {subtitle ? (
            <p className="mt-1 text-sm text-fyh-text-secondary">{subtitle}</p>
          ) : null}
          {timezone ? (
            <p className="mt-1 text-xs text-fyh-text-muted">Salon timezone: {timezone}</p>
          ) : null}
        </div>
        <ExportButton reportKey={reportKey} />
      </div>
      <div className="fyh-glass overflow-hidden">{children}</div>
    </div>
  );
}

export function ReportEmpty({ message }: { message: string }) {
  return <p className="px-6 py-10 text-center text-sm text-fyh-text-muted">{message}</p>;
}

export function ReportTable({
  headers,
  rows,
  truncated,
}: {
  headers: string[];
  rows: React.ReactNode[][];
  truncated?: boolean;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[480px] text-left text-sm" aria-label="Report data">
        <thead>
          <tr className="border-b border-[color:var(--fyh-border)] text-xs uppercase tracking-wide text-fyh-text-muted">
            {headers.map((h) => (
              <th key={h} className="px-4 py-3 font-medium">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-[color:var(--fyh-border)]">
          {rows.map((cells, i) => (
            <tr key={i}>
              {cells.map((cell, j) => (
                <td key={j} className="px-4 py-3 align-top">
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {truncated ? (
        <p className="border-t border-[color:var(--fyh-border)] px-4 py-3 text-xs text-fyh-text-muted">
          Showing the first 100 rows. Export CSV for the full dataset.
        </p>
      ) : null}
    </div>
  );
}
