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

/** Structured onboarding tour — room page only (all bed concepts visible). */
export function shouldRunOnboardingTour(pathname: string): boolean {
  return /^\/pgs\/[^/]+\/rooms\/[^/]+$/.test(pathname);
}

/** Full bubble widget when onboarding tour is active on this route. */
export function hasActiveTips(pathname: string): boolean {
  return shouldRunOnboardingTour(pathname);
}
