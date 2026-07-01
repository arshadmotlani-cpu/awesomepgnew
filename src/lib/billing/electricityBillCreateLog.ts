/**
 * Structured logging for room electricity bill creation — visible in Vercel/server logs.
 */

export type ElectricityBillCreateLogStep =
  | 'request_received'
  | 'validation'
  | 'room_resolved'
  | 'occupants_loaded'
  | 'checkout_settled_excluded'
  | 'bill_calculated'
  | 'transaction_started'
  | 'bill_inserted'
  | 'invoices_created'
  | 'invoice_reused_existing'
  | 'ledger_applied'
  | 'transaction_committed'
  | 'unified_sync_scheduled'
  | 'response_returned'
  | 'failed';

export function logElectricityBillCreate(
  step: ElectricityBillCreateLogStep,
  data: Record<string, unknown>,
): void {
  const payload = {
    scope: 'electricity_bill_create',
    step,
    at: new Date().toISOString(),
    ...data,
  };
  if (step === 'failed') {
    console.error(JSON.stringify(payload));
  } else {
    console.log(JSON.stringify(payload));
  }
}
