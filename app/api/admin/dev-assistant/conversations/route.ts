import { NextRequest } from 'next/server';
import { getAdminSession } from '@/src/lib/auth/session';
import { canAccessDevAssistant } from '@/src/lib/auth/devAssistantAccess';
import {
  createDevAssistantConversation,
  listDevAssistantConversations,
} from '@/src/services/devAssistant';
import { listDevAssistantProviders } from '@/src/lib/devAssistant/providers';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function requireDevAssistantSession() {
  const session = await getAdminSession();
  if (!session) return null;
  if (!canAccessDevAssistant(session.role)) return null;
  return session;
}

export async function GET() {
  const session = await requireDevAssistantSession();
  if (!session) {
    return Response.json({ ok: false, error: 'Forbidden' }, { status: 403 });
  }

  const conversations = await listDevAssistantConversations(session.adminId);
  return Response.json({
    ok: true,
    data: {
      conversations,
      providers: listDevAssistantProviders(),
    },
  });
}

export async function POST(_req: NextRequest) {
  const session = await requireDevAssistantSession();
  if (!session) {
    return Response.json({ ok: false, error: 'Forbidden' }, { status: 403 });
  }

  const conv = await createDevAssistantConversation(session.adminId);
  return Response.json({
    ok: true,
    data: { id: conv.id, title: conv.title, createdAt: conv.createdAt.toISOString() },
  });
}
