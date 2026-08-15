import { AdminSectionErrorBoundary } from '@/src/components/admin/AdminSectionErrorBoundary';
import { BillingCycleMigrationQueue } from '@/src/components/admin/billing/BillingCycleMigrationQueue';
import { ModuleBreadcrumbs } from '@/src/components/admin/ModuleBreadcrumbs';
import { PageHeader } from '@/src/components/admin/PageHeader';
import { requireAdminSession } from '@/src/lib/auth/guards';
import { previewBillingCycleMigration } from '@/src/services/billingCycleMigration';
import type { BillingCycleMigrationPreview } from '@/src/services/billingCycleMigration';
import {
  listBillingCycleMigrationCandidates,
  type BillingCycleMigrationCandidateRow,
} from '@/src/services/billingCycleMigrationCandidates';

export const dynamic = 'force-dynamic';

type Filter = 'needs_migration' | 'all' | 'blocked' | 'already_on_1st';

function parseFilter(raw: string | undefined): Filter {
  if (raw === 'all' || raw === 'blocked' || raw === 'already_on_1st') return raw;
  return 'needs_migration';
}

async function loadPreviews(
  candidates: BillingCycleMigrationCandidateRow[],
): Promise<Record<string, BillingCycleMigrationPreview>> {
  const previews: Record<string, BillingCycleMigrationPreview> = {};
  for (const row of candidates) {
    if (row.migrationStatus !== 'eligible') continue;
    const preview = await previewBillingCycleMigration(row.bookingId);
    if ('ok' in preview && preview.ok === false) continue;
    previews[row.bookingId] = preview;
  }
  return previews;
}

export default async function BillingCycleMigrationPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string }>;
}) {
  const params = await searchParams;
  const session = await requireAdminSession('/admin/billing/cycle-migration');
  const filter = parseFilter(params.filter);

  const allCandidates = await listBillingCycleMigrationCandidates(session, {
    includeOnTarget: filter === 'all' || filter === 'already_on_1st',
  });

  const candidates =
    filter === 'needs_migration'
      ? allCandidates.filter((c) => c.migrationStatus === 'eligible')
      : filter === 'blocked'
        ? allCandidates.filter((c) => c.migrationStatus === 'blocked')
        : filter === 'already_on_1st'
          ? allCandidates.filter(
              (c) => c.migrationStatus === 'already_on_1st' || c.migrationStatus === 'migrated',
            )
          : allCandidates;

  const previewsByBookingId = await loadPreviews(candidates);

  const needsCount = allCandidates.filter((c) => c.migrationStatus === 'eligible').length;

  return (
    <>
      <ModuleBreadcrumbs
        items={[
          { label: 'Billing Centre', href: '/admin/billing' },
          { label: '1st-of-month migration' },
        ]}
      />
      <PageHeader
        title="1st-of-month billing migration"
        description={
          needsCount > 0
            ? `${needsCount} active monthly resident${needsCount === 1 ? '' : 's'} not on billing day 1. Migrate one resident at a time — historical invoices are never changed.`
            : 'All active monthly residents are on 1st-of-month billing, or none need migration.'
        }
      />
      <AdminSectionErrorBoundary title="Billing cycle migration">
        <BillingCycleMigrationQueue
          candidates={candidates}
          previewsByBookingId={previewsByBookingId}
        />
      </AdminSectionErrorBoundary>
    </>
  );
}
