import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  isCancelledResidentInvoiceStatus,
  isVisibleResidentInvoiceStatus,
  pendingRentGenerationMessage,
  computeResidentTotalDuePaise,
} from '@/src/lib/residents/residentPortalDisplay';
import { formatPaymentModeLabel } from '@/src/lib/billing/paymentModeLabels';

describe('Phase 1 resident portal SSOT', () => {
  it('pendingRentGenerationMessage uses friendly date wording', () => {
    assert.equal(
      pendingRentGenerationMessage('7 Aug 2026'),
      'Your next rent invoice will be generated on 7 Aug 2026.',
    );
  });

  it('cancelled invoices are excluded from default visible set', () => {
    assert.equal(isCancelledResidentInvoiceStatus('cancelled'), true);
    assert.equal(isVisibleResidentInvoiceStatus('cancelled'), false);
    assert.equal(isVisibleResidentInvoiceStatus('paid'), true);
  });

  it('computeResidentTotalDuePaise sums only payable rows with href', () => {
    const rows = [
      { key: 'a', label: 'Rent', amountPaise: 10_000_00, href: '/pay/1', status: 'Pending' },
      { key: 'b', label: 'Info', amountPaise: 5_000_00, href: null, status: 'Pending' },
      { key: 'c', label: 'Elec', amountPaise: 500_00, href: '/pay/2', status: 'Pending' },
    ];
    assert.equal(computeResidentTotalDuePaise(rows), 10_500_00);
  });

  it('formatPaymentModeLabel maps technical provider codes for residents', () => {
    assert.equal(formatPaymentModeLabel('upi_manual'), 'UPI');
    assert.equal(formatPaymentModeLabel('cash'), 'Cash');
  });
});

describe('Phase 1 resident portal UI dedupe', () => {
  it('ProfileOverviewPanel shows stay facts only — no deposit block', () => {
    const src = readFileSync(
      join(process.cwd(), 'src/components/customer/account/resident/ProfileOverviewPanel.tsx'),
      'utf8',
    );
    assert.match(src, /Monthly rent/);
    assert.doesNotMatch(src, /Deposit required/);
    assert.doesNotMatch(src, /Deposit paid/);
    assert.doesNotMatch(src, /Deposit balance/);
  });

  it('ProfileWalletPanel is the deposit home with simplified cards', () => {
    const src = readFileSync(
      join(process.cwd(), 'src/components/customer/account/resident/ProfileWalletPanel.tsx'),
      'utf8',
    );
    assert.match(src, /Security deposit held/);
    assert.match(src, /Refundable at checkout/);
    assert.doesNotMatch(src, /Deposit details/);
    assert.match(src, /max-md:grid-cols-1/);
  });

  it('ResidentPaymentsV2Hub hides cancelled invoices behind toggle', () => {
    const src = readFileSync(
      join(process.cwd(), 'src/components/customer/account/resident/ResidentPaymentsV2Hub.tsx'),
      'utf8',
    );
    assert.match(src, /showCancelled/);
    assert.match(src, /Show cancelled invoices/);
    assert.match(src, /payableNowTotalPaise/);
    assert.match(src, /Pay all/);
    assert.match(src, /paymentModeLabel/);
  });

  it('resident portal tab data uses SSOT bill builder — not legacy panels', () => {
    const src = readFileSync(
      join(process.cwd(), 'src/services/residentPortalTabData.ts'),
      'utf8',
    );
    assert.match(src, /buildResidentBillRowsFromDetail/);
    assert.match(src, /buildResidentPayableNowRows/);
    assert.match(src, /ensureResidentPayAllPaymentHref/);
    assert.match(src, /resolvePrimaryBooking/);
    const area = readFileSync(
      join(process.cwd(), 'src/components/customer/account/ResidentAreaSection.tsx'),
      'utf8',
    );
    assert.doesNotMatch(area, /ResidentHomePanel/);
    assert.doesNotMatch(area, /ResidentPaymentsHub/);
    assert.doesNotMatch(area, /ResidentWalletView/);
    assert.doesNotMatch(area, /ResidentOutstandingBillsCard/);
  });

  it('invoiceDocumentModel imports shared payment mode labels', () => {
    const src = readFileSync(
      join(process.cwd(), 'src/lib/billing/invoiceDocumentModel.ts'),
      'utf8',
    );
    assert.match(src, /from '@\/src\/lib\/billing\/paymentModeLabels'/);
    assert.doesNotMatch(src, /function formatPaymentModeLabel/);
  });

  it('payment history back link targets Profile wallet sub-tab', () => {
    const src = readFileSync(
      join(process.cwd(), 'app/(customer)/account/resident/history/[bookingId]/page.tsx'),
      'utf8',
    );
    assert.match(src, /residentProfileHref\('wallet'\)/);
    assert.match(src, /Back to Profile → Wallet/);
  });
});

describe('Phase 1 resident portal mobile polish hooks', () => {
  it('wallet and bill cards include max-md layout classes', () => {
    const wallet = readFileSync(
      join(process.cwd(), 'src/components/customer/account/resident/ProfileWalletPanel.tsx'),
      'utf8',
    );
    const payments = readFileSync(
      join(process.cwd(), 'src/components/customer/account/resident/ResidentPaymentsV2Hub.tsx'),
      'utf8',
    );
    assert.match(wallet, /max-md:/);
    assert.match(payments, /max-md:/);
    assert.match(payments, /w-full/);
  });
});
