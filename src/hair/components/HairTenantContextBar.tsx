import Link from 'next/link';
import { getTenantContextForPage } from '@/src/hair/lib/tenant/getTenantContext';
import { isFyhSaasTenantEnabled } from '@/src/hair/lib/tenant/flags';
import {
  listTenantLocationOptions,
  listTenantMembershipOptions,
  switchLocationAction,
} from '@/src/hair/actions/tenant';

export async function HairTenantContextBar() {
  if (!isFyhSaasTenantEnabled()) return null;
  const ctx = await getTenantContextForPage();
  if (!ctx) return null;
  const [memberships, locations] = await Promise.all([
    listTenantMembershipOptions(),
    listTenantLocationOptions(),
  ]);
  const currentOrg = memberships.find((m) => m.organizationId === ctx.organizationId);
  const currentLocation = locations.find((l) => l.locationId === ctx.locationId);
  const switchableLocations = locations.filter((l) => l.isActive && l.locationId !== ctx.locationId);

  const orgLabel = currentOrg?.organizationName ?? ctx.organizationId;
  const locationLabel = currentLocation?.locationName ?? ctx.locationId;

  return (
    <div className="min-w-0 border-b border-[color:var(--fyh-border-strong)] bg-fyh-forest/10 px-2 py-2 text-xs text-fyh-text-secondary sm:px-3 lg:px-4">
      <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 flex-col gap-0.5 sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-2 sm:gap-y-1">
          <p className="min-w-0 truncate">
            Organization ·{' '}
            <span className="font-medium text-fyh-text" title={orgLabel}>
              {orgLabel}
            </span>
          </p>
          <span className="hidden sm:inline" aria-hidden>•</span>
          <p className="min-w-0 truncate">
            Location ·{' '}
            <span className="font-medium text-fyh-text" title={locationLabel}>
              {locationLabel}
            </span>
          </p>
        </div>
        <div className="flex min-w-0 shrink-0 flex-wrap items-center gap-2 sm:justify-end">
          {switchableLocations.length > 0 ? (
            <form
              action={switchLocationAction}
              className="flex min-w-0 max-w-full flex-wrap items-center gap-2"
            >
              <label htmlFor="fyh-location-switch" className="sr-only">
                Switch location
              </label>
              <select
                id="fyh-location-switch"
                name="locationId"
                defaultValue=""
                className="max-w-[min(100%,12rem)] min-w-0 rounded-md border border-[color:var(--fyh-border)] bg-[color:var(--fyh-bg)] px-2 py-1 text-xs text-fyh-text"
              >
                <option value="" disabled>
                  Switch location
                </option>
                {switchableLocations.map((location) => (
                  <option key={location.locationId} value={location.locationId}>
                    {location.locationName}
                  </option>
                ))}
              </select>
              <button
                type="submit"
                className="shrink-0 rounded-md border border-[color:var(--fyh-border)] px-2 py-1 text-xs text-fyh-text hover:bg-fyh-forest/10"
              >
                Apply
              </button>
            </form>
          ) : null}
          <Link
            href="/select-organization"
            className="shrink-0 text-fyh-accent hover:underline"
          >
            Switch organization
          </Link>
        </div>
      </div>
    </div>
  );
}
