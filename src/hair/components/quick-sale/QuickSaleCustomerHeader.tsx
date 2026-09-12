'use client';


import { useState } from 'react';
import { MessageCircle, MoreVertical } from 'lucide-react';
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

function customerInitials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
}

function whatsAppHref(phone: string): string | null {
  const digits = phone.replace(/\D/g, '');
  if (digits.length < 10) return null;
  const normalized = digits.length === 10 ? `91${digits}` : digits;
  return `https://wa.me/${normalized}`;
}

function Field({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="qs-customer-field">
      <span className="qs-customer-field-label">{label}</span>
      <span className={accent ? 'qs-customer-field-value-accent' : 'qs-customer-field-value'}>
        {value}
      </span>
    </div>
  );
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
  const waLink = customer.phone ? whatsAppHref(customer.phone) : null;

  return (
    <>
      <section className="qs-customer-header shrink-0" data-testid="qs-customer-header">
        <div className="qs-customer-header-identity">
          <span className="qs-customer-avatar" aria-hidden="true">
            {customerInitials(customer.fullName) || '?'}
          </span>
          <div className="qs-customer-header-main min-w-0">
            <p className="qs-section-label !mb-0">
              {appointmentId ? 'Appointment' : 'Customer'}
            </p>
            <div className="qs-customer-header-grid">
              <Field label="Name" value={customer.fullName} />
              <Field label="ID" value={customer.customerCode ?? '—'} />
              <div className="qs-customer-field">
                <span className="qs-customer-field-label">Phone</span>
                {customer.phone ? (
                  waLink ? (
                    <a
                      href={waLink}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="qs-customer-phone-link"
                      data-testid="qs-customer-phone"
                    >
                      <MessageCircle className="h-3 w-3" aria-hidden="true" />
                      {customer.phone}
                    </a>
                  ) : (
                    <span className="qs-customer-field-value" data-testid="qs-customer-phone">
                      {customer.phone}
                    </span>
                  )
                ) : (
                  <span className="qs-customer-field-value">—</span>
                )}
              </div>
              {contextLoading ? (
                <Field label="Context" value="Loading…" />
              ) : contextError ? (
                <Field label="Context" value={contextError} />
              ) : context ? (
                <>
                  <div className="qs-customer-field">
                    <span className="qs-customer-field-label">Last visit</span>
                    <button
                      type="button"
                      className="qs-customer-field-link"
                      onClick={() => setHistoryOpen(true)}
                    >
                      {context.lastVisitLabel}
                    </button>
                  </div>
                  <Field label="Pkg credits" value={String(context.packageCreditsRemaining)} />
                  {context.walletPaise > 0 ? (
                    <Field label="Wallet" value={formatInrFromPaise(context.walletPaise)} />
                  ) : null}
                  {context.duePaise > 0 ? (
                    <Field
                      label="Outstanding"
                      value={formatInrFromPaise(context.duePaise)}
                      accent
                    />
                  ) : null}
                </>
              ) : null}
            </div>
          </div>
        </div>
        <div className="qs-customer-header-actions shrink-0">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            disabled={workspaceLocked}
            onClick={onAvailableServices}
          >
            Available Services
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="text-slate-400 hover:text-slate-200"
            disabled={workspaceLocked}
            onClick={onChangeCustomer}
          >
            Change customer
          </Button>
          <div className="relative">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="text-slate-400 hover:text-slate-200"
              disabled={workspaceLocked}
              onClick={onMenuToggle}
              aria-label="Sale actions"
            >
              <MoreVertical className="h-4 w-4" />
            </Button>
            {menuOpen ? (
              <div className="qs-sale-menu">
                <button
                  type="button"
                  disabled={workspaceLocked || !canHoldBill}
                  onClick={onHoldBill}
                >
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
