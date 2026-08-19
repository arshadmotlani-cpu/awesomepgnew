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

  return (
    <div className="border-b border-[color:var(--fyh-border-strong)] bg-fyh-forest/10 px-3 py-2 text-xs text-fyh-text-secondary sm:px-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <p>
            Organization ·{' '}
            <span className="font-medium text-fyh-text">
              {currentOrg?.organizationName ?? ctx.organizationId}
            </span>
          </p>
          <span aria-hidden>•</span>
          <p>
            Location ·{' '}
            <span className="font-medium text-fyh-text">
              {currentLocation?.locationName ?? ctx.locationId}
            </span>
          </p>
        </div>
        <div className="flex items-center gap-3">
          {switchableLocations.length > 0 ? (
            <form action={switchLocationAction} className="flex items-center gap-2">
              <label htmlFor="fyh-location-switch" className="sr-only">
                Switch location
              </label>
              <select
                id="fyh-location-switch"
                name="locationId"
                defaultValue=""
                className="rounded-md border border-[color:var(--fyh-border)] bg-[color:var(--fyh-bg)] px-2 py-1 text-xs text-fyh-text"
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
                className="rounded-md border border-[color:var(--fyh-border)] px-2 py-1 text-xs text-fyh-text hover:bg-fyh-forest/10"
              >
                Apply
              </button>
            </form>
          ) : null}
          <Link href="/select-organization" className="text-fyh-accent hover:underline">
            Switch organization
          </Link>
        </div>
      </div>
    </div>
  );
}
