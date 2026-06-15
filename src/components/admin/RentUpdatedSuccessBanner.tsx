import { RentUpdatedWhatsAppButton } from '@/src/components/admin/RentUpdatedWhatsAppButton';
import { paiseToInr } from '@/src/lib/format';

export function RentUpdatedSuccessBanner({
  fromPaise,
  toPaise,
  paymentLinkUrl,
  linkError,
  customerName,
  customerPhone,
  pgName,
}: {
  fromPaise: number;
  toPaise: number;
  paymentLinkUrl?: string;
  linkError?: boolean;
  customerName: string;
  customerPhone: string;
  pgName: string;
}) {
  return (
    <div className="mb-6 rounded-xl border border-sky-400/30 bg-sky-500/10 px-4 py-3 text-sm text-sky-100">
      <p className="font-semibold">
        Rent updated — {paiseToInr(fromPaise)} → {paiseToInr(toPaise)}/mo
      </p>
      <p className="mt-1 text-xs">
        Pending invoices and action items were synced.
        {paymentLinkUrl
          ? ' Payment link generated — share with the resident below.'
          : linkError
            ? ' Could not generate payment link (check UPI QR in PG settings). WhatsApp still works if phone is on file.'
            : null}
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        {customerPhone ? (
          <RentUpdatedWhatsAppButton
            customerName={customerName}
            phone={customerPhone}
            pgName={pgName}
            newAmountPaise={toPaise}
            paymentLinkUrl={paymentLinkUrl ?? ''}
          />
        ) : (
          <span className="text-xs text-sky-200/80">Add a phone number to enable WhatsApp.</span>
        )}
        {paymentLinkUrl ? (
          <a
            href={paymentLinkUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-medium text-white hover:bg-white/10"
          >
            Open payment link →
          </a>
        ) : null}
      </div>
    </div>
  );
}
