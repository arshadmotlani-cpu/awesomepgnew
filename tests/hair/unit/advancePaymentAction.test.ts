/**
 * Advance Payment action contracts — permission, tenant, receipt identifiers.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import {
  ADVANCE_RECEIVE_PERMISSION,
  ADVANCE_RECEIVE_PERMISSION_DENIED_MESSAGE,
} from '@/src/hair/lib/advancePaymentPermissions';

const root = process.cwd();

function read(rel: string) {
  return readFileSync(join(root, rel), 'utf8');
}

test('advance receive permission SSOT is billing checkout action', () => {
  assert.equal(ADVANCE_RECEIVE_PERMISSION, 'action:billing.checkout');
  assert.match(ADVANCE_RECEIVE_PERMISSION_DENIED_MESSAGE, /checkout/i);
});

test('submitAdvancePaymentAction uses checkout permission inside try/catch with tenant ctx', () => {
  const src = read('src/hair/actions/advancePayment.ts');
  const fn = src.slice(
    src.indexOf('export async function submitAdvancePaymentAction'),
    src.indexOf('export async function getAdvancePaymentReceiptPreviewAction'),
  );
  assert.match(fn, /try\s*\{/);
  assert.match(fn, /requirePermission\(ADVANCE_RECEIVE_PERMISSION\)/);
  assert.match(fn, /getTenantContextForAction\(\)/);
  assert.match(fn, /recordAdvancePayment\(input, ctx\)/);
  assert.match(fn, /isPermissionError\(e\)/);
  assert.match(fn, /TenantContextError/);
  assert.match(fn, /return \{ error: e\.message \}/);
  assert.match(fn, /invoiceId: result\.invoiceId/);
  assert.match(fn, /reused: result\.reused/);
});

test('searchCustomersForAdvanceAction returns structured errors', () => {
  const src = read('src/hair/actions/advancePayment.ts');
  const fn = src.slice(
    src.indexOf('export async function searchCustomersForAdvanceAction'),
    src.indexOf('export async function submitAdvancePaymentAction'),
  );
  assert.match(fn, /AdvanceCustomerSearchResult/);
  assert.match(fn, /ok: false, error:/);
  assert.match(fn, /requirePermission\(ADVANCE_RECEIVE_PERMISSION\)/);
  assert.match(fn, /searchCustomersForPos\(query, 30, ctx\)/);
});

test('Quick Actions hides Advance Payment when checkout permission missing', () => {
  const src = read('src/hair/components/HairQuickActionsMenu.tsx');
  assert.match(src, /canReceiveAdvance/);
  assert.match(src, /advance_modal' && !canReceiveAdvance\)/);
  assert.match(src, /canReceiveAdvance=\{canReceiveAdvance\}/);
});

test('Advance modal shows permission message and receipt viewer on success', () => {
  const modal = read('src/hair/components/advance-payment/AdvancePaymentModal.tsx');
  assert.match(modal, /advance-payment-permission-denied/);
  assert.match(modal, /AdvancePaymentReceiptViewer/);
  assert.match(modal, /setReceiptInvoiceId\(result\.invoiceId\)/);
  assert.doesNotMatch(modal, /onSuccess=\{\(\) => onClose\(\)\}/);
});

test('Advance form uses advance-scoped customer search', () => {
  const form = read('src/hair/components/advance-payment/AdvancePaymentForm.tsx');
  assert.match(form, /searchSource="advance"/);
});

test('receipt preview action requires checkout permission and advance source', () => {
  const src = read('src/hair/actions/advancePayment.ts');
  const fn = src.slice(src.indexOf('export async function getAdvancePaymentReceiptPreviewAction'));
  assert.match(fn, /requirePermission\(ADVANCE_RECEIVE_PERMISSION\)/);
  assert.match(fn, /source !== 'advance_payment'/);
  assert.match(fn, /printDocumentHtml: buildInvoicePrintHtml/);
});

test('HairAppHeader passes checkout permission to quick actions', () => {
  const src = read('src/hair/components/HairAppHeader.tsx');
  assert.match(src, /hasPermission\(admin, ADVANCE_RECEIVE_PERMISSION\)/);
});

test('advance payment page wires permission to modal via shell when present', () => {
  const shell = read('src/hair/components/advance-payment/AdvancePaymentShell.tsx');
  assert.match(shell, /AdvancePaymentForm/);
});
