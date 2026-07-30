'use client';

import { useState, useTransition } from 'react';
import {
  exportReportAction,
  type FyhExportFormat,
  type FyhReportKey,
} from '@/src/hair/actions/reports';

export function ExportButton({
  reportKey,
  label = 'Export',
}: {
  reportKey: FyhReportKey;
  label?: string;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function downloadCsv(filename: string, content: string) {
    const blob = new Blob([content], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  function openPrintHtml(content: string) {
    const win = window.open('', '_blank');
    if (!win) {
      setError('Allow pop-ups to print PDF');
      return;
    }
    win.document.write(content);
    win.document.close();
  }

  function run(format: FyhExportFormat) {
    setError(null);
    startTransition(async () => {
      const result = await exportReportAction({ reportKey, format });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      if (result.format === 'csv') {
        downloadCsv(result.filename, result.content);
      } else {
        openPrintHtml(result.content);
      }
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        disabled={pending}
        onClick={() => run('csv')}
        className="fyh-btn-secondary px-3 py-1.5 text-xs uppercase tracking-wide disabled:opacity-50"
      >
        {pending ? 'Exporting…' : `${label} CSV`}
      </button>
      <button
        type="button"
        disabled={pending}
        onClick={() => run('pdf')}
        className="fyh-btn-secondary px-3 py-1.5 text-xs uppercase tracking-wide disabled:opacity-50"
      >
        Print PDF
      </button>
      {error ? <p className="text-xs text-red-400">{error}</p> : null}
    </div>
  );
}
