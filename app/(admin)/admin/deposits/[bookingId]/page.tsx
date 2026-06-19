import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { ReactNode } from 'react';
import { PageHeader } from '@/src/components/admin/PageHeader';
import { Badge } from '@/src/components/admin/Badge';
import { DepositAdjustForms } from '@/src/components/admin/DepositAdjustForms';
import { DepositSettlementPanel } from '@/src/components/admin/DepositSettlementPanel';
import { DepositAdvancedTools } from '@/src/components/admin/deposits/DepositAdvancedTools';
import { DepositCorrectForm } from '@/src/components/admin/deposits/DepositCorrectForm';
import { DepositSummaryCard } from '@/src/components/admin/deposits/DepositSummaryCard';
import { DepositComponentBoundary } from '@/src/components/admin/deposits/DepositComponentBoundary';
import { DepositRefundNotice } from '@/src/components/customer/DepositRefundNotice';
import { ensureAdminPageNotificationsSeen } from '@/src/lib/admin/notificationRead';
import { loadDepositPageData } from '@/src/lib/deposits/loadDepositPageData';
import {
  inspectUnifiedDepositViewFields,
  inspectWalletProps,
} from '@/src/lib/deposits/postSaveWalletStateLog';
import { jsonSafe } from '@/src/lib/depositPageDebug';
import {
  logDepositComponentFailed,
  logDepositComponentRender,
  type DepositInvestigationContext,
} from '@/src/lib/depositInvestigation';
import {
  parseDepositSkipFlags,
  shouldSkipDepositSection,
} from '@/src/lib/depositRenderTrace';

export const dynamic = 'force-dynamic';

type RouteParams = { bookingId: string };

function statusTone(status: string) {
  switch (status) {
    case 'collecting':
      return 'amber' as const;
    case 'held':
      return 'emerald' as const;
    case 'refund_pending':
      return 'sky' as const;
    case 'settled':
      return 'zinc' as const;
    default:
      return 'zinc' as const;
  }
}

function renderServerComponent(
  ctx: DepositInvestigationContext,
  data: Record<string, unknown>,
  render: () => ReactNode,
): ReactNode {
  try {
    logDepositComponentRender(ctx, data);
    return render();
  } catch (error) {
    logDepositComponentFailed(ctx, error, data);
    const message = error instanceof Error ? error.message : String(error);
    const stack = error instanceof Error ? error.stack : undefined;
    return (
      <div className="my-4 rounded-lg border border-rose-400/40 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">
        <p className="font-semibold">[DEPOSIT_COMPONENT_FAILED] {ctx.component}</p>
        <p className="mt-1 text-xs">{message}</p>
        {stack ? (
          <pre className="mt-2 max-h-32 overflow-auto text-[10px] text-rose-200/80">{stack}</pre>
        ) : null}
      </div>
    );
  }
}

function boundaryProps(
  ctx: DepositInvestigationContext,
  component: string,
  sourceFile: string,
  data?: Record<string, unknown>,
) {
  return {
    ...ctx,
    component,
    sourceFile,
    data: data ? jsonSafe(data) : undefined,
  };
}

export default async function AdminDepositDetailPage({
  params,
  searchParams,
}: {
  params: Promise<RouteParams>;
  searchParams: Promise<{ depositSkip?: string }>;
}) {
  const { bookingId } = await params;
  const sp = await searchParams;
  const skip = parseDepositSkipFlags(sp.depositSkip);

  try {
    await ensureAdminPageNotificationsSeen(
      `/admin/deposits/${bookingId}`,
      `/admin/deposits/${bookingId}`,
    );
  } catch (err) {
    console.error('[deposit-detail] ensureAdminPageNotificationsSeen failed', { bookingId, err });
  }

  const data = await loadDepositPageData(bookingId);

  if (!data?.booking) {
    if (data?.loadError) {
      return (
        <>
          <PageHeader title="Deposit invoice" description="Could not load deposit details." />
          <div className="rounded-lg border border-rose-400/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">
            <p>{data.loadError}</p>
            <div className="mt-4 flex flex-wrap gap-3">
              {data.customerId ? (
                <Link
                  href={`/admin/residents/${data.customerId}`}
                  className="text-sm font-semibold text-[#FF5A1F] hover:underline"
                >
                  Open resident profile →
                </Link>
              ) : null}
              <Link
                href={`/admin/bookings/${bookingId}`}
                className="text-sm font-semibold text-[#FF5A1F] hover:underline"
              >
                Booking operations →
              </Link>
              <Link href="/admin/deposits" className="text-sm text-apg-silver hover:text-white">
                ← All deposits
              </Link>
            </div>
          </div>
        </>
      );
    }
    notFound();
  }

  const {
    booking,
    customerId,
    invoice,
    unifiedView,
    isFrozen,
    loadError,
    walletProps,
    adjustProps,
    settlementProps,
  } = data;

  const ctx: DepositInvestigationContext = {
    bookingId,
    bookingCode: booking.bookingCode,
    customerId: booking.customerId,
  };

  const snapshot = jsonSafe({
    bookingCode: booking.bookingCode,
    customerId: booking.customerId,
    hasInvoice: Boolean(invoice),
    hasUnifiedView: Boolean(unifiedView),
    hasWalletProps: Boolean(walletProps),
    hasAdjustProps: Boolean(adjustProps),
    hasSettlementProps: Boolean(settlementProps),
    isFrozen,
    loadError,
  });

  const syncWarning =
    unifiedView && !unifiedView.walletInSync && unifiedView.walletMismatchReason
      ? unifiedView.walletMismatchReason
      : null;

  const bookingSection = renderServerComponent(
    { ...ctx, component: 'PageHeader' },
    snapshot,
    () => (
      <>
        <PageHeader
          title={`Deposit — ${booking.customerFullName}`}
          description={`${booking.bookingCode} · ${booking.customerPhone}`}
          actions={
            <Link
              href="/admin/deposits"
              className="rounded-lg border border-white/10 px-3 py-1.5 text-sm text-apg-silver hover:text-white"
            >
              ← All deposits
            </Link>
          }
        />
        {loadError ? (
          <div className="mb-4 rounded-lg border border-amber-400/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
            {loadError} Showing booking data where available.
          </div>
        ) : null}
        <p className="mb-4 text-sm text-apg-silver">
          <Link href={`/admin/residents/${customerId}`} className="text-[#FF5A1F] hover:underline">
            Resident profile →
          </Link>
          {' · '}
          <Link href={`/admin/bookings/${bookingId}`} className="text-[#FF5A1F] hover:underline">
            Booking operations →
          </Link>
        </p>
      </>
    ),
  );

  const refundsSection = (
    <DepositComponentBoundary
      {...boundaryProps(ctx, 'DepositRefundNotice', 'src/components/customer/DepositRefundNotice.tsx')}
    >
      <DepositRefundNotice />
    </DepositComponentBoundary>
  );

  const invoiceSection = renderServerComponent(
    { ...ctx, component: 'InvoiceBadge' },
    jsonSafe({ invoice: invoice ?? null }),
    () =>
      invoice ? (
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <Badge tone={statusTone(invoice.invoiceStatus)}>{invoice.displayStatus}</Badge>
          {isFrozen ? <Badge tone="zinc">Frozen · settled</Badge> : null}
        </div>
      ) : null,
  );

  let summarySection: ReactNode = null;
  if (unifiedView && !shouldSkipDepositSection(skip, 'wallet')) {
    summarySection = (
      <DepositComponentBoundary
        {...boundaryProps(
          ctx,
          'DepositSummaryCard',
          'src/components/admin/deposits/DepositSummaryCard.tsx',
          { view: unifiedView },
        )}
      >
        <DepositSummaryCard
          view={jsonSafe(unifiedView)}
          invoiceStatus={invoice?.displayStatus ?? unifiedView.invoiceStatus}
          syncWarning={syncWarning}
        />
      </DepositComponentBoundary>
    );
  }

  let correctSection: ReactNode = null;
  let advancedSection: ReactNode = null;
  if (!shouldSkipDepositSection(skip, 'wallet')) {
    if (isFrozen) {
      correctSection = (
        <p className="mb-6 rounded-lg border border-white/10 bg-[#1A1F27] px-4 py-3 text-sm text-apg-silver">
          This deposit invoice is settled and frozen.
        </p>
      );
    } else if (walletProps) {
      const correctFormView = jsonSafe(walletProps.view);
      console.error('[DEPOSIT_CORRECT_FORM_SERVER_PROPS]', jsonSafe({
        bookingId,
        bookingCode: booking.bookingCode,
        walletPropsInspection: inspectWalletProps(walletProps),
        correctFormViewFieldTypes: inspectUnifiedDepositViewFields(correctFormView),
        unifiedViewFieldTypes: inspectUnifiedDepositViewFields(unifiedView),
      }));
      correctSection = (
        <DepositComponentBoundary
          {...boundaryProps(
            ctx,
            'DepositCorrectForm',
            'src/components/admin/deposits/DepositCorrectForm.tsx',
            walletProps,
          )}
        >
          <DepositCorrectForm view={correctFormView} />
        </DepositComponentBoundary>
      );
      if (adjustProps) {
        advancedSection = (
          <DepositComponentBoundary
            {...boundaryProps(
              ctx,
              'DepositAdvancedTools',
              'src/components/admin/deposits/DepositAdvancedTools.tsx',
              { view: walletProps.view, adjustProps },
            )}
          >
            <DepositAdvancedTools
              view={jsonSafe(walletProps.view)}
              bookingId={bookingId}
              adjustProps={jsonSafe(adjustProps)}
            />
          </DepositComponentBoundary>
        );
      }
    }
  }

  let adjustmentsSection: ReactNode = null;
  if (!isFrozen && !shouldSkipDepositSection(skip, 'adjustments') && adjustProps) {
    adjustmentsSection = (
      <DepositComponentBoundary
        {...boundaryProps(
          ctx,
          'DepositAdjustForms',
          'src/components/admin/DepositAdjustForms.tsx',
          adjustProps,
        )}
      >
        <DepositAdjustForms bookingId={adjustProps.bookingId} />
      </DepositComponentBoundary>
    );
  }

  let settlementSection: ReactNode = null;
  if (!isFrozen && !shouldSkipDepositSection(skip, 'settlement') && settlementProps) {
    settlementSection = (
      <DepositComponentBoundary
        {...boundaryProps(
          ctx,
          'DepositSettlementPanel',
          'src/components/admin/DepositSettlementPanel.tsx',
          settlementProps,
        )}
      >
        <div className="mb-6">
          <DepositSettlementPanel {...settlementProps} />
        </div>
      </DepositComponentBoundary>
    );
  }

  return (
    <>
      {skip.size > 0 ? (
        <div className="mb-4 rounded-lg border border-sky-400/30 bg-sky-500/10 px-3 py-2 text-xs text-sky-100">
          Diagnostic mode — skipped sections: {Array.from(skip).join(', ') || 'none'}
        </div>
      ) : null}
      {bookingSection}
      {refundsSection}
      {invoiceSection}
      {summarySection}
      {correctSection}
      {adjustmentsSection}
      {settlementSection}
      {advancedSection}
    </>
  );
}
