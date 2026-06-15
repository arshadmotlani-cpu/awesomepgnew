import { NextRequest } from 'next/server';
import { getAdminSession } from '@/src/lib/auth/session';
import { canAccessDevAssistant } from '@/src/lib/auth/devAssistantAccess';
import { sendDevAssistantMessage } from '@/src/services/devAssistant';
import type { DevAssistantDebugContext } from '@/src/lib/devAssistant/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function requireDevAssistantSession() {
  const session = await getAdminSession();
  if (!session) return null;
  if (!canAccessDevAssistant(session.role)) return null;
  return session;
}

export async function POST(req: NextRequest) {
  const session = await requireDevAssistantSession();
  if (!session) {
    return Response.json({ ok: false, error: 'Forbidden' }, { status: 403 });
  }

  let body: {
    content?: string;
    conversationId?: string;
    context?: DevAssistantDebugContext;
    screenshotDataUrl?: string | null;
  };
  try {
    body = await req.json();
  } catch {
    return Response.json({ ok: false, error: 'Invalid JSON' }, { status: 400 });
  }

  const content = body.content?.trim();
  if (!content) {
    return Response.json({ ok: false, error: 'Message is required' }, { status: 400 });
  }

  const context: DevAssistantDebugContext = body.context ?? {
    url: '',
    pathname: '',
    pageName: 'Unknown',
    pageTitle: '',
    admin: {
      id: session.adminId,
      email: session.email,
      fullName: session.fullName,
      role: session.role,
    },
    entity: {},
    filters: {},
    browser: { userAgent: '', language: '', platform: '' },
    viewport: { width: 0, height: 0, deviceType: 'desktop' },
    timestamp: new Date().toISOString(),
    recentErrors: [],
    recentFailedRequests: [],
  };

  try {
    const result = await sendDevAssistantMessage({
      adminId: session.adminId,
      conversationId: body.conversationId,
      content,
      context,
      screenshotDataUrl: body.screenshotDataUrl,
    });
    return Response.json({ ok: true, data: result });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Chat failed';
    return Response.json({ ok: false, error: message }, { status: 500 });
  }
}
