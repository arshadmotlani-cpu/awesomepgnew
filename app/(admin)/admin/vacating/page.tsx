import Link from 'next/link';
import { DbStatusBanner } from '@/src/components/admin/DbStatusBanner';
import { EmptyState } from '@/src/components/admin/EmptyState';
import { IconDoor } from '@/src/components/admin/icons';
import { MoveOutAdvancedTools } from '@/src/components/admin/moveOut/MoveOutAdvancedTools';
import { MoveOutWorkflowPanel } from '@/src/components/admin/moveOut/MoveOutWorkflowPanel';
import { PageHeader } from '@/src/components/admin/PageHeader';
import { requireAdminSession } from '@/src/lib/auth/guards';
import { ensureAdminPageNotificationsSeen } from '@/src/lib/admin/notificationRead';
import { loadAdminVacatingPageData } from '@/src/lib/vacating/loadAdminVacatingPageData';

export const dynamic = 'force-dynamic';

function VacatingPartialLoadBanner({
  rowErrors,
  settlementsLoadError,
}: {
  rowErrors: Array<{ bookingCode: string; message: string }>;
  settlementsLoadError: string | null;
}) {
  if (rowErrors.length === 0 && !settlementsLoadError) return null;

  return (
    <div className="mb-6 rounded-xl border border-amber-400/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
      <p className="font-semibold">Some move-out rows could not be loaded</p>
      {settlementsLoadError ? (
        <p className="mt-1 text-xs text-amber-200/90">
          Checkout settlements: {settlementsLoadError}. Pipeline stages may be incomplete until this
          is fixed.
        </p>
      ) : null}
      {rowErrors.length > 0 ? (
        <ul className="mt-2 list-inside list-disc text-xs text-amber-200/90">
          {rowErrors.slice(0, 5).map((e) => (
            <li key={`${e.bookingCode}:${e.message}`}>
              {e.bookingCode}: {e.message}
            </li>
          ))}
          {rowErrors.length > 5 ? <li>…and {rowErrors.length - 5} more</li> : null}
        </ul>
      ) : null}
    </div>
  );
}

export default async function AdminVacatingPage(props: PageProps<'/admin/vacating'>) {
  const sp = await props.searchParams;
  const readParam = typeof sp.read === 'string' ? sp.read : undefined;
  const legacy = sp.legacy === '1';
  await ensureAdminPageNotificationsSeen('/admin/vacating', '/admin/vacating', readParam);

  const session = await requireAdminSession('/admin/vacating');
  const { vacatingRes, data } = await loadAdminVacatingPageData(session);

  if (!vacatingRes.ok || !data) {
    return (
      <>
        <PageHeader title="Move-outs" description="Unified move-out pipeline." />
        <DbStatusBanner error={vacatingRes.ok ? 'Move-out data could not be loaded.' : vacatingRes.error} />
      </>
    );
  }

  const {
    vacatingRows,
    advancedToolRows,
    settlementHrefByRequest,
    depositHeldByBooking,
    activeItems,
    completedRecently,
    commandStats,
    rowErrors,
    settlementsLoadError,
  } = data;

  if (legacy) {
    const rawStatus = typeof sp.status === 'string' ? sp.status : '';

    return (
      <>
        <PageHeader
          title="Move-outs"
          description="Legacy table view — use the pipeline for daily work."
        />
        <p className="mb-6">
          <Link href="/admin/vacating" className="text-sm font-semibold text-[#FF5A1F] hover:underline">
            ← Back to move-out pipeline
          </Link>
        </p>
        <VacatingPartialLoadBanner rowErrors={rowErrors} settlementsLoadError={settlementsLoadError} />
        <MoveOutAdvancedTools
          rows={
            rawStatus
              ? advancedToolRows.filter((v) => v.status === rawStatus)
              : advancedToolRows
          }
          settlementHrefByRequest={settlementHrefByRequest}
          depositHeldByBooking={depositHeldByBooking}
          defaultOpen
        />
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Move-outs"
        description="Where each resident is in the move-out process — one pipeline from notice to bed release."
      />

      <VacatingPartialLoadBanner rowErrors={rowErrors} settlementsLoadError={settlementsLoadError} />

      {vacatingRows.length === 0 ? (
        <EmptyState
          icon={<IconDoor />}
          title="No move-out requests"
          description="Residents submit move-out notice from their account."
        />
      ) : (
        <>
          <MoveOutWorkflowPanel
            activeItems={activeItems}
            completedRecently={completedRecently}
            commandStats={commandStats}
          />

          <MoveOutAdvancedTools
            rows={advancedToolRows}
            settlementHrefByRequest={settlementHrefByRequest}
            depositHeldByBooking={depositHeldByBooking}
          />
        </>
      )}
    </>
  );
}
