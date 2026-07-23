import { getAdminSession } from '@/src/lib/auth/session';
import {
  loadSettlementStatementPdfBytes,
  settlementStatementPdfResponse,
} from '@/src/lib/billing/settlementStatementPdfDownload';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(
  _request: Request,
  context: { params: Promise<{ requestId: string }> },
) {
  const { requestId } = await context.params;
  const session = await getAdminSession();
  if (!session) {
    return Response.json({ ok: false, message: 'Sign in required.' }, { status: 401 });
  }

  try {
    const loaded = await loadSettlementStatementPdfBytes(requestId);
    if (!loaded) {
      return Response.json({ ok: false, message: 'Settlement statement not found.' }, { status: 404 });
    }
    return settlementStatementPdfResponse(loaded.bytes, loaded.filename);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'PDF generation failed.';
    console.error('[vacating/settlement-statement/pdf] failed', { requestId, message });
    return Response.json({ ok: false, message }, { status: 500 });
  }
}
