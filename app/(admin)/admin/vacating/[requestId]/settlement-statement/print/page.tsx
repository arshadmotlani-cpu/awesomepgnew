import { notFound } from 'next/navigation';
import { SettlementStatementDocument } from '@/src/components/billing/SettlementStatementDocument';
import { loadSettlementStatementForVacating } from '@/src/lib/vacating/settlementStatementLoader';
import { requireAdminSession } from '@/src/lib/auth/guards';

export const dynamic = 'force-dynamic';

export default async function VacatingSettlementStatementPrintPage({
  params,
}: {
  params: Promise<{ requestId: string }>;
}) {
  const { requestId } = await params;
  await requireAdminSession('/admin/vacating');
  const document = await loadSettlementStatementForVacating(requestId);
  if (!document) notFound();

  return (
    <div className="min-h-screen bg-white p-6 print:p-0">
      <SettlementStatementDocument document={document} variant="resident" embed="page" />
    </div>
  );
}
