import { NextRequest } from 'next/server';
import { getAdminSession } from '@/src/lib/auth/session';
import { canAccessDevAssistant } from '@/src/lib/auth/devAssistantAccess';
import {
  clearDevAssistantConversation,
  deleteDevAssistantConversation,
  getDevAssistantConversation,
  listDevAssistantMessages,
} from '@/src/services/devAssistant';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type RouteCtx = { params: Promise<{ id: string }> };

async function requireDevAssistantSession() {
  const session = await getAdminSession();
  if (!session) return null;
  if (!canAccessDevAssistant(session.role)) return null;
  return session;
}

export async function GET(_req: NextRequest, ctx: RouteCtx) {
  const session = await requireDevAssistantSession();
  if (!session) {
    return Response.json({ ok: false, error: 'Forbidden' }, { status: 403 });
  }

  const { id } = await ctx.params;
  const conv = await getDevAssistantConversation(session.adminId, id);
  if (!conv) {
    return Response.json({ ok: false, error: 'Not found' }, { status: 404 });
  }

  const messages = await listDevAssistantMessages(id);
  return Response.json({
    ok: true,
    data: {
      conversation: {
        id: conv.id,
        title: conv.title,
        createdAt: conv.createdAt.toISOString(),
        updatedAt: conv.updatedAt.toISOString(),
      },
      messages,
    },
  });
}

export async function DELETE(_req: NextRequest, ctx: RouteCtx) {
  const session = await requireDevAssistantSession();
  if (!session) {
    return Response.json({ ok: false, error: 'Forbidden' }, { status: 403 });
  }

  const { id } = await ctx.params;
  const ok = await deleteDevAssistantConversation(session.adminId, id);
  if (!ok) {
    return Response.json({ ok: false, error: 'Not found' }, { status: 404 });
  }
  return Response.json({ ok: true });
}

export async function PATCH(req: NextRequest, ctx: RouteCtx) {
  const session = await requireDevAssistantSession();
  if (!session) {
    return Response.json({ ok: false, error: 'Forbidden' }, { status: 403 });
  }

  const { id } = await ctx.params;
  let body: { action?: string };
  try {
    body = await req.json();
  } catch {
    return Response.json({ ok: false, error: 'Invalid JSON' }, { status: 400 });
  }

  if (body.action === 'clear') {
    const ok = await clearDevAssistantConversation(session.adminId, id);
    if (!ok) {
      return Response.json({ ok: false, error: 'Not found' }, { status: 404 });
    }
    return Response.json({ ok: true });
  }

  return Response.json({ ok: false, error: 'Unknown action' }, { status: 400 });
}
