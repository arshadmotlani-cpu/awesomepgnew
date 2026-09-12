'use client';

import { useState } from 'react';
import { MoreVertical } from 'lucide-react';
import { CustomerVisitHistoryPanel } from '@/src/hair/components/booking/CustomerVisitHistoryPanel';
import { Button } from '@/src/hair/components/ui/button';
import { formatInrFromPaise } from '@/src/hair/lib/money';
import type { PosCustomerHit } from '@/src/hair/services/quickSale';
import type { QuickSaleCustomerContext } from '@/src/hair/components/quick-sale/useQuickSaleCustomerContext';

type Props = {
  customer: PosCustomerHit;
  appointmentId?: string | null;
  contextLoading: boolean;
  contextError: string | null;
  context: QuickSaleCustomerContext | null;
  workspaceLocked: boolean;
  canHoldBill: boolean;
  menuOpen: boolean;
  onAvailableServices: () => void;
  onChangeCustomer: () => void;
  onMenuToggle: () => void;
  onHoldBill: () => void;
  onNewSale: () => void;
  onCancelSale: () => void;
};

function MetaSep() {
  return <span className="qs-compact-sep" aria-hidden="true">·</span>;
}

export function QuickSaleCustomerHeader({
  customer,
  appointmentId,
  contextLoading,
  contextError,
  context,
  workspaceLocked,
  canHoldBill,
  menuOpen,
  onAvailableServices,
  onChangeCustomer,
  onMenuToggle,
  onHoldBill,
  onNewSale,
  onCancelSale,
}: Props) {
  const [historyOpen, setHistoryOpen] = useState(false);
  const packageServicesRemaining = context?.packageCreditsRemaining ?? 0;
  const walletAdvancePaise = context?.walletPaise ?? 0;

  return (
    <>
      <section className="qs-compact-customer-header" data-testid="qs-customer-header">
        <div className="qs-compact-customer-identity">
          {appointmentId ? (
            <span className="qs-compact-customer-eyebrow">Appointment checkout</span>
          ) : null}
          <p className="qs-compact-customer-name">{customer.fullName}</p>
          <p className="qs-compact-customer-meta">
            <span className="tabular-nums">{customer.customerCode ?? '—'}</span>
            <MetaSep />
            <span className="qs-compact-customer-phone tabular-nums" data-testid="qs-customer-phone">
              {customer.phone || '—'}
            </span>
            {contextLoading ? (
              <>
                <MetaSep />
                <span>Loading…</span>
              </>
            ) : contextError ? (
              <>
                <MetaSep />
                <span className="text-orange-400">{contextError}</span>
              </>
            ) : context ? (
              <>
                <MetaSep />
                <span>
                  Last visit:{' '}
                  <button
                    type="button"
                    className="qs-customer-field-link"
                    onClick={() => setHistoryOpen(true)}
                  >
                    {context.lastVisitLabel}
                  </button>
                </span>
                {packageServicesRemaining > 0 ? (
                  <>
                    <MetaSep />
                    <span data-testid="qs-customer-services">
                      Services: <strong>{packageServicesRemaining}</strong>
                    </span>
                  </>
                ) : null}
                {walletAdvancePaise > 0 ? (
                  <>
                    <MetaSep />
                    <span data-testid="qs-customer-advance">
                      Advance:{' '}
                      <strong className="tabular-nums">
                        {formatInrFromPaise(walletAdvancePaise)}
                      </strong>
                    </span>
                  </>
                ) : null}
                {context.duePaise > 0 ? (
                  <>
                    <MetaSep />
                    <span className="qs-compact-customer-due" data-testid="qs-customer-due">
                      Due:{' '}
                      <strong className="tabular-nums">
                        {formatInrFromPaise(context.duePaise)}
                      </strong>
                    </span>
                  </>
                ) : null}
              </>
            ) : null}
          </p>
        </div>
        <div className="qs-compact-customer-actions">
          <button
            type="button"
            className="qs-compact-action-btn qs-compact-action-btn-services"
            disabled={workspaceLocked}
            data-testid="qs-available-services-btn"
            onClick={onAvailableServices}
          >
            Available Services
            {packageServicesRemaining > 0 ? (
              <span className="qs-compact-services-badge" aria-hidden="true">
                {packageServicesRemaining}
              </span>
            ) : null}
          </button>
          <button
            type="button"
            className="qs-compact-action-btn"
            disabled={workspaceLocked}
            onClick={onChangeCustomer}
          >
            Change customer
          </button>
          <div className="relative">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-6 w-6 px-0 text-slate-400"
              disabled={workspaceLocked}
              onClick={onMenuToggle}
              aria-label="Sale actions"
            >
              <MoreVertical className="h-3.5 w-3.5" />
            </Button>
            {menuOpen ? (
              <div className="qs-sale-menu">
                <button type="button" disabled={workspaceLocked || !canHoldBill} onClick={onHoldBill}>
                  Hold bill
                </button>
                <button type="button" disabled={workspaceLocked} onClick={onNewSale}>
                  New sale
                </button>
                <button
                  type="button"
                  className="text-fyh-danger"
                  disabled={workspaceLocked}
                  onClick={onCancelSale}
                >
                  Cancel sale
                </button>
              </div>
            ) : null}
          </div>
        </div>
      </section>

      <CustomerVisitHistoryPanel
        customerId={customer.id}
        customerName={customer.fullName}
        open={historyOpen}
        onClose={() => setHistoryOpen(false)}
      />
    </>
  );
}
