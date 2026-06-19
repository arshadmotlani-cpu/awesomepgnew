import JSZip from 'jszip';
import { getAdminSession } from '@/src/lib/auth/session';
import { adminHasPermission } from '@/src/lib/auth/roles';
import { aadhaarPdfFilename, generateAadhaarPdf } from '@/src/lib/kyc/aadhaarPdf';
import {
  getKycSubmissionForAdmin,
  listApprovedKycSubmissionsForAdmin,
} from '@/src/services/kycAdminAccess';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const session = await getAdminSession();
  if (!session || !adminHasPermission(session.role, 'kyc:write')) {
    return Response.json({ error: 'Forbidden.' }, { status: 403 });
  }

  const approved = await listApprovedKycSubmissionsForAdmin(session);
  if (approved.length === 0) {
    return Response.json({ error: 'No approved KYC records in your scope.' }, { status: 404 });
  }

  const zip = new JSZip();
  const usedNames = new Set<string>();
  let added = 0;

  for (const row of approved) {
    const ctx = await getKycSubmissionForAdmin(session, row.id);
    if (!ctx || ctx.submission.status !== 'approved') continue;
    if (!ctx.submission.aadhaarFrontPath?.trim() || !ctx.submission.aadhaarBackPath?.trim()) {
      continue;
    }

    try {
      const pdfBytes = await generateAadhaarPdf({ context: ctx });
      let filename = aadhaarPdfFilename(ctx.customerName);
      if (usedNames.has(filename)) {
        filename = filename.replace(/\.pdf$/, `-${row.id.slice(0, 8)}.pdf`);
      }
      usedNames.add(filename);
      zip.file(filename, pdfBytes);
      added += 1;
    } catch {
      // Skip records with unreadable images.
    }
  }

  if (added === 0) {
    return Response.json({ error: 'No Aadhaar PDFs could be generated.' }, { status: 404 });
  }

  const zipBytes = await zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' });
  const stamp = new Date().toISOString().slice(0, 10);

  return new Response(Buffer.from(zipBytes), {
    status: 200,
    headers: {
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="aadhaar-approved-${stamp}.zip"`,
      'Cache-Control': 'private, no-store',
    },
  });
}
