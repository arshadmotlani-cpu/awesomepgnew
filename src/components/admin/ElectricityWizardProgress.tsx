export function ElectricityWizardProgress({
  current,
  total,
  pgName,
}: {
  current: number;
  total: number;
  pgName: string;
}) {
  const pct = total > 0 ? Math.round((current / total) * 100) : 0;

  return (
    <div className="mb-4 rounded-xl border border-white/10 bg-[#1A1F27] p-4">
      <div className="flex items-center justify-between gap-2 text-xs text-apg-silver">
        <span>{pgName}</span>
        <span>
          Room {current} of {total} · {pct}%
        </span>
      </div>
      <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/10">
        <div className="h-full rounded-full bg-[#FF5A1F]" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
