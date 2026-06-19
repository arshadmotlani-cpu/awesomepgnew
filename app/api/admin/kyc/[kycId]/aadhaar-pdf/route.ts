import { getAdminSession } from '@/src/lib/auth/session';
import { adminHasPermission } from '@/src/lib/auth/roles';
import { aadhaarPdfFilename, generateAadhaarPdf } from '@/src/lib/kyc/aadhaarPdf';
import { getKycSubmissionForAdmin } from '@/src/services/kycAdminAccess';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(
  _request: Request,
  context: { params: Promise<{ kycId: string }> },
) {
  const session = await getAdminSession();
  if (!session || !adminHasPermission(session.role, 'kyc:write')) {
    return Response.json({ error: 'Forbidden.' }, { status: 403 });
  }

  const { kycId } = await context.params;
  const ctx = await getKycSubmissionForAdmin(session, kycId);
  if (!ctx) {
    return Response.json({ error: 'Not found.' }, { status: 404 });
  }

  if (ctx.submission.status !== 'approved') {
    return Response.json({ error: 'KYC is not approved.' }, { status: 400 });
  }

  if (!ctx.submission.aadhaarFrontPath?.trim() || !ctx.submission.aadhaarBackPath?.trim()) {
    return Response.json({ error: 'Aadhaar images unavailable.' }, { status: 404 });
  }

  try {
    const pdfBytes = await generateAadhaarPdf({ context: ctx });
    const filename = aadhaarPdfFilename(ctx.customerName);

    return new Response(Buffer.from(pdfBytes), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'private, no-store',
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'PDF generation failed.';
    if (message.includes('unavailable') || message.includes('missing')) {
      return Response.json({ error: 'Aadhaar images unavailable.' }, { status: 404 });
    }
    return Response.json({ error: message }, { status: 500 });
  }
}
