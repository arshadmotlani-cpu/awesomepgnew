type Row = {
  status: string;
  noticeCompliant: boolean;
  deductionPaise: number;
};

export function VacatingSummarySection({ rows }: { rows: Row[] }) {
  const pending = rows.filter((r) => r.status === 'pending').length;
  const approved = rows.filter((r) => r.status === 'approved').length;
  const completed = rows.filter((r) => r.status === 'completed').length;
  const noticeIssues = rows.filter((r) => r.status === 'pending' && !r.noticeCompliant).length;

  return (
    <section className="mb-8">
      <header className="mb-4">
        <h2 className="text-base font-semibold text-white">Move-out summary</h2>
        <p className="mt-1 text-sm text-apg-silver">
          Residents who gave notice to leave. After you approve, finish checkout in Settlements.
        </p>
      </header>
      <dl className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Waiting for approval" value={String(pending)} accent={pending > 0 ? 'amber' : undefined} />
        <StatCard label="Ready for checkout" value={String(approved)} accent={approved > 0 ? 'sky' : undefined} />
        <StatCard label="Completed" value={String(completed)} />
        <StatCard
          label="Notice too short"
          value={String(noticeIssues)}
          hint={noticeIssues > 0 ? 'May have a fee' : undefined}
        />
      </dl>
    </section>
  );
}

function StatCard({
  label,
  value,
  accent,
  hint,
}: {
  label: string;
  value: string;
  accent?: 'amber' | 'sky';
  hint?: string;
}) {
  const valueClass =
    accent === 'amber' ? 'text-amber-300' : accent === 'sky' ? 'text-sky-300' : 'text-white';

  return (
    <div className="rounded-xl border border-white/10 bg-[#1A1F27] p-4">
      <dt className="text-[10px] font-medium uppercase tracking-wide text-apg-silver">{label}</dt>
      <dd className={`mt-2 text-2xl font-semibold tabular-nums ${valueClass}`}>{value}</dd>
      {hint ? <p className="mt-1 text-[11px] text-apg-silver">{hint}</p> : null}
    </div>
  );
}
