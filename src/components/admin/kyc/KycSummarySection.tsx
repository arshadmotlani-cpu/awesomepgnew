export function KycSummarySection({
  pendingCount,
  approvedCount,
}: {
  pendingCount: number;
  approvedCount: number;
}) {
  const total = pendingCount + approvedCount;
  const nextStep =
    pendingCount > 0
      ? `${pendingCount} waiting for your review`
      : approvedCount > 0
        ? 'All caught up — documents on file below'
        : 'No submissions yet';

  return (
    <section className="mb-8">
      <header className="mb-4">
        <h2 className="text-base font-semibold text-white">Identity check summary</h2>
        <p className="mt-1 text-sm text-apg-silver">
          Residents upload Aadhaar and a selfie before check-in.
        </p>
      </header>
      <dl className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <SummaryCard label="Needs review" value={String(pendingCount)} accent={pendingCount > 0 ? 'urgent' : undefined} />
        <SummaryCard label="Approved on file" value={String(approvedCount)} />
        <SummaryCard label="Total submissions" value={String(total)} />
        <SummaryCard label="Next step" value={nextStep} compact />
      </dl>
    </section>
  );
}

function SummaryCard({
  label,
  value,
  accent,
  compact,
}: {
  label: string;
  value: string;
  accent?: 'urgent';
  compact?: boolean;
}) {
  const valueClass = accent === 'urgent' ? 'text-[#FF5A1F]' : 'text-white';

  return (
    <div className="rounded-xl border border-white/10 bg-[#1A1F27] p-4">
      <dt className="text-[10px] font-medium uppercase tracking-wide text-apg-silver">{label}</dt>
      <dd
        className={
          'mt-2 font-semibold ' +
          (compact ? 'text-sm leading-snug ' : 'text-xl tabular-nums ') +
          valueClass
        }
      >
        {value}
      </dd>
    </div>
  );
}
