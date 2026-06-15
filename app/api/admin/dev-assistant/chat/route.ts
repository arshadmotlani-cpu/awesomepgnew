import { NextRequest } from 'next/server';
import { getAdminSession } from '@/src/lib/auth/session';
import { canAccessDevAssistant } from '@/src/lib/auth/devAssistantAccess';
import {
  getActiveTaskForConversation,
  getOrCreateWorkspace,
  handoffToAgent,
  loadWorkspaceMessages,
  sendWorkspaceMessage,
} from '@/src/services/devAssistant';
import type { DevAssistantDebugContext, DevAssistantMode } from '@/src/lib/devAssistant/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

async function requireDevAssistantSession() {
  const session = await getAdminSession();
  if (!session) return null;
  if (!canAccessDevAssistant(session.role)) return null;
  return session;
}

export async function GET(req: NextRequest) {
  const session = await requireDevAssistantSession();
  if (!session) {
    return Response.json({ ok: false, error: 'Forbidden' }, { status: 403 });
  }

  const conversationId = req.nextUrl.searchParams.get('conversationId') ?? undefined;
  const conv = await getOrCreateWorkspace(session.adminId, conversationId);
  const [messages, activeTask] = await Promise.all([
    loadWorkspaceMessages(conv.id),
    getActiveTaskForConversation(session.adminId, conv.id),
  ]);

  return Response.json({
    ok: true,
    data: {
      conversationId: conv.id,
      activeMode: conv.activeMode,
      messages,
      activeTask,
    },
  });
}

export async function POST(req: NextRequest) {
  const session = await requireDevAssistantSession();
  if (!session) {
    return Response.json({ ok: false, error: 'Forbidden' }, { status: 403 });
  }

  let body: {
    content?: string;
    conversationId?: string;
    mode?: DevAssistantMode;
    context?: DevAssistantDebugContext;
    screenshotDataUrl?: string | null;
    action?: 'handoff';
    sourceMessageId?: string;
    handoffKind?: 'implement_plan' | 'fix_automatically';
  };

  try {
    body = await req.json();
  } catch {
    return Response.json({ ok: false, error: 'Invalid JSON' }, { status: 400 });
  }

  if (body.action === 'handoff') {
    if (!body.conversationId || !body.sourceMessageId || !body.handoffKind) {
      return Response.json({ ok: false, error: 'Missing handoff params' }, { status: 400 });
    }
    const { taskId } = await handoffToAgent({
      adminId: session.adminId,
      conversationId: body.conversationId,
      sourceMessageId: body.sourceMessageId,
      kind: body.handoffKind,
    });
    const activeTask = await getActiveTaskForConversation(session.adminId, body.conversationId);
    return Response.json({ ok: true, data: { taskId, activeTask } });
  }

  const content = body.content?.trim();
  if (!content) {
    return Response.json({ ok: false, error: 'Message is required' }, { status: 400 });
  }

  const mode = body.mode ?? 'ask';
  const context: DevAssistantDebugContext =
    body.context ??
    ({
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
    } satisfies DevAssistantDebugContext);

  try {
    const result = await sendWorkspaceMessage({
      adminId: session.adminId,
      conversationId: body.conversationId,
      mode,
      content,
      context,
      screenshotDataUrl: body.screenshotDataUrl,
    });
    const activeTask = result.conversationId
      ? await getActiveTaskForConversation(session.adminId, result.conversationId)
      : null;
    return Response.json({ ok: true, data: { ...result, activeTask } });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Request failed';
    return Response.json({ ok: false, error: message }, { status: 500 });
  }
}
