const DEFAULT_APP_TIMEZONE = 'Asia/Kolkata';

/** Business-local calendar day (YYYY-MM-DD). Safe for SSR and client hydration. */
export function appTodayIso(timezone = DEFAULT_APP_TIMEZONE, now = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}
