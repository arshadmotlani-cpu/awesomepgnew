import { redirect } from 'next/navigation';
import { eq } from 'drizzle-orm';
import { hairDb } from '@/src/hair/db/client';
import { wfEmployees } from '@/src/workforce/db/schema';
import { selectOrganizationAction } from '@/src/hair/actions/tenant';
import { requireHairAuthPage } from '@/src/hair/lib/auth/guards';
import { getHairSession } from '@/src/hair/lib/auth/session';
import { isFyhSaasTenantEnabled } from '@/src/hair/lib/tenant/flags';
import { listActiveMembershipsForUser } from '@/src/platform/services/memberships';
import { Button } from '@/src/hair/components/ui/button';

export default async function SelectOrganizationPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; next?: string }>;
}) {
  if (!isFyhSaasTenantEnabled()) {
    redirect('/dashboard/revenue');
  }

  await requireHairAuthPage();
  const session = await getHairSession();
  if (!session?.workforceEmployeeId) redirect('/login');

  const [emp] = await hairDb
    .select({ userId: wfEmployees.userId })
    .from(wfEmployees)
    .where(eq(wfEmployees.id, session.workforceEmployeeId))
    .limit(1);
  if (!emp?.userId) redirect('/login?error=tenant');

  const memberships = await listActiveMembershipsForUser(emp.userId);
  if (memberships.length <= 1) redirect('/dashboard/revenue');

  const params = await searchParams;
  const next = params.next ?? '/dashboard/revenue';

  return (
    <div className="mx-auto flex min-h-[60vh] max-w-lg flex-col justify-center">
      <div className="fyh-glass rounded-2xl p-8">
        <h1 className="fyh-display text-2xl font-semibold text-fyh-text">Select organization</h1>
        <p className="mt-2 text-sm text-fyh-text-secondary">
          Choose which salon organization you want to manage in this session.
        </p>
        {params.error ? (
          <p className="mt-4 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-200">
            Could not select that organization. Try again.
          </p>
        ) : null}
        <div className="mt-6 space-y-3">
          {memberships.map((membership) => (
            <form key={membership.organizationId} action={selectOrganizationAction}>
              <input type="hidden" name="organizationId" value={membership.organizationId} />
              <input type="hidden" name="next" value={next} />
              <Button type="submit" variant="secondary" className="h-auto w-full justify-start px-4 py-4">
                <span className="flex flex-col items-start gap-1">
                  <span className="font-medium text-fyh-text">{membership.organizationName}</span>
                  <span className="text-xs capitalize text-fyh-text-secondary">
                    {membership.role}
                  </span>
                </span>
              </Button>
            </form>
          ))}
        </div>
      </div>
    </div>
  );
}
