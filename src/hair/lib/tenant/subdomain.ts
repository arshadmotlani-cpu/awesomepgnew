import { eq } from 'drizzle-orm';
import { createPlatformClient } from '@/src/platform/db/client';
import { hasPlatformDatabaseUrl } from '@/src/platform/lib/db/env';
import { platformOrganizations } from '@/src/platform/db/schema';

export {
  HAIR_APEX_HOSTS,
  HAIR_TENANT_PARENT_SUFFIXES,
  isHairTenantSubdomain,
  isSessionHostOrgMismatch,
  parseHairTenantSlug,
} from './subdomainHost';

export type HairTenantHostOrg = {
  organizationId: string;
  slug: string;
  name: string;
};

/** Platform SSOT: slug → organization (Phase F). Node-only (not Edge). */
export async function resolveOrganizationBySlug(
  slug: string,
): Promise<HairTenantHostOrg | null> {
  const normalized = slug.trim().toLowerCase();
  if (!normalized || !hasPlatformDatabaseUrl()) return null;
  const { db, close } = createPlatformClient({ max: 1 });
  try {
    const [row] = await db
      .select({
        organizationId: platformOrganizations.id,
        slug: platformOrganizations.slug,
        name: platformOrganizations.name,
      })
      .from(platformOrganizations)
      .where(eq(platformOrganizations.slug, normalized))
      .limit(1);
    if (!row) return null;
    return {
      organizationId: row.organizationId,
      slug: row.slug,
      name: row.name,
    };
  } finally {
    await close();
  }
}
