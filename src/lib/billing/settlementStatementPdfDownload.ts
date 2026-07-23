import {
  generateSettlementStatementPdf,
  settlementStatementPdfFilename,
} from '@/src/lib/billing/settlementStatementPdf';
import { loadSettlementStatementForVacating } from '@/src/lib/vacating/settlementStatementLoader';

export { settlementStatementPdfDownloadHref } from '@/src/lib/billing/settlementStatementPdfLinks';

export async function loadSettlementStatementPdfBytes(
  vacatingRequestId: string,
): Promise<{ bytes: Uint8Array; filename: string; statementNumber: string } | null> {
  const document = await loadSettlementStatementForVacating(vacatingRequestId);
  if (!document) return null;
  const bytes = await generateSettlementStatementPdf(document);
  return {
    bytes,
    filename: settlementStatementPdfFilename(document.statementNumber),
    statementNumber: document.statementNumber,
  };
}

export function settlementStatementPdfResponse(bytes: Uint8Array, filename: string): Response {
  return new Response(Buffer.from(bytes), {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'private, no-store',
    },
  });
}
