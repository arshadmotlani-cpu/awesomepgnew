/** Display calendar day as "17 August 26" (D Month YY). */
export function formatSalonDisplayDate(dayIso: string): string {
  const [y, m, d] = dayIso.split('-').map(Number);
  const dt = new Date(y!, m! - 1, d!);
  const day = dt.getDate();
  const month = dt.toLocaleString('en-GB', { month: 'long' });
  const yy = String(y!).slice(-2);
  return `${day} ${month} ${yy}`;
}
