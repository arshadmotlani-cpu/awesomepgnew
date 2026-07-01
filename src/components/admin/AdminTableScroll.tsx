import type { ReactNode } from 'react';

/**
 * Horizontal scroll wrapper for wide admin tables on touch devices.
 * Parent `.apg-admin-scroll` stays vertical-only; tables scroll sideways here.
 */
export function AdminTableScroll({
  children,
  className = '',
  hint,
}: {
  children: ReactNode;
  className?: string;
  /** Override default mobile hint; pass null to hide. */
  hint?: string | null;
}) {
  const hintText =
    hint === undefined
      ? 'Swipe the table sideways to see more columns.'
      : hint;

  return (
    <div className={`apg-admin-table-scroll ${className}`.trim()}>
      {hintText ? (
        <p className="apg-admin-table-scroll-hint mb-2 text-[11px] text-apg-silver">{hintText}</p>
      ) : null}
      <div className="apg-admin-table-scroll-viewport">{children}</div>
    </div>
  );
}
