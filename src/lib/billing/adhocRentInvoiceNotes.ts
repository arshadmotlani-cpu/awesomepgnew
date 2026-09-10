export function diffInclusiveDays(start: string, end: string): number {
  const s = new Date(`${start}T00:00:00Z`).getTime();
  const e = new Date(`${end}T00:00:00Z`).getTime();
  if (!Number.isFinite(s) || !Number.isFinite(e) || e < s) {
    throw new Error(`Invalid period: ${start} → ${end}`);
  }
  return Math.round((e - s) / 86_400_000) + 1;
}

export function buildAdhocRentPeriodDescription(input: {
  periodStart: string;
  periodEnd: string;
  amountPaise: number;
}): string {
  const days = diffInclusiveDays(input.periodStart, input.periodEnd);
  const dailyPaise = Math.round(input.amountPaise / days);
  const dailyInr = (dailyPaise / 100).toLocaleString('en-IN', { maximumFractionDigits: 2 });
  return `₹${dailyInr}/day × ${days} days (${input.periodStart} → ${input.periodEnd})`;
}

const MONTH_LABELS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
] as const;

function formatDisplayDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  return `${d.getUTCDate()} ${MONTH_LABELS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

export function formatAdhocRentNotes(input: {
  title: string;
  periodStart: string;
  periodEnd: string;
  amountPaise: number;
}): { description: string; notes: string } {
  const periodDesc = buildAdhocRentPeriodDescription(input);
  const startLabel = formatDisplayDate(input.periodStart);
  const endLabel = formatDisplayDate(input.periodEnd);
  const description = `${periodDesc}. Billing period: ${startLabel} → ${endLabel}`;
  return {
    description,
    notes: `${input.title.trim()} — ${description}`,
  };
}
