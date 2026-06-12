/** Map a pathname to a human-readable page label for admin analytics. */
export function pathToPageKey(pathname: string): string {
  const path = pathname.split('?')[0] ?? pathname;

  if (path === '/') return 'Home';
  if (path === '/login') return 'Login';
  if (path === '/pgs') return 'PG Listing';
  if (/^\/pgs\/[^/]+$/.test(path)) return 'PG Detail';
  if (path.includes('/rooms/')) return 'Rooms';
  if (path === '/reserve/new') return 'Bed Selection';
  if (path === '/booking/new') return 'Reservation';
  if (path.includes('/pay')) return 'Payment';
  if (path === '/account/kyc') return 'KYC';
  if (path.startsWith('/account/')) return 'Account';
  if (path.startsWith('/booking/')) return 'Booking';
  if (path === '/guide') return 'Guide';
  return 'Other';
}

/** Paths we never track (admin, APIs, static assets). */
export function shouldTrackPath(pathname: string): boolean {
  if (!pathname || pathname.startsWith('/admin')) return false;
  if (pathname.startsWith('/api/')) return false;
  if (pathname.startsWith('/_next')) return false;
  return true;
}
