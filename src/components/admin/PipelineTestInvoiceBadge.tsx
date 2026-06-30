/** Marks pipeline-test invoices — excluded from production financial totals. */
export function PipelineTestInvoiceBadge({ className = '' }: { className?: string }) {
  return (
    <span
      className={
        'inline-flex items-center rounded-md border border-amber-400/50 bg-amber-500/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-200 ' +
        className
      }
    >
      TEST INVOICE
    </span>
  );
}
