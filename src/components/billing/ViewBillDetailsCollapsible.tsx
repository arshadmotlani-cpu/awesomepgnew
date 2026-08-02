import type { ReactNode } from 'react';

type Props = {
  children: ReactNode;
  className?: string;
};

export function ViewBillDetailsCollapsible({ children, className }: Props) {
  return (
    <details className={`group rounded-xl border border-zinc-200 bg-white ${className ?? ''}`}>
      <summary className="cursor-pointer list-none px-5 py-3 text-sm font-medium text-zinc-800 marker:content-none [&::-webkit-details-marker]:hidden">
        <span className="inline-flex items-center gap-2">
          View Bill Details
          <span className="text-zinc-400 transition group-open:rotate-180">▾</span>
        </span>
      </summary>
      <div className="border-t border-zinc-100 px-5 py-4">{children}</div>
    </details>
  );
}
