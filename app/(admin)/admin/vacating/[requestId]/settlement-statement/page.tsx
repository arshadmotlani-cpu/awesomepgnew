import Link from 'next/link';
import { notFound } from 'next/navigation';
import { FinancialDocumentToolbar } from '@/src/components/admin/FinancialDocumentToolbar';
import { ModuleBreadcrumbs } from '@/src/components/admin/ModuleBreadcrumbs';
import { PageHeader } from '@/src/components/admin/PageHeader';
import { SettlementStatementDocument } from '@/src/components/billing/SettlementStatementDocument';
import { moduleHref } from '@/src/lib/admin/navigation';
import {
  settlementStatementPdfDownloadHref,
  settlementStatementPrintHref,
} from '@/src/lib/billing/settlementStatementPdfLinks';
import { getAppUrl } from '@/src/lib/url';
import { loadSettlementStatementForVacating } from '@/src/lib/vacating/settlementStatementLoader';
import { requireAdminSession } from '@/src/lib/auth/guards';

export const dynamic = 'force-dynamic';

export default async function VacatingSettlementStatementPage({
  params,
}: {
  params: Promise<{ requestId: string }>;
}) {
  const { requestId } = await params;
  await requireAdminSession('/admin/vacating');
  const document = await loadSettlementStatementForVacating(requestId);
  if (!document) notFound();

  const pageUrl = `${getAppUrl()}${settlementStatementPrintHref(requestId).replace('/print', '')}`;

  return (
    <>
      <ModuleBreadcrumbs
        items={[
          { label: 'Overview', href: moduleHref('overview') },
          { label: 'Move-outs', href: '/admin/vacating' },
          { label: document.statementNumber },
        ]}
      />
      <PageHeader
        title={document.modeLabel}
        description={`${document.customerName} · ${document.bookingCode}`}
        actions={
          <FinancialDocumentToolbar
            printHref={settlementStatementPrintHref(requestId)}
            pdfHref={settlementStatementPdfDownloadHref(requestId)}
            shareUrl={pageUrl}
            backHref="/admin/vacating"
            backLabel="← Move-outs"
          />
        }
      />
      <div className="max-w-4xl">
        <SettlementStatementDocument document={document} surface="adminPage" embed="page" />
      </div>
      <p className="mt-4 text-sm text-apg-silver">
        <Link href={`/admin/bookings/${document.bookingId}`} className="text-apg-orange hover:underline">
          Open booking financial workspace
        </Link>
      </p>
    </>
  );
}
