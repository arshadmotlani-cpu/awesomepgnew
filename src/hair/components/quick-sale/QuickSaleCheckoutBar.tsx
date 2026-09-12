'use client';

import Link from 'next/link';
import { QuickSalePaymentPanel } from '@/src/hair/components/quick-sale/QuickSalePaymentPanel';
import { Button } from '@/src/hair/components/ui/button';
import { formatInrFromPaise } from '@/src/hair/lib/money';
import type { BasketFlags, PaymentEntry } from '@/src/hair/domain/basket/types';
import type { PricedBasket } from '@/src/hair/domain/basket/types';

type Props = {
  customerId: string;
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
  linesCount: number;
  error: string | null;
  onChangePayments: (payments: PaymentEntry[]) => void;
  onChangeFlags: (flags: BasketFlags) => void;
  onHoldBill: () => void;
  onCompleteSale: () => void;
};

export function QuickSaleCheckoutBar({
  customerId,
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
  linesCount,
  error,
  onChangePayments,
  onChangeFlags,
  onHoldBill,
  onCompleteSale,
}: Props) {
  const combinedDiscountPaise =
    priced.totals.lineDiscountPaise + Math.max(0, membershipDiscountPaise);

  return (
    <footer className="qs-compact-checkout" data-testid="qs-checkout-bar">
      <div className="qs-compact-checkout-totals">
        <div className="qs-compact-checkout-total-row">
          <span>Subtotal</span>
          <span className="tabular-nums">{formatInrFromPaise(priced.totals.subtotalBasePaise)}</span>
        </div>
        {combinedDiscountPaise > 0 ? (
          <div className="qs-compact-checkout-total-row qs-compact-checkout-discount">
            <span>Discount</span>
            <span className="tabular-nums">−{formatInrFromPaise(combinedDiscountPaise)}</span>
          </div>
        ) : null}
        <div className="qs-compact-checkout-total-row">
          <span>GST</span>
          <span className="tabular-nums">{formatInrFromPaise(priced.totals.taxPaise)}</span>
        </div>
        <div className="qs-compact-checkout-total-row qs-compact-checkout-grand">
          <span>TOTAL</span>
          <span className="tabular-nums">{formatInrFromPaise(priced.totals.grandTotalPaise)}</span>
        </div>
      </div>

      <div className="qs-compact-checkout-payment">
        <QuickSalePaymentPanel
          variant="compact"
          grandTotalPaise={priced.totals.grandTotalPaise}
          payments={payments}
          flags={flags}
          locked={workspaceLocked}
          onChangePayments={onChangePayments}
          onChangeFlags={onChangeFlags}
        />
      </div>

      <div className="qs-compact-checkout-meta">
        {customerOutstandingPaise > 0 ? (
          <section className="qs-customer-outstanding" data-testid="qs-customer-outstanding">
            <p className="qs-compact-outstanding-label">Customer outstanding</p>
            <p className="qs-compact-outstanding-amt tabular-nums">
              {formatInrFromPaise(customerOutstandingPaise)}
            </p>
            <p className="qs-customer-outstanding-note">Not included in this invoice total</p>
            <Link href={`/customers/${customerId}`} className="qs-view-dues-link">
              View dues
            </Link>
          </section>
        ) : null}

        {error ? <p className="qs-checkout-error">{error}</p> : null}

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
              checkoutSubmitting || holdSubmitting || linesCount === 0 || !canCompleteSale
            }
            className="qs-complete-sale"
            data-testid="qs-confirm-sale"
            onClick={onCompleteSale}
          >
            {checkoutSubmitting ? 'Processing…' : 'Complete Sale'}
          </Button>
        </div>
      </div>
    </footer>
  );
}
