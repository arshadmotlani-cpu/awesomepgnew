import { BillingUi } from '@/src/hair/components/billing/BillingUi';
import { listInvoices } from '@/src/hair/services/invoices';

export default async function BillingPage() {
  const invoices = await listInvoices(100);
  return (
    <BillingUi
      invoices={invoices.map((inv) => ({
        id: inv.id,
        invoiceNumber: inv.invoiceNumber,
        customerName: inv.customerName,
        status: inv.status,
        grandTotalPaise: inv.grandTotalPaise,
        amountPaidPaise: inv.amountPaidPaise,
        createdAtIso: inv.createdAt.toISOString(),
        paidAtIso: inv.paidAt ? inv.paidAt.toISOString() : null,
      }))}
    />
  );
}
