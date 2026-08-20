import type { ReactNode } from 'react';

type Column<T> = {
  key: string;
  header: string;
  cell: (row: T) => ReactNode;
  className?: string;
};

type Props<T> = {
  columns: Column<T>[];
  rows: T[];
  emptyMessage?: string;
  getRowKey: (row: T) => string;
};

export function DataTable<T>({ columns, rows, emptyMessage = 'No records found.', getRowKey }: Props<T>) {
  if (rows.length === 0) {
    return (
      <div className="plt-table-wrap px-4 py-8 text-center text-sm text-[var(--plt-text-muted)]">
        {emptyMessage}
      </div>
    );
  }

  return (
    <div className="plt-table-wrap">
      <table className="plt-table">
        <thead>
          <tr>
            {columns.map((col) => (
              <th key={col.key} className={col.className}>{col.header}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={getRowKey(row)}>
              {columns.map((col) => (
                <td key={col.key} className={col.className}>{col.cell(row)}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
