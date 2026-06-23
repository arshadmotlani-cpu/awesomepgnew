import { Suspense } from 'react';
import { ModuleBreadcrumbs } from '@/src/components/admin/ModuleBreadcrumbs';
import { InvoiceDailySummary } from '@/src/components/admin/InvoiceDailySummary';
import { InvoiceDayList, InvoiceFinancialTimeline } from '@/src/components/admin/InvoiceFinancialTimeline';
import { InvoiceDayNav } from '@/src/components/admin/InvoiceDayNav';
import { PageHeader } from '@/src/components/admin/PageHeader';
import { ADMIN_MODULES, moduleHref } from '@/src/lib/admin/navigation';
import { resolveSelectedDay } from '@/src/lib/billing/dayNavigation';
import { getInvoiceCommandCenterData } from '@/src/services/invoiceCommandCenter';

export const dynamic = 'force-dynamic';

export default async function InvoicesPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>;
}) {
  const sp = await searchParams;
  const selectedDate = resolveSelectedDay(sp.date);
  const data = await getInvoiceCommandCenterData(selectedDate);

  return (
    <>
      <ModuleBreadcrumbs
        items={[
          { label: 'Overview', href: moduleHref('overview') },
          { label: ADMIN_MODULES.invoices.label },
        ]}
      />
      <PageHeader
        title="Invoice Command Center"
        description="Daily financial source of truth — collections, deductions, invoices, and timeline for the selected day."
        actions={
          <Suspense fallback={null}>
            <InvoiceDayNav selectedDate={selectedDate} />
          </Suspense>
        }
      />

      <section className="mb-8">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-apg-silver">
          Daily summary · {selectedDate}
        </h2>
        <InvoiceDailySummary summary={data.summary} />
      </section>

      <section className="mb-8">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-apg-silver">
          Financial timeline
        </h2>
        <InvoiceFinancialTimeline events={data.timeline} />
      </section>

      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-apg-silver">
          Invoices for this day
        </h2>
        <InvoiceDayList invoices={data.invoicesForDay} selectedDate={selectedDate} />
      </section>
    </>
  );
}
