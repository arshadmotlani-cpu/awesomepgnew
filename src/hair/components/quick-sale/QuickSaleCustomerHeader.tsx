'use client';

import { useState, type ReactNode } from 'react';
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

function Sep() {
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

  const metaParts: ReactNode[] = [
    <span key="name" className="qs-compact-customer-name">{customer.fullName}</span>,
    <Sep key="s1" />,
    <span key="id" className="tabular-nums">{customer.customerCode ?? '—'}</span>,
    <Sep key="s2" />,
    <span key="phone" className="tabular-nums" data-testid="qs-customer-phone">
      {customer.phone || '—'}
    </span>,
  ];

  if (contextLoading) {
    metaParts.push(<Sep key="s3" />, <span key="ctx">Loading…</span>);
  } else if (contextError) {
    metaParts.push(<Sep key="s3" />, <span key="err" className="text-orange-400">{contextError}</span>);
  } else if (context) {
    metaParts.push(
      <Sep key="s3" />,
      <span key="visit">
        Last visit{' '}
        <button type="button" className="qs-customer-field-link" onClick={() => setHistoryOpen(true)}>
          {context.lastVisitLabel}
        </button>
      </span>,
      <Sep key="s4" />,
      <span key="credits">Credits {context.packageCreditsRemaining}</span>,
    );
    if (context.duePaise > 0) {
      metaParts.push(
        <Sep key="s5" />,
        <span key="due" className="qs-compact-customer-due">
          Due {formatInrFromPaise(context.duePaise)}
        </span>,
      );
    }
  }

  return (
    <>
      <section className="qs-compact-customer-header" data-testid="qs-customer-header">
        <p className="qs-compact-customer-line">
          {appointmentId ? (
            <>
              <span className="qs-compact-customer-eyebrow">Appointment</span>
              <Sep />
            </>
          ) : null}
          {metaParts}
        </p>
        <div className="qs-compact-customer-actions">
          <button
            type="button"
            className="qs-compact-action-btn"
            disabled={workspaceLocked}
            onClick={onChangeCustomer}
          >
            Change customer
          </button>
          <button
            type="button"
            className="qs-compact-action-btn qs-compact-action-btn-primary"
            disabled={workspaceLocked}
            onClick={onAvailableServices}
          >
            Available Services
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
