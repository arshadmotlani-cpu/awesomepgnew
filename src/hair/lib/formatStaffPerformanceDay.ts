/** Display YYYY-MM-DD as "8 Oct 2026" for staff performance headers. */
export function formatStaffPerformanceDayLabel(dayKey: string): string {
  const [y, m, d] = dayKey.slice(0, 10).split('-').map(Number);
  if (!y || !m || !d) return dayKey;
  const dt = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(dt);
}
