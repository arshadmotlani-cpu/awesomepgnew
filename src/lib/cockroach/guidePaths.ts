/** Cockroach peeks in only on PG detail and room pages — not browse, booking, or account. */
export function shouldShowRoachieGuide(pathname: string): boolean {
  if (!pathname || pathname === '/') return false;
  if (pathname === '/pgs' || pathname.startsWith('/pgs?')) return false;
  if (pathname.startsWith('/booking')) return false;
  if (pathname.startsWith('/account')) return false;
  if (pathname.startsWith('/login')) return false;
  if (/^\/pgs\/[^/]+$/.test(pathname)) return true;
  if (/^\/pgs\/[^/]+\/rooms\//.test(pathname)) return true;
  return false;
}

/** Structured onboarding tour — PG bed map and room pages. */
export function shouldRunOnboardingTour(pathname: string): boolean {
  return /^\/pgs\/[^/]+$/.test(pathname) || /^\/pgs\/[^/]+\/rooms\/[^/]+$/.test(pathname);
}

/** Full bubble widget when onboarding tour is active on this route. */
export function hasActiveTips(pathname: string): boolean {
  return shouldRunOnboardingTour(pathname);
}
