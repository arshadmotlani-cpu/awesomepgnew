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

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 text-sm">
      <span className="text-zinc-600">{label}</span>
      <span className="font-medium tabular-nums text-zinc-900">{value}</span>
    </div>
  );
}

function MoneyLine({
  label,
  amountPaise,
  deduct,
  narrativeOnly,
}: {
  label: string;
  amountPaise: number;
  deduct?: boolean;
  narrativeOnly?: boolean;
}) {
  const value = narrativeOnly
    ? '—'
    : deduct && amountPaise > 0
      ? `−${paiseToInr(amountPaise)}`
      : paiseToInr(amountPaise);

  return (
    <div className="flex items-center justify-between gap-3 text-sm">
      <span className="text-zinc-700">{label}</span>
      <span
        className={`tabular-nums font-semibold ${
          narrativeOnly ? 'text-emerald-700' : deduct ? 'text-rose-700' : 'text-zinc-900'
        }`}
      >
        {value}
      </span>
    </div>
  );
}

function FlowArrow() {
  return (
    <div className="flex justify-center py-1 text-zinc-300" aria-hidden>
      ↓
    </div>
  );
}

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

  const { moveOutDetails, payments, moneyFlowSteps, deposit, refund } = story;

  return (
    <div className={`space-y-4 ${className}`}>
      <ApgCard tier="account" className="p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-semibold text-zinc-900">
            {RESIDENT_STORY_LABELS.moveOutDetails}
          </h3>
          <NoticeBadge story={story} />
        </div>
        <dl className="mt-4 space-y-3">
          {moveOutDetails.noticeSubmittedDate ? (
            <DetailRow
              label={RESIDENT_STORY_LABELS.noticeSubmitted}
              value={formatDate(moveOutDetails.noticeSubmittedDate)}
            />
          ) : null}
          {moveOutDetails.moveOutDate ? (
            <DetailRow
              label={moveOutDetails.moveOutDateLabel}
              value={formatDate(moveOutDetails.moveOutDate)}
            />
          ) : null}
          {story.noticeApplies ? (
            <>
              <DetailRow
                label={RESIDENT_STORY_LABELS.requiredNotice}
                value={`${moveOutDetails.requiredNoticeDays} days`}
              />
              <DetailRow
                label={RESIDENT_STORY_LABELS.noticeGiven}
                value={`${moveOutDetails.noticeGivenDays} days`}
              />
              <DetailRow
                label={RESIDENT_STORY_LABELS.noticeShort}
                value={`${moveOutDetails.noticeShortDays} days`}
              />
            </>
          ) : null}
        </dl>
      </ApgCard>

      <ApgCard tier="account" className="p-5">
        <h3 className="text-sm font-semibold text-zinc-900">{RESIDENT_STORY_LABELS.moneyYouPaid}</h3>
        <div className="mt-4 space-y-2.5 border-t border-zinc-100 pt-4">
          <MoneyLine label={RESIDENT_STORY_LABELS.monthlyRent} amountPaise={payments.monthlyRentPaise} />
          <MoneyLine
            label={RESIDENT_STORY_LABELS.securityDeposit}
            amountPaise={payments.securityDepositPaise}
          />
          <div className="flex items-center justify-between gap-3 border-t border-zinc-100 pt-2.5 text-sm">
            <span className="font-semibold text-zinc-900">{RESIDENT_STORY_LABELS.totalPaid}</span>
            <span className="text-lg font-bold tabular-nums text-zinc-900">
              {paiseToInr(payments.totalPaidPaise)}
            </span>
          </div>
        </div>
      </ApgCard>

      <ApgCard tier="account" className="p-5">
        <h3 className="text-sm font-semibold text-zinc-900">
          {RESIDENT_STORY_LABELS.howMoneyWasUsed}
        </h3>
        <div className="mt-4 border-t border-zinc-100 pt-4">
          {moneyFlowSteps.map((step, index) => (
            <div key={step.id}>
              <MoneyLine
                label={step.label}
                amountPaise={step.amountPaise}
                narrativeOnly={step.narrativeOnly}
              />
              {index < moneyFlowSteps.length - 1 ? <FlowArrow /> : null}
            </div>
          ))}
        </div>
      </ApgCard>

      <ApgCard tier="account" className="border-emerald-200/80 p-5">
        <h3 className="text-sm font-semibold text-emerald-900">
          {RESIDENT_STORY_LABELS.securityDepositSection}
        </h3>
        <div className="mt-4 space-y-2.5 border-t border-emerald-100 pt-4">
          <MoneyLine
            label={RESIDENT_STORY_LABELS.depositReceived}
            amountPaise={deposit.receivedPaise}
          />
          {deposit.noticeFromDepositPaise > 0 ? (
            <MoneyLine
              label={RESIDENT_STORY_LABELS.lessNoticePolicyCharge}
              amountPaise={deposit.noticeFromDepositPaise}
              deduct
            />
          ) : null}
          {deposit.electricityPaise > 0 ? (
            <MoneyLine
              label={RESIDENT_STORY_LABELS.electricityCharge}
              amountPaise={deposit.electricityPaise}
              deduct
            />
          ) : null}
          {deposit.damagePaise > 0 ? (
            <MoneyLine
              label={RESIDENT_STORY_LABELS.damageCharge}
              amountPaise={deposit.damagePaise}
              deduct
            />
          ) : null}
          {deposit.tailRentPaise > 0 ? (
            <MoneyLine
              label={RESIDENT_STORY_LABELS.rentThroughMoveOut}
              amountPaise={deposit.tailRentPaise}
              deduct
            />
          ) : null}
          <div className="flex items-center justify-between gap-3 border-t border-emerald-100 pt-2.5 text-sm">
            <span className="font-semibold text-emerald-900">
              {RESIDENT_STORY_LABELS.remainingDeposit}
            </span>
            <span className="text-lg font-bold tabular-nums text-emerald-800">
              {paiseToInr(deposit.remainingPaise)}
            </span>
          </div>
        </div>
      </ApgCard>

      <ApgCard tier="account" className="overflow-hidden border-emerald-300 bg-gradient-to-br from-emerald-50 to-white p-0">
        <div className="px-5 py-6 text-center">
          <p className="text-xs font-medium uppercase tracking-wide text-emerald-800/80">
            {RESIDENT_STORY_LABELS.expectedDepositRefund}
          </p>
          <p className="mt-2 text-3xl font-bold tabular-nums text-emerald-800">
            {refund.showApproxPrefix ? '≈ ' : ''}
            {paiseToInr(refund.expectedDepositRefundPaise)}
          </p>
          {refund.unusedRentReturnedPaise > 0 ? (
            <p className="mt-2 text-sm text-emerald-900">
              {RESIDENT_STORY_LABELS.plusUnusedRentReturned}{' '}
              <span className="font-semibold tabular-nums">
                {paiseToInr(refund.unusedRentReturnedPaise)}
              </span>
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
