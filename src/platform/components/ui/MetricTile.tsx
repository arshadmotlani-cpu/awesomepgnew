type Props = {
  label: string;
  value: string | number;
  hint?: string;
};

export function MetricTile({ label, value, hint }: Props) {
  return (
    <div className="rounded-lg border border-[var(--plt-border)] bg-[var(--plt-bg-surface)] px-4 py-3">
      <p className="text-xs font-medium text-[var(--plt-text-subtle)]">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums text-[var(--plt-text)]">{value}</p>
      {hint ? <p className="mt-0.5 text-[10px] text-[var(--plt-text-subtle)]">{hint}</p> : null}
    </div>
  );
}

export function MetricGrid({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
      {children}
    </div>
  );
}
