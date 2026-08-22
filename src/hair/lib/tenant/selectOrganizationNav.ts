export type MembershipLike = {
  organizationId: string;
  allowedLocationIds: string[];
};

/** Cookie presence is not enough — org must exist on the membership list with a location. */
export function pickResolvableMembership<T extends MembershipLike>(
  memberships: T[],
  orgCookie?: string | null,
): T | null {
  const usable = (m: T) => m.allowedLocationIds.length > 0;
  const cookie = orgCookie?.trim();
  if (cookie) {
    const match = memberships.find((m) => m.organizationId === cookie && usable(m));
    if (match) return match;
  }
  const resolvable = memberships.filter(usable);
  if (resolvable.length === 1) return resolvable[0]!;
  return null;
}

export type SelectOrgNavDecision =
  | { action: 'render' }
  | { action: 'redirect'; to: string };

/**
 * /select-organization may redirect to home only when tenant is already resolved.
 * Auto-sending 0/1 memberships to /dashboard/revenue causes a loop with requireHairAuthPage.
 */
export function decideSelectOrganizationNavigation(input: {
  sessionPresent: boolean;
  tenantResolved: boolean;
  /** Org+location cookies must match the resolved tenant — not merely exist. */
  selectionPersisted: boolean;
  homePath: string;
}): SelectOrgNavDecision {
  if (!input.sessionPresent) return { action: 'redirect', to: '/login' };
  if (input.tenantResolved && input.selectionPersisted) {
    return { action: 'redirect', to: input.homePath };
  }
  return { action: 'render' };
}

export function isPersistedTenantSelection(
  ctx: { organizationId: string; locationId: string; allowedLocationIds: string[] } | null,
  orgCookie?: string | null,
  locCookie?: string | null,
): boolean {
  if (!ctx) return false;
  const org = orgCookie?.trim();
  const loc = locCookie?.trim();
  return org === ctx.organizationId && Boolean(loc && ctx.allowedLocationIds.includes(loc));
}

export function detectRedirectCycle(hops: string[], maxRepeat = 2): boolean {
  if (hops.length < 3) return false;
  const normalized = hops.map((h) => h.split('?')[0] ?? h);
  let repeats = 0;
  for (let i = 0; i < normalized.length - 2; i++) {
    if (normalized[i] === normalized[i + 2] && normalized[i] !== normalized[i + 1]) {
      repeats += 1;
      if (repeats >= maxRepeat) return true;
    }
  }
  return repeats >= 1 && normalized.length >= 4;
}

export function simulateSelectOrgDashboardHops(input: {
  tenantResolved: boolean;
  /** Legacy bug: select-org redirected to dashboard when memberships.length <= 1. */
  autoRedirectWhenUnresolved: boolean;
}): string[] {
  const hops: string[] = [];
  let path = '/select-organization';
  for (let i = 0; i < 8; i++) {
    hops.push(path);
    if (path === '/select-organization') {
      const decision = decideSelectOrganizationNavigation({
        sessionPresent: true,
        tenantResolved: input.tenantResolved,
        selectionPersisted: input.tenantResolved,
        homePath: '/dashboard/revenue',
      });
      if (decision.action === 'render') {
        if (input.autoRedirectWhenUnresolved) {
          path = '/dashboard/revenue';
          continue;
        }
        break;
      }
      path = decision.to;
      continue;
    }
    if (path === '/dashboard/revenue') {
      if (input.tenantResolved) break;
      path = '/select-organization';
    }
  }
  return hops;
}
