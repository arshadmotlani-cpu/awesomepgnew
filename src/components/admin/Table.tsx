import type { HTMLAttributes, ReactNode, ThHTMLAttributes, TdHTMLAttributes } from 'react';

export function Table({
  children,
  className = '',
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={
        'overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04)] ' +
        className
      }
    >
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-zinc-100 text-left text-sm">
          {children}
        </table>
      </div>
    </div>
  );
}

export function THead({ children }: { children: ReactNode }) {
  return <thead className="bg-zinc-50/70">{children}</thead>;
}

export function TBody({ children }: { children: ReactNode }) {
  return <tbody className="divide-y divide-zinc-100">{children}</tbody>;
}

export function TR({
  children,
  className = '',
  ...rest
}: HTMLAttributes<HTMLTableRowElement>) {
  return (
    <tr className={'hover:bg-zinc-50/60 ' + className} {...rest}>
      {children}
    </tr>
  );
}

export function TH({
  children,
  className = '',
  ...rest
}: ThHTMLAttributes<HTMLTableCellElement>) {
  return (
    <th
      scope="col"
      className={
        'px-4 py-3 text-xs font-semibold uppercase tracking-wide text-zinc-500 ' + className
      }
      {...rest}
    >
      {children}
    </th>
  );
}

export function TD({
  children,
  className = '',
  ...rest
}: TdHTMLAttributes<HTMLTableCellElement>) {
  return (
    <td className={'whitespace-nowrap px-4 py-3 text-sm text-zinc-700 ' + className} {...rest}>
      {children}
    </td>
  );
}
