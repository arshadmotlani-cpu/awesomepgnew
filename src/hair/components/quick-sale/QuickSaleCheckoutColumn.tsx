'use client';

import Link from 'next/link';
import { QuickSaleBasketTable } from '@/src/hair/components/quick-sale/QuickSaleBasketTable';
import { QuickSaleClearAllConfirm } from '@/src/hair/components/quick-sale/QuickSaleClearAllConfirm';
import { QuickSalePaymentPanel } from '@/src/hair/components/quick-sale/QuickSalePaymentPanel';
import { Button } from '@/src/hair/components/ui/button';
import { formatInrFromPaise } from '@/src/hair/lib/money';
import type { BasketFlags, BasketLine, PaymentEntry } from '@/src/hair/domain/basket/types';
import type { PricedBasket } from '@/src/hair/domain/basket/types';

type Props = {
  customerId: string;
  lines: BasketLine[];
  priced: PricedBasket;
  membershipDiscountPaise: number;
  customerOutstandingPaise: number;
  payments: PaymentEntry[];
  flags: BasketFlags;
  workspaceLocked: boolean;
  checkoutSubmitting: boolean;
  holdSubmitting: boolean;
  canCompleteSale: boolean;
  canHoldBill: boolean;
  hasActiveTransaction: boolean;
  clearAllConfirmOpen: boolean;
  error: string | null;
  staffNames?: Record<string, string>;
  preloadedStaff?: Array<{ id: string; fullName: string }>;
  onStaffNameRegistered: (staffId: string, fullName: string) => void;
  onUpdateLine: (lineId: string, patch: Partial<BasketLine>) => void;
  onRemoveLine: (lineId: string) => void;
  onOpenClearAll: () => void;
  onKeepClearAll: () => void;
  onConfirmClearAll: () => void;
  onChangePayments: (payments: PaymentEntry[]) => void;
  onChangeFlags: (flags: BasketFlags) => void;
  onHoldBill: () => void;
  onCompleteSale: () => void;
};

export function QuickSaleCheckoutColumn({
  customerId,
  lines,
  priced,
  membershipDiscountPaise,
  customerOutstandingPaise,
  payments,
  flags,
  workspaceLocked,
  checkoutSubmitting,
  holdSubmitting,
  canCompleteSale,
  canHoldBill,
  hasActiveTransaction,
  clearAllConfirmOpen,
  error,
  staffNames,
  preloadedStaff,
  onStaffNameRegistered,
  onUpdateLine,
  onRemoveLine,
  onOpenClearAll,
  onKeepClearAll,
  onConfirmClearAll,
  onChangePayments,
  onChangeFlags,
  onHoldBill,
  onCompleteSale,
}: Props) {
  const combinedDiscountPaise =
    priced.totals.lineDiscountPaise + Math.max(0, membershipDiscountPaise);

  return (
    <section className="qs-checkout-column" data-testid="qs-checkout-column">
      <div className="qs-basket-header shrink-0">
        <p className="qs-section-label !mb-0">Basket</p>
        {hasActiveTransaction ? (
          <div className="relative">
            <button
              type="button"
              className="qs-clear-all-trigger rounded px-1 py-0.5 transition hover:bg-white/5 disabled:opacity-40"
              disabled={workspaceLocked}
              data-testid="qs-clear-all-trigger"
              onClick={onOpenClearAll}
            >
              Clear all
            </button>
            {clearAllConfirmOpen ? (
              <QuickSaleClearAllConfirm onKeep={onKeepClearAll} onConfirm={onConfirmClearAll} />
            ) : null}
          </div>
        ) : null}
      </div>

      <div className="qs-checkout-basket">
        <QuickSaleBasketTable
          lines={lines}
          locked={workspaceLocked}
          staffNames={staffNames}
          preloadedStaff={preloadedStaff}
          onStaffNameRegistered={onStaffNameRegistered}
          onUpdateLine={onUpdateLine}
          onRemoveLine={onRemoveLine}
        />
      </div>

      <div className="qs-checkout-summary">
        <section className="qs-sale-totals">
          <p className="qs-section-label">Current sale</p>
          <div className="qs-sale-totals-rows">
            <div className="qs-sale-totals-row">
              <span>Subtotal</span>
              <span className="tabular-nums">{formatInrFromPaise(priced.totals.subtotalBasePaise)}</span>
            </div>
            <div className="qs-sale-totals-row">
              <span>GST</span>
              <span className="tabular-nums">{formatInrFromPaise(priced.totals.taxPaise)}</span>
            </div>
            {combinedDiscountPaise > 0 ? (
              <div className="qs-sale-totals-row qs-sale-totals-discount">
                <span>Discount</span>
                <span className="tabular-nums">−{formatInrFromPaise(combinedDiscountPaise)}</span>
              </div>
            ) : null}
            <div className="qs-sale-totals-row qs-sale-totals-grand">
              <span>TOTAL</span>
              <span className="tabular-nums">{formatInrFromPaise(priced.totals.grandTotalPaise)}</span>
            </div>
          </div>
        </section>

        {customerOutstandingPaise > 0 ? (
          <section className="qs-customer-outstanding" data-testid="qs-customer-outstanding">
            <p className="qs-section-label">Customer outstanding</p>
            <div className="qs-sale-totals-row">
              <span>Previous dues</span>
              <span className="tabular-nums text-fyh-warning">
                {formatInrFromPaise(customerOutstandingPaise)}
              </span>
            </div>
            <p className="qs-customer-outstanding-note">
              Not included in this invoice total
            </p>
            <Link href={`/customers/${customerId}`} className="qs-view-dues-link">
              View dues
            </Link>
          </section>
        ) : null}

        <section className="qs-payment-section">
          <p className="qs-section-label">Payment</p>
          <QuickSalePaymentPanel
            grandTotalPaise={priced.totals.grandTotalPaise}
            payments={payments}
            flags={flags}
            locked={workspaceLocked}
            onChangePayments={onChangePayments}
            onChangeFlags={onChangeFlags}
          />
        </section>

        {error ? (
          <p className="qs-checkout-error">{error}</p>
        ) : null}

        <div className="qs-checkout-actions">
          <Button
            type="button"
            variant="secondary"
            disabled={workspaceLocked || holdSubmitting || !canHoldBill}
            className="qs-hold-bill-btn"
            data-testid="qs-hold-bill"
            onClick={onHoldBill}
          >
            {holdSubmitting ? 'Holding…' : 'Hold Bill'}
          </Button>
          <Button
            type="button"
            disabled={
              checkoutSubmitting || holdSubmitting || lines.length === 0 || !canCompleteSale
            }
            className="qs-complete-sale"
            data-testid="qs-confirm-sale"
            onClick={onCompleteSale}
          >
            {checkoutSubmitting ? 'Processing…' : 'Complete Sale'}
          </Button>
        </div>
      </div>
    </section>
  );
}
