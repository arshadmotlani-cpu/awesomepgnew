'use client';

import { useActionState, useRef, useState } from 'react';
import {
  exportHistoricalImportBatchAction,
  previewHistoricalImportAction,
  runHistoricalImportAction,
  type HistoricalImportActionState,
} from '@/src/hair/actions/historicalImport';
import { Button } from '@/src/hair/components/ui/button';
import { formatInrFromPaise } from '@/src/hair/lib/money';
import { SettingsPageHeader, SettingsSaveFeedback } from '@/src/hair/components/settings/SettingsNav';

const initial: HistoricalImportActionState = {};

export function HistoricalImportPanel() {
  const [previewState, previewAction, previewPending] = useActionState(
    previewHistoricalImportAction,
    initial,
  );
  const [importState, importAction, importPending] = useActionState(
    runHistoricalImportAction,
    initial,
  );
  const [force, setForce] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const summary = importState.summary ?? previewState.summary;

  async function downloadExport() {
    const batchId = importState.batchId;
    if (!batchId) return;
    const res = await exportHistoricalImportBatchAction(batchId);
    if (!res.ok || !res.base64) return;
    const bytes = Uint8Array.from(atob(res.base64), (c) => c.charCodeAt(0));
    const blob = new Blob([bytes], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = res.fileName ?? 'historical-import.xlsx';
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-8">
      <SettingsPageHeader
        eyebrow="Data"
        title="Historical sales import"
        description="Import past sales from Excel into paid invoices. No staff, commission, or inventory side effects."
      />

      <div className="fyh-glass space-y-4 p-6">
        <p className="text-sm text-fyh-text-secondary">
          Download the{' '}
          <a
            href="/fyh/imports/historical-sales-template.xlsx"
            className="text-fyh-accent underline"
          >
            Excel template
          </a>{' '}
          or the{' '}
          <a
            href="/fyh/imports/historical-sales-template.csv"
            className="text-fyh-accent underline"
          >
            CSV reference
          </a>
          . One row = one paid invoice. Re-importing the same file is safe (idempotent).
        </p>

        <input
          ref={fileRef}
          type="file"
          accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          className="block w-full text-sm text-fyh-text-secondary file:mr-4 file:rounded-lg file:border-0 file:bg-fyh-forest/30 file:px-4 file:py-2 file:text-sm file:font-medium file:text-fyh-accent"
          aria-label="Historical sales Excel file"
        />

        <label className="flex items-center gap-2 text-sm text-fyh-text-secondary">
          <input
            type="checkbox"
            checked={force}
            onChange={(e) => setForce(e.target.checked)}
            className="rounded border-[color:var(--fyh-border)]"
          />
          Force re-import even if this file was imported before
        </label>

        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="secondary"
            disabled={previewPending || importPending}
            onClick={() => {
              const input = fileRef.current;
              if (!input?.files?.[0]) return;
              const fd = new FormData();
              fd.set('file', input.files[0]);
              previewAction(fd);
            }}
          >
            {previewPending ? 'Previewing…' : 'Preview'}
          </Button>
          <Button
            type="button"
            disabled={previewPending || importPending}
            onClick={() => {
              const input = fileRef.current;
              if (!input?.files?.[0]) return;
              const fd = new FormData();
              fd.set('file', input.files[0]);
              if (force) fd.set('force', 'true');
              importAction(fd);
            }}
          >
            {importPending ? 'Importing…' : 'Import'}
          </Button>
          {importState.batchId ? (
            <Button type="button" variant="secondary" onClick={downloadExport}>
              Download export
            </Button>
          ) : null}
        </div>

        <SettingsSaveFeedback state={previewState} />
        <SettingsSaveFeedback state={importState} />
      </div>

      {summary ? (
        <div className="fyh-glass grid gap-3 p-6 sm:grid-cols-2 lg:grid-cols-4">
          <Stat label="Rows" value={String(summary.totalRows)} />
          <Stat label="Imported" value={String(summary.imported)} />
          <Stat label="Skipped" value={String(summary.skipped)} />
          <Stat label="Failed" value={String(summary.failed)} />
          <Stat label="Revenue" value={formatInrFromPaise(summary.totalRevenuePaise)} />
          <Stat label="GST" value={formatInrFromPaise(summary.totalGstPaise)} />
        </div>
      ) : null}

      {summary && summary.failedRows.length > 0 ? (
        <div className="fyh-glass overflow-hidden">
          <p className="border-b border-[color:var(--fyh-border)] px-4 py-3 text-sm font-medium">
            Failed rows
          </p>
          <ul className="divide-y divide-[color:var(--fyh-border)] text-sm">
            {summary.failedRows.map((f) => (
              <li key={`${f.rowNumber}-${f.rowKey ?? ''}`} className="px-4 py-2">
                Row {f.rowNumber}
                {f.rowKey ? ` · ${f.rowKey}` : ''}: {f.reason}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="fyh-kpi-label">{label}</p>
      <p className="mt-1 text-lg font-semibold tabular-nums text-fyh-text">{value}</p>
    </div>
  );
}
