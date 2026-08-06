import { generateVendorStatementPdf, vendorStatementPdfFilename } from '@/src/hair/lib/vendorStatementPdf';
import { getVendorStatement } from '@/src/hair/services/vendorBrain';

export async function loadVendorStatementPdfBytes(
  vendorId: string,
  period: { from: string; to: string },
): Promise<{ bytes: Uint8Array; filename: string } | null> {
  const statement = await getVendorStatement(vendorId, period);
  if (!statement) return null;
  const bytes = await generateVendorStatementPdf(statement);
  return {
    bytes,
    filename: vendorStatementPdfFilename(statement.vendor.name, period.from, period.to),
  };
}

export function vendorStatementPdfResponse(bytes: Uint8Array, filename: string): Response {
  return new Response(Buffer.from(bytes), {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'private, no-store',
    },
  });
}

export { vendorStatementPdfHref } from '@/src/hair/lib/vendorStatementLinks';
