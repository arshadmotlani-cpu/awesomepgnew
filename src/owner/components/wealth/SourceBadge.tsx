const SOURCE_LABELS: Record<string, string> = {
  OWNER_OS: 'Owner OS',
  AWESOME_PG: 'Awesome PG',
  FYHAIR: 'FYHAIR',
  CAPITAL: 'Capital',
  WORKFORCE: 'Workforce',
  OTHER: 'Other',
};

const SOURCE_COLORS: Record<string, string> = {
  OWNER_OS: 'bg-[#FF5A1F]/20 text-[#FF5A1F]',
  AWESOME_PG: 'bg-emerald-500/20 text-emerald-300',
  FYHAIR: 'bg-purple-500/20 text-purple-300',
  CAPITAL: 'bg-blue-500/20 text-blue-300',
  WORKFORCE: 'bg-amber-500/20 text-amber-300',
  OTHER: 'bg-white/10 text-[color:var(--oo-muted)]',
};

export function SourceBadge({ source }: { source: string }) {
  const label = SOURCE_LABELS[source] ?? source;
  const color = SOURCE_COLORS[source] ?? SOURCE_COLORS.OTHER;
  return (
    <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ${color}`}>
      {label}
    </span>
  );
}
