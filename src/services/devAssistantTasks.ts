import { eq } from 'drizzle-orm';
import { db } from '@/src/db/client';
import { devAssistantTaskEvents, devAssistantTasks } from '@/src/db/schema/devAssistant';
import type { DevAssistantTaskStatus } from '@/src/lib/devAssistant/types';

export async function appendTaskEvent(
  taskId: string,
  status: DevAssistantTaskStatus,
  message: string,
  detail?: Record<string, unknown>,
) {
  await db.insert(devAssistantTaskEvents).values({
    taskId,
    status,
    message,
    detail: detail ?? null,
  });
  await db
    .update(devAssistantTasks)
    .set({ status, updatedAt: new Date() })
    .where(eq(devAssistantTasks.id, taskId));
}
