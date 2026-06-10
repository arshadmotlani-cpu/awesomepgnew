const COLORS: Record<string, string> = {
  male: 'bg-blue-500/20 text-blue-300 ring-blue-400/30',
  female: 'bg-pink-500/20 text-pink-300 ring-pink-400/30',
  coed: 'bg-emerald-500/20 text-emerald-300 ring-emerald-400/30',
};

const LABELS: Record<string, string> = {
  male: 'Men only',
  female: 'Women only',
  coed: 'Coed',
};

export function GenderBadge({ policy }: { policy: 'male' | 'female' | 'coed' }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ring-inset backdrop-blur ${
        COLORS[policy] ?? COLORS.coed
      }`}
    >
      {LABELS[policy] ?? policy}
    </span>
  );
}
