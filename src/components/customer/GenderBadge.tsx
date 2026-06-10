const COLORS: Record<string, string> = {
  male: 'bg-blue-50 text-blue-700 ring-blue-200',
  female: 'bg-pink-50 text-pink-700 ring-pink-200',
  coed: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
};

const LABELS: Record<string, string> = {
  male: 'Men only',
  female: 'Women only',
  coed: 'Coed',
};

export function GenderBadge({ policy }: { policy: 'male' | 'female' | 'coed' }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ring-inset ${
        COLORS[policy] ?? COLORS.coed
      }`}
    >
      {LABELS[policy] ?? policy}
    </span>
  );
}
