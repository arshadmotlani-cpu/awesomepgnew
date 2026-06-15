import { NextRequest } from 'next/server';
import { getAdminSession } from '@/src/lib/auth/session';
import { canAccessDevAssistant } from '@/src/lib/auth/devAssistantAccess';
import { getDevAssistantTask, listDevAssistantTasks } from '@/src/services/devAssistant';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

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

  const taskId = req.nextUrl.searchParams.get('taskId');
  if (taskId) {
    const task = await getDevAssistantTask(session.adminId, taskId);
    if (!task) return Response.json({ ok: false, error: 'Not found' }, { status: 404 });
    return Response.json({ ok: true, data: task });
  }

  const tasks = await listDevAssistantTasks(session.adminId);
  return Response.json({ ok: true, data: { tasks } });
}
