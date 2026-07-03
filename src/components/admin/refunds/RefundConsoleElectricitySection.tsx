'use client';

import { useCallback, useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  deductRefundElectricityFromDepositAction,
  loadRefundElectricityDetailAction,
} from '@/app/(admin)/admin/refunds/actions';
import { CheckoutSettlementElectricitySection } from '@/src/components/admin/CheckoutSettlementElectricitySection';
import { posGlassCard } from '@/src/components/admin/expressBooking/expressBookingStyles';
import type { RefundConsoleWorkspaceDTO } from '@/src/lib/refund/refundConsoleDto';
import { paiseToInr } from '@/src/lib/format';
import type { CheckoutSettlementDetail } from '@/src/services/checkoutSettlement';
import type { ElectricityRoomContributionRow } from '@/src/services/electricityRoomContributions';
import { formatDate } from '@/src/lib/format';

export function RefundConsoleElectricitySection({
  workspace,
  onRefresh,
}: {
  workspace: RefundConsoleWorkspaceDTO;
  onRefresh: () => void;
}) {
  const router = useRouter();
  const checkout = workspace.checkout;
  const [detail, setDetail] = useState<CheckoutSettlementDetail | null>(null);
  const [recovery, setRecovery] = useState<ElectricityRoomContributionRow | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [deductError, setDeductError] = useState<string | null>(null);
  const [deductMessage, setDeductMessage] = useState<string | null>(null);
  const [loading, startLoad] = useTransition();
  const [deducting, startDeduct] = useTransition();

  const loadDetail = useCallback(() => {
    if (!checkout) return;
    startLoad(async () => {
      setLoadError(null);
      const result = await loadRefundElectricityDetailAction(workspace.bookingId);
      if (!result.ok) {
        setLoadError(result.error);
        setDetail(null);
        return;
      }
      setDetail(result.detail);
      setRecovery(result.recovery);
    });
  }, [checkout, workspace.bookingId]);

  useEffect(() => {
    loadDetail();
  }, [loadDetail]);

  const handleDeduct = () => {
    if (!checkout || !detail) return;
    setDeductError(null);
    setDeductMessage(null);
    startDeduct(async () => {
      const result = await deductRefundElectricityFromDepositAction({
        bookingId: workspace.bookingId,
        settlementId: checkout.settlementId,
        roomId: detail.roomId ?? '',
        totalBillPaise: detail.electricityTotalBillPaise,
      });
      if (!result.ok) {
        setDeductError(result.error);
        return;
      }
      setDeductMessage(
        result.alreadyApplied
          ? `Electricity recovery already recorded (${paiseToInr(result.amountPaise)}).`
          : `Deducted ${paiseToInr(result.amountPaise)} from deposit and recorded room contribution.`,
      );
      onRefresh();
      loadDetail();
      router.refresh();
    });
  };

  if (!checkout) {
    return (
      <section className={posGlassCard}>
        <h3 className="text-sm font-semibold text-white">Electricity settlement</h3>
        <p className="mt-2 text-sm text-apg-silver">No checkout settlement — electricity recovery unavailable.</p>
      </section>
    );
  }

  return (
    <section className={`${posGlassCard} space-y-4`}>
      <div>
        <h3 className="text-sm font-semibold text-white">Electricity settlement</h3>
        <p className="mt-1 text-xs text-apg-silver">
          Phase 1 — recover electricity from deposit before refund payout. Month-end billing will subtract this
          automatically.
        </p>
      </div>

      {loading && !detail ? (
        <p className="text-sm text-apg-silver">Loading electricity calculator…</p>
      ) : null}
      {loadError ? <p className="text-sm text-rose-300">{loadError}</p> : null}

      {detail ? (
        <>
          <CheckoutSettlementElectricitySection detail={detail} editable operatorMode />
          <div className="flex flex-wrap items-center gap-3 border-t border-white/10 pt-4">
            <button
              type="button"
              disabled={deducting || detail.preview.electricityDeductionPaise <= 0}
              onClick={handleDeduct}
              className="rounded-xl bg-[#FF5A1F] px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
            >
              {deducting ? 'Applying…' : 'Deduct from deposit'}
            </button>
            <p className="text-xs text-apg-silver">
              Deduction:{' '}
              <span className="font-semibold text-white">
                {paiseToInr(detail.preview.electricityDeductionPaise)}
              </span>
              {workspace.wallet.electricityDeductionPaise > 0
                ? ` · Ledger shows ${paiseToInr(workspace.wallet.electricityDeductionPaise)} recovered`
                : ''}
            </p>
          </div>
          {deductError ? <p className="text-sm text-rose-300">{deductError}</p> : null}
          {deductMessage ? <p className="text-sm text-emerald-300">{deductMessage}</p> : null}

          {(recovery || workspace.wallet.electricityDeductionPaise > 0) && (
            <div className="rounded-xl border border-white/10 bg-white/5 p-4">
              <h4 className="text-xs font-semibold uppercase tracking-wide text-apg-silver">
                Electricity recovery history
              </h4>
              <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
                <div>
                  <dt className="text-apg-silver">Calculated share</dt>
                  <dd className="font-semibold text-white">
                    {paiseToInr(detail.preview.electricityDeductionPaise)}
                  </dd>
                </div>
                <div>
                  <dt className="text-apg-silver">Recovered from deposit</dt>
                  <dd className="font-semibold text-white">
                    {paiseToInr(
                      recovery?.amountPaise ?? workspace.wallet.electricityDeductionPaise,
                    )}
                  </dd>
                </div>
                {recovery ? (
                  <>
                    <div>
                      <dt className="text-apg-silver">Recovery date</dt>
                      <dd className="text-white">{formatDate(recovery.contributionDate)}</dd>
                    </div>
                    <div>
                      <dt className="text-apg-silver">Reference</dt>
                      <dd className="font-mono text-xs text-white">{recovery.id.slice(0, 8)}…</dd>
                    </div>
                    {recovery.occupancyStart ? (
                      <div className="sm:col-span-2">
                        <dt className="text-apg-silver">Occupancy period</dt>
                        <dd className="text-white">
                          {formatDate(recovery.occupancyStart)}
                          {recovery.occupancyEnd ? ` → ${formatDate(recovery.occupancyEnd)}` : ''}
                        </dd>
                      </div>
                    ) : null}
                  </>
                ) : workspace.wallet.electricityDeductionPaise > 0 ? (
                  <div className="sm:col-span-2 text-xs text-apg-silver">
                    Deposit ledger shows recovery — contribution record may still be syncing.
                  </div>
                ) : null}
              </dl>
            </div>
          )}
        </>
      ) : null}
    </section>
  );
}
