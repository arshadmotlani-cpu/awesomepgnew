const SLOW_NAV_MS = 200;

export type AdminNavTiming = {
  href: string;
  clickAt: number;
  routeStartAt?: number;
};

export function logAdminNavClick(href: string, fromPath: string): AdminNavTiming {
  const timing: AdminNavTiming = { href, clickAt: performance.now() };
  if (process.env.NODE_ENV !== 'production') {
    console.debug(`[admin-nav] click ${fromPath} → ${href}`);
  }
  return timing;
}

export function logAdminNavRouteStart(timing: AdminNavTiming, pathname: string): void {
  const routeStartAt = performance.now();
  timing.routeStartAt = routeStartAt;
  const clickToStart = routeStartAt - timing.clickAt;
  if (clickToStart > SLOW_NAV_MS) {
    console.warn(
      `[admin-nav] slow click→route-start ${clickToStart.toFixed(0)}ms (${timing.href} → ${pathname})`,
    );
  }
}

export function logAdminNavComplete(timing: AdminNavTiming, pathname: string): void {
  const visibleAt = performance.now();
  const clickToVisible = visibleAt - timing.clickAt;
  const startAt = timing.routeStartAt ?? timing.clickAt;
  const startToVisible = visibleAt - startAt;

  if (clickToVisible > SLOW_NAV_MS) {
    console.warn(
      `[admin-nav] slow click→visible ${clickToVisible.toFixed(0)}ms (route-start→visible ${startToVisible.toFixed(0)}ms) ${pathname}`,
    );
  } else if (process.env.NODE_ENV !== 'production') {
    console.debug(
      `[admin-nav] ${clickToVisible.toFixed(0)}ms click→visible (${startToVisible.toFixed(0)}ms route-start→visible) ${pathname}`,
    );
  }
}

export { SLOW_NAV_MS };
