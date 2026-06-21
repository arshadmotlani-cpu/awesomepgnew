import Link from 'next/link';
import { DbStatusBanner } from '@/src/components/admin/DbStatusBanner';
import { EmptyState } from '@/src/components/admin/EmptyState';
import { IconDoor } from '@/src/components/admin/icons';
import { MoveOutAdvancedTools } from '@/src/components/admin/moveOut/MoveOutAdvancedTools';
import { MoveOutCommandCenter } from '@/src/components/admin/moveOut/MoveOutCommandCenter';
import { MoveOutPipelineQueue } from '@/src/components/admin/moveOut/MoveOutPipelineQueue';
import { PageHeader } from '@/src/components/admin/PageHeader';
import { listAdminVacatingRequests } from '@/src/db/queries/admin';
import { requireAdminSession } from '@/src/lib/auth/guards';
import { ensureAdminPageNotificationsSeen } from '@/src/lib/admin/notificationRead';
import {
  activePipelineItems,
  buildMoveOutCommandStats,
  buildMoveOutPipeline,
  toClientMoveOutPipelineItem,
} from '@/src/lib/moveOut/moveOutPipeline';
import {
  listPipelineCheckoutSettlements,
} from '@/src/services/checkoutSettlement';
import { getDepositSummaryForBooking } from '@/src/services/deposits';

export const dynamic = 'force-dynamic';

export default async function AdminVacatingPage(props: PageProps<'/admin/vacating'>) {
  const sp = await props.searchParams;
  const readParam = typeof sp.read === 'string' ? sp.read : undefined;
  const legacy = sp.legacy === '1';
  await ensureAdminPageNotificationsSeen('/admin/vacating', '/admin/vacating', readParam);

  const session = await requireAdminSession('/admin/vacating');
  const [vacatingRes, settlements] = await Promise.all([
    listAdminVacatingRequests(),
    listPipelineCheckoutSettlements(session),
  ]);

  const settlementHrefByRequest = new Map<string, string>();
  for (const s of settlements) {
    settlementHrefByRequest.set(s.vacatingRequestId, `/admin/checkout-settlements/${s.id}`);
  }

  if (!vacatingRes.ok) {
    return (
      <>
        <PageHeader title="Move-outs" description="Unified move-out pipeline." />
        <DbStatusBanner error={vacatingRes.error} />
      </>
    );
  }

  const bookingIds = [...new Set(vacatingRes.data.map((v) => v.bookingId))];
  const depositHeldByBooking = new Map<string, number>();
  await Promise.all(
    bookingIds.map(async (bookingId) => {
      const summary = await getDepositSummaryForBooking(bookingId);
      depositHeldByBooking.set(bookingId, summary?.refundableBalancePaise ?? 0);
    }),
  );

  const pipeline = buildMoveOutPipeline({
    vacatingRows: vacatingRes.data.map((v) => ({
      id: v.id,
      bookingId: v.bookingId,
      bookingCode: v.bookingCode,
      customerId: v.customerId,
      customerFullName: v.customerFullName,
      customerPhone: v.customerPhone,
      pgName: v.pgName,
      bedCode: v.bedCode,
      roomNumber: v.roomNumber,
      noticeGivenDate: v.noticeGivenDate,
      vacatingDate: v.vacatingDate,
      noticeCompliant: v.noticeCompliant,
      status: v.status,
      resolvedAt: v.resolvedAt,
      createdAt: v.createdAt,
      updatedAt: v.updatedAt,
      deductionPaise: v.deductionPaise,
      depositHeldPaise: depositHeldByBooking.get(v.bookingId) ?? 0,
    })),
    settlements: settlements.map((s) => ({
      id: s.id,
      vacatingRequestId: s.vacatingRequestId,
      status: s.status,
      createdAt: s.createdAt,
      updatedAt: s.updatedAt,
      approvedAt: s.approvedAt,
      refundPaidAt: s.refundPaidAt,
    })),
  });

  const commandStats = buildMoveOutCommandStats(pipeline);
  const activeItems = activePipelineItems(pipeline).map(toClientMoveOutPipelineItem);
  const completedRecently = pipeline
    .filter((i) => i.stage === 'bed_released')
    .slice(0, 8)
    .map(toClientMoveOutPipelineItem);

  if (legacy) {
    const rawStatus = typeof sp.status === 'string' ? sp.status : '';
    const filtered = rawStatus
      ? vacatingRes.data.filter((v) => v.status === rawStatus)
      : vacatingRes.data;

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
        <MoveOutAdvancedTools
          rows={filtered}
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

      {vacatingRes.data.length === 0 ? (
        <EmptyState
          icon={<IconDoor />}
          title="No move-out requests"
          description="Residents submit move-out notice from their account."
        />
      ) : (
        <>
          <MoveOutCommandCenter stats={commandStats} />
          <MoveOutPipelineQueue items={activeItems} />

          {completedRecently.length > 0 ? (
            <section className="mb-8">
              <header className="mb-4 flex flex-wrap items-end justify-between gap-2">
                <div>
                  <h2 className="text-lg font-bold text-white">Recently completed</h2>
                  <p className="mt-1 text-sm text-apg-silver">
                    Move-outs finished — bed released and checkout closed.
                  </p>
                </div>
              </header>
              <MoveOutPipelineQueue items={completedRecently} compact />
            </section>
          ) : null}

          <MoveOutAdvancedTools
            rows={vacatingRes.data}
            settlementHrefByRequest={settlementHrefByRequest}
            depositHeldByBooking={depositHeldByBooking}
          />
        </>
      )}
    </>
  );
}
