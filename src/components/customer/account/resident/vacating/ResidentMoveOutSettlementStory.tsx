'use client';

import { useMemo } from 'react';
import { ApgCard } from '@/src/components/customer/design-system';
import { FinancialDocumentCollapsibleSection } from '@/src/components/billing/FinancialDocumentLayout';
import type { CheckoutSettlementWaterfall } from '@/src/lib/checkout/checkoutSettlementEngineV2';
import { formatDate, paiseToInr } from '@/src/lib/format';
import type { EstimatedSettlementPreview } from '@/src/lib/vacating/estimatedSettlementPreview';
import type { SettlementStatementDocumentModel } from '@/src/lib/vacating/settlementStatementModel';
import {
  buildResidentMoveOutSettlementStory,
  RESIDENT_STORY_LABELS,
  type ResidentMoveOutSettlementStory,
} from '@/src/lib/residents/residentMoveOutSettlementStory';
import { ResidentSettlementDetailedBreakdown } from '@/src/components/customer/account/resident/vacating/ResidentSettlementDetailedBreakdown';

function NoticeBadge({ story }: { story: ResidentMoveOutSettlementStory }) {
  const { badge, badgeLabel } = story.moveOutDetails;
  if (badge === 'none' || !badgeLabel) return null;
  const cls =
    badge === 'compliant'
      ? 'bg-emerald-100 text-emerald-800 ring-emerald-200'
      : 'bg-orange-100 text-orange-900 ring-orange-200';
  return (
    <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ${cls}`}>
      {badgeLabel}
    </span>
  );
}

export type ResidentMoveOutSettlementStoryProps = {
  noticeGivenDate: string | null;
  vacatingDate: string | null;
  vacatingStatus: string | null;
  durationMode?: string | null;
  depositHeldPaise: number;
  monthlyRentPaise?: number;
  monthlyRentPaiseSnapshot?: number;
  waterfall: CheckoutSettlementWaterfall | null;
  mode?: EstimatedSettlementPreview['mode'];
  settlementDocument?: SettlementStatementDocumentModel | null;
  noticeRentCoveredDays?: number;
  noticeChargeableDays?: number;
  deductionPaise?: number;
  notice?: import('@/src/lib/vacating/noticeDeductionPresentation').NoticeSettlementDisplay | null;
  className?: string;
};

export function ResidentMoveOutSettlementStory({
  noticeGivenDate,
  vacatingDate,
  vacatingStatus,
  durationMode,
  depositHeldPaise,
  monthlyRentPaise,
  monthlyRentPaiseSnapshot,
  waterfall,
  mode,
  settlementDocument = null,
  noticeRentCoveredDays,
  noticeChargeableDays,
  deductionPaise,
  notice = null,
  className = '',
}: ResidentMoveOutSettlementStoryProps) {
  const story = useMemo(
    () =>
      buildResidentMoveOutSettlementStory({
        noticeGivenDate,
        vacatingDate,
        vacatingStatus,
        durationMode,
        depositHeldPaise,
        monthlyRentPaise,
        monthlyRentPaiseSnapshot,
        waterfall,
        mode,
        notice,
        noticeRentCoveredDays,
        noticeChargeableDays,
        deductionPaise,
      }),
    [
      noticeGivenDate,
      vacatingDate,
      vacatingStatus,
      durationMode,
      depositHeldPaise,
      monthlyRentPaise,
      monthlyRentPaiseSnapshot,
      waterfall,
      mode,
      notice,
      noticeRentCoveredDays,
      noticeChargeableDays,
      deductionPaise,
    ],
  );

  if (!story) return null;

  const { moveOutDetails, refund } = story;

  return (
    <div className={`space-y-4 ${className}`}>
      <ApgCard tier="account" className="overflow-hidden border-emerald-300 bg-gradient-to-br from-emerald-50 to-white p-0">
        <div className="px-5 py-6 text-center">
          <div className="mb-2 flex justify-center">
            <NoticeBadge story={story} />
          </div>
          <p className="text-xs font-medium uppercase tracking-wide text-emerald-800/80">
            {RESIDENT_STORY_LABELS.expectedDepositRefund}
          </p>
          <p className="mt-2 text-3xl font-bold tabular-nums text-emerald-800">
            {refund.showApproxPrefix ? '≈ ' : ''}
            {paiseToInr(refund.expectedDepositRefundPaise)}
          </p>
          {moveOutDetails.moveOutDate ? (
            <p className="mt-2 text-sm text-zinc-600">
              Leaving {formatDate(moveOutDetails.moveOutDate)}
            </p>
          ) : null}
        </div>
        {refund.showPendingChecklist ? (
          <div className="border-t border-emerald-200/80 bg-white/80 px-5 py-4 text-left">
            <p className="text-sm font-medium text-zinc-900">
              Final refund will be calculated after:
            </p>
            <ul className="mt-2 space-y-1.5 text-sm text-zinc-700">
              {refund.pendingItems.map((item) => (
                <li key={item} className="flex gap-2">
                  <span className="text-emerald-600" aria-hidden>
                    ✓
                  </span>
                  {item}
                </li>
              ))}
            </ul>
            <p className="mt-3 text-xs text-zinc-500">
              {RESIDENT_STORY_LABELS.pendingDeductionsNote}
            </p>
          </div>
        ) : null}
      </ApgCard>

      {settlementDocument ? (
        <FinancialDocumentCollapsibleSection
          surface="resident"
          title={RESIDENT_STORY_LABELS.detailedBreakdown}
        >
          <ResidentSettlementDetailedBreakdown document={settlementDocument} />
        </FinancialDocumentCollapsibleSection>
      ) : null}
    </div>
  );
}
