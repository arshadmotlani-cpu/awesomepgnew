import { PublicFyhInvoiceActions } from '@/src/hair/components/billing/PublicFyhInvoiceActions';
import {
  PUBLIC_INVOICE_STYLES,
  buildPublicInvoiceViewModel,
  renderPublicInvoiceSheetHtml,
} from '@/src/hair/lib/publicInvoiceDocument';
import { formatInrFromPaise } from '@/src/hair/lib/money';
import type { InvoiceDetail } from '@/src/hair/services/invoices';

type Props = {
  detail: InvoiceDetail;
};

export function PublicFyhInvoice({ detail }: Props) {
  const vm = buildPublicInvoiceViewModel(detail);
  const sheetHtml = renderPublicInvoiceSheetHtml(detail);

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: PUBLIC_INVOICE_STYLES }} />
      <div className="fyh-invoice-body">
        <div className="fyh-invoice-page">
          <div className="fyh-invoice-toolbar">
            <PublicFyhInvoiceActions
              invoiceNumber={vm.invoiceNumber}
              customerPhone={vm.customerPhone}
              customerName={vm.customerName}
              grandTotalLabel={formatInrFromPaise(detail.invoice.grandTotalPaise)}
            />
          </div>
          <div dangerouslySetInnerHTML={{ __html: sheetHtml }} />
        </div>
      </div>
    </>
  );
}
