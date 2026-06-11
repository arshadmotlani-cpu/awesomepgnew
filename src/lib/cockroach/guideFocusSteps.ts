/** Ordered Roachie focus keys per route — drives Next cycling on each page. */
export function focusStepsForPath(pathname: string): string[] {
  if (/^\/pgs\/[^/]+\/rooms\//.test(pathname)) {
    return ['stay-dates', 'bed-pick'];
  }
  if (/^\/pgs\/[^/]+$/.test(pathname)) {
    return ['stay-dates', 'room-pick'];
  }
  if (pathname.startsWith('/booking/new')) {
    return ['confirm-booking'];
  }
  if (pathname.startsWith('/account/resident')) {
    return ['vacating', 'pay-rent'];
  }
  return [];
}
