import {
  billingMonthLabel,
  buildCollectionWhatsAppUrl,
  buildElectricityCollectionWhatsAppMessage,
  buildRentCollectionWhatsAppMessage,
} from '@/src/lib/billing/invoiceCollectionWhatsApp';
import { buildDepositDueWhatsAppMessage } from '@/src/lib/billing/adminWhatsApp';
import { paiseToInr } from '@/src/lib/format';
import { whatsAppPhoneDigits } from '@/src/lib/kyc/adminWhatsApp';
import type { UnifiedOpsOutstandingLine } from '@/src/services/unifiedOperationsQueue';

function residentGreeting(name: string): string {
  return name.trim().split(/\s+/)[0] || 'there';
}

function pendingPaymentBlock(input: {
  label: string;
  periodLabel: string;
  amountPaise: number;
  paymentUrl: string;
}): string {
  return (
    `${input.label}\n${input.periodLabel}\n` +
    `Amount: ${paiseToInr(input.amountPaise)}\n\n` +
    `Open your payment page:\n${input.paymentUrl}\n\n` +
    `You may pay using:\nQR Code · UPI ID · Exact Amount\n\n` +
    `After payment upload screenshot.`
  );
}

export function buildOperationsPaymentWhatsAppMessage(input: {
  residentName: string;
  pgName: string;
  lines: Array<UnifiedOpsOutstandingLine & { paymentUrl: string }>;
}): string {
  const greeting = residentGreeting(input.residentName);
  if (input.lines.length === 1) {
    const line = input.lines[0]!;
    if (line.kind === 'rent') {
      return buildRentCollectionWhatsAppMessage({
        customerName: input.residentName,
        pgName: input.pgName,
        billingMonth: line.billingMonth ?? null,
        amountPaise: line.amountPaise,
        publicInvoiceUrl: line.paymentUrl,
      });
    }
    if (line.kind === 'electricity') {
      return buildElectricityCollectionWhatsAppMessage({
        customerName: input.residentName,
        billingMonth: line.billingMonth ?? null,
        amountPaise: line.amountPaise,
        publicInvoiceUrl: line.paymentUrl,
      });
    }
    return (
      `Hi ${greeting},\n\n` +
      buildDepositDueWhatsAppMessage({
        customerName: input.residentName,
        pgName: input.pgName,
        amountPaise: line.amountPaise,
        dueDate: line.periodLabel,
        paymentLinkUrl: line.paymentUrl,
      }).replace(/^Hi [^\n]+,\n\n/, '')
    );
  }

  const total = input.lines.reduce((sum, line) => sum + line.amountPaise, 0);
  const sections = input.lines.map((line) =>
    pendingPaymentBlock({
      label: line.categoryLabel,
      periodLabel: line.periodLabel,
      amountPaise: line.amountPaise,
      paymentUrl: line.paymentUrl,
    }),
  );

  return (
    `Hi ${greeting},\n\n` +
    `Your payments are pending at ${input.pgName}.\n\n` +
    `${sections.join('\n\n—\n\n')}\n\n` +
    `Total outstanding: ${paiseToInr(total)}\n\n` +
    `Thank you.`
  );
}

export function buildOperationsPaymentWhatsAppUrl(input: {
  residentPhone: string;
  residentName: string;
  pgName: string;
  lines: Array<UnifiedOpsOutstandingLine & { paymentUrl: string }>;
}): string | null {
  const digits = whatsAppPhoneDigits(input.residentPhone);
  if (!digits) return null;
  const message = buildOperationsPaymentWhatsAppMessage({
    residentName: input.residentName,
    pgName: input.pgName,
    lines: input.lines,
  });
  return buildCollectionWhatsAppUrl({ customerPhone: input.residentPhone, message });
}

export { billingMonthLabel };
