import { and, desc, eq, sql } from 'drizzle-orm';
import { db } from '@/src/db/client';
import {
  devAssistantConversations,
  devAssistantMessages,
  devAssistantTaskEvents,
  devAssistantTasks,
} from '@/src/db/schema/devAssistant';
import type { DevAssistantMessageMetadata } from '@/src/db/schema/devAssistant';
import type {
  DevAssistantDebugContext,
  DevAssistantMode,
  DevAssistantTaskDetail,
  DevAssistantTaskStatus,
  DevAssistantTaskSummary,
  DevAssistantWorkspaceMessage,
} from '@/src/lib/devAssistant/types';
import {
  enrichDevAssistantContext,
  formatEnrichedContextForPrompt,
} from '@/src/lib/devAssistant/serverContext';
import {
  extractPlanMarkdown,
  extractSuggestedFix,
  systemPromptForMode,
} from '@/src/lib/devAssistant/modes/prompts';
import { getDevAssistantProvider } from '@/src/lib/devAssistant/providers';
import type { DevAssistantProviderMessage } from '@/src/lib/devAssistant/providers/types';
import { executeAgentTask } from '@/src/services/devAssistantAgent';
import { appendTaskEvent } from '@/src/services/devAssistantTasks';

function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function conversationGroup(updatedAt: Date): 'today' | 'yesterday' | 'older' {
  const today = startOfDay(new Date());
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  if (updatedAt >= today) return 'today';
  if (updatedAt >= yesterday) return 'yesterday';
  return 'older';
}

function titleFromText(content: string): string {
  const line = content.trim().split('\n')[0] ?? 'Dev workspace';
  return line.length > 72 ? `${line.slice(0, 69)}…` : line;
}

export async function getOrCreateWorkspace(adminId: string, conversationId?: string) {
  if (conversationId) {
    const [existing] = await db
      .select()
      .from(devAssistantConversations)
      .where(
        and(
          eq(devAssistantConversations.id, conversationId),
          eq(devAssistantConversations.adminId, adminId),
        ),
      )
      .limit(1);
    if (existing) return existing;
  }

  const [latest] = await db
    .select()
    .from(devAssistantConversations)
    .where(eq(devAssistantConversations.adminId, adminId))
    .orderBy(desc(devAssistantConversations.updatedAt))
    .limit(1);
  if (latest) return latest;

  const [row] = await db
    .insert(devAssistantConversations)
    .values({ adminId, title: 'Dev workspace', activeMode: 'ask' })
    .returning();
  return row;
}

export async function listDevAssistantTasks(adminId: string): Promise<DevAssistantTaskSummary[]> {
  const rows = await db
    .select()
    .from(devAssistantTasks)
    .where(eq(devAssistantTasks.adminId, adminId))
    .orderBy(desc(devAssistantTasks.createdAt))
    .limit(50);

  return rows.map(taskSummaryFromRow);
}

function taskSummaryFromRow(row: typeof devAssistantTasks.$inferSelect): DevAssistantTaskSummary {
  const started = row.startedAt?.getTime() ?? null;
  const completed = row.completedAt?.getTime() ?? null;
  const durationMs = started && completed ? completed - started : null;

  return {
    id: row.id,
    title: row.title,
    status: row.status,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    startedAt: row.startedAt?.toISOString() ?? null,
    completedAt: row.completedAt?.toISOString() ?? null,
    durationMs,
    deploymentVersion: row.deploymentVersion,
    resultSummary: row.resultSummary,
    errorMessage: row.errorMessage,
  };
}

export async function getDevAssistantTask(
  adminId: string,
  taskId: string,
): Promise<DevAssistantTaskDetail | null> {
  const [row] = await db
    .select()
    .from(devAssistantTasks)
    .where(and(eq(devAssistantTasks.id, taskId), eq(devAssistantTasks.adminId, adminId)))
    .limit(1);
  if (!row) return null;

  const events = await db
    .select()
    .from(devAssistantTaskEvents)
    .where(eq(devAssistantTaskEvents.taskId, taskId))
    .orderBy(devAssistantTaskEvents.createdAt);

  return {
    ...taskSummaryFromRow(row),
    instruction: row.instruction,
    planMarkdown: row.planMarkdown,
    implementationNotes: row.implementationNotes,
    deploymentId: row.deploymentId,
    events: events.map((e) => ({
      id: e.id,
      status: e.status as DevAssistantTaskStatus,
      message: e.message,
      createdAt: e.createdAt.toISOString(),
    })),
  };
}

export async function getActiveTaskForConversation(
  adminId: string,
  conversationId: string,
): Promise<DevAssistantTaskDetail | null> {
  const [row] = await db
    .select()
    .from(devAssistantTasks)
    .where(
      and(
        eq(devAssistantTasks.conversationId, conversationId),
        eq(devAssistantTasks.adminId, adminId),
        sql`${devAssistantTasks.status} NOT IN ('completed', 'failed', 'cancelled')`,
      ),
    )
    .orderBy(desc(devAssistantTasks.updatedAt))
    .limit(1);
  if (!row) return null;
  return getDevAssistantTask(adminId, row.id);
}

export async function loadWorkspaceMessages(
  conversationId: string,
): Promise<DevAssistantWorkspaceMessage[]> {
  const rows = await db
    .select()
    .from(devAssistantMessages)
    .where(eq(devAssistantMessages.conversationId, conversationId))
    .orderBy(devAssistantMessages.createdAt);

  return rows.map((m) => ({
    id: m.id,
    role: m.role,
    mode: (m.mode ?? 'ask') as DevAssistantMode,
    content: m.content,
    createdAt: m.createdAt.toISOString(),
    metadata: m.metadata as DevAssistantMessageMetadata | null,
    screenshotDataUrl: m.screenshotDataUrl,
  }));
}

export async function createAgentTask(args: {
  adminId: string;
  conversationId: string;
  instruction: string;
  title?: string;
  planMarkdown?: string;
  sourceMessageId?: string;
}): Promise<{ taskId: string }> {
  const [task] = await db
    .insert(devAssistantTasks)
    .values({
      adminId: args.adminId,
      conversationId: args.conversationId,
      sourceMessageId: args.sourceMessageId ?? null,
      title: args.title ?? titleFromText(args.instruction),
      instruction: args.instruction,
      planMarkdown: args.planMarkdown ?? null,
      status: 'analyzing',
      startedAt: new Date(),
    })
    .returning();

  await appendTaskEvent(task.id, 'analyzing', 'Task created — starting analysis');

  await db
    .update(devAssistantConversations)
    .set({ activeMode: 'agent', updatedAt: new Date() })
    .where(eq(devAssistantConversations.id, args.conversationId));

  void executeAgentTask(task.id).catch(async (err) => {
    await db
      .update(devAssistantTasks)
      .set({
        status: 'failed',
        errorMessage: err instanceof Error ? err.message : String(err),
        completedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(devAssistantTasks.id, task.id));
    await appendTaskEvent(task.id, 'failed', 'Agent execution failed', {
      error: String(err),
    });
  });

  return { taskId: task.id };
}

export async function sendWorkspaceMessage(args: {
  adminId: string;
  conversationId?: string;
  mode: DevAssistantMode;
  content: string;
  context: DevAssistantDebugContext;
  screenshotDataUrl?: string | null;
}) {
  const conv = await getOrCreateWorkspace(args.adminId, args.conversationId);
  const conversationId = conv.id;

  await db
    .update(devAssistantConversations)
    .set({ activeMode: args.mode, updatedAt: new Date() })
    .where(eq(devAssistantConversations.id, conversationId));

  if (args.mode === 'agent') {
    const { taskId } = await createAgentTask({
      adminId: args.adminId,
      conversationId,
      instruction: args.content,
    });

    await db.insert(devAssistantMessages).values({
      conversationId,
      role: 'user',
      content: args.content,
      mode: 'agent',
      contextSnapshot: args.context as unknown as Record<string, unknown>,
    });

    const assistantContent = `**Agent task started**\n\nTracking task progress live. Switch to the task panel to see status updates.`;
    const [assistantRow] = await db
      .insert(devAssistantMessages)
      .values({
        conversationId,
        role: 'assistant',
        content: assistantContent,
        mode: 'agent',
        metadata: { relatedTaskId: taskId },
      })
      .returning();

    return {
      conversationId,
      mode: 'agent' as const,
      userMessage: { id: 'local', role: 'user' as const, content: args.content },
      assistantMessage: {
        id: assistantRow.id,
        role: 'assistant' as const,
        content: assistantRow.content,
        createdAt: assistantRow.createdAt.toISOString(),
        metadata: { relatedTaskId: taskId },
      },
      taskId,
    };
  }

  const enriched = await enrichDevAssistantContext(args.context);
  const contextBlock = formatEnrichedContextForPrompt(enriched);

  await db.insert(devAssistantMessages).values({
    conversationId,
    role: 'user',
    content: args.content,
    mode: args.mode,
    contextSnapshot: enriched as unknown as Record<string, unknown>,
    screenshotDataUrl: null,
  });

  const prior = await loadWorkspaceMessages(conversationId);
  const providerMessages: DevAssistantProviderMessage[] = prior
    .filter((m) => m.role === 'user' || m.role === 'assistant')
    .map((m) => ({ role: m.role, content: m.content }));

  const provider = getDevAssistantProvider();
  const systemExtra = systemPromptForMode(args.mode);

  const result = await provider.complete({
    messages: providerMessages,
    context: args.context,
    screenshotDataUrl: args.screenshotDataUrl,
    mode: args.mode,
    systemPromptExtra: systemExtra,
    enrichedContextBlock: contextBlock,
  });

  const planMarkdown = args.mode === 'plan' ? extractPlanMarkdown(result.content) : null;
  const suggestedFix = args.mode === 'ask' ? extractSuggestedFix(result.content) : null;
  const canHandoff =
    args.mode === 'ask' &&
    Boolean(suggestedFix || enriched.recentErrors.length > 0 || result.content.toLowerCase().includes('bug'));

  const metadata: DevAssistantMessageMetadata = {
    planMarkdown: planMarkdown ?? undefined,
    suggestedFix: suggestedFix ?? undefined,
    canHandoffToAgent: canHandoff,
    canImplementPlan: args.mode === 'plan' && Boolean(planMarkdown ?? result.content.includes('## Steps')),
    issueSummary: canHandoff ? titleFromText(args.content) : undefined,
  };

  const [assistantRow] = await db
    .insert(devAssistantMessages)
    .values({
      conversationId,
      role: 'assistant',
      content: result.content,
      mode: args.mode,
      metadata,
      contextSnapshot: { provider: result.provider, model: result.model },
    })
    .returning();

  if (conv.title === 'Dev workspace' || conv.title === 'New conversation') {
    await db
      .update(devAssistantConversations)
      .set({ title: titleFromText(args.content), updatedAt: new Date() })
      .where(eq(devAssistantConversations.id, conversationId));
  } else {
    await db
      .update(devAssistantConversations)
      .set({ updatedAt: new Date() })
      .where(eq(devAssistantConversations.id, conversationId));
  }

  return {
    conversationId,
    mode: args.mode,
    assistantMessage: {
      id: assistantRow.id,
      role: 'assistant' as const,
      content: assistantRow.content,
      createdAt: assistantRow.createdAt.toISOString(),
      metadata,
    },
    provider: result.provider,
  };
}

export async function handoffToAgent(args: {
  adminId: string;
  conversationId: string;
  sourceMessageId: string;
  kind: 'implement_plan' | 'fix_automatically';
}) {
  const [msg] = await db
    .select()
    .from(devAssistantMessages)
    .where(eq(devAssistantMessages.id, args.sourceMessageId))
    .limit(1);
  if (!msg) throw new Error('Source message not found');

  const meta = msg.metadata as DevAssistantMessageMetadata | null;
  const instruction =
    args.kind === 'implement_plan'
      ? `Implement this plan:\n\n${meta?.planMarkdown ?? msg.content}`
      : `Fix this issue automatically:\n\n${meta?.suggestedFix ?? msg.content}\n\nOriginal context:\n${msg.content.slice(0, 1500)}`;

  const title =
    args.kind === 'implement_plan'
      ? titleFromText(meta?.planMarkdown ?? msg.content)
      : meta?.issueSummary ?? 'Auto-fix from ASK';

  return createAgentTask({
    adminId: args.adminId,
    conversationId: args.conversationId,
    instruction,
    title,
    planMarkdown: meta?.planMarkdown ?? undefined,
    sourceMessageId: args.sourceMessageId,
  });
}


export async function createDevAssistantConversation(adminId: string) {
  const [row] = await db
    .insert(devAssistantConversations)
    .values({ adminId, title: 'Dev workspace', activeMode: 'ask' })
    .returning();
  return row;
}

export async function getDevAssistantConversation(adminId: string, conversationId: string) {
  const [row] = await db
    .select()
    .from(devAssistantConversations)
    .where(
      and(
        eq(devAssistantConversations.id, conversationId),
        eq(devAssistantConversations.adminId, adminId),
      ),
    )
    .limit(1);
  return row ?? null;
}

export async function deleteDevAssistantConversation(adminId: string, conversationId: string) {
  const conv = await getDevAssistantConversation(adminId, conversationId);
  if (!conv) return false;
  await db.delete(devAssistantConversations).where(eq(devAssistantConversations.id, conversationId));
  return true;
}

export async function clearDevAssistantConversation(adminId: string, conversationId: string) {
  const conv = await getDevAssistantConversation(adminId, conversationId);
  if (!conv) return false;
  await db
    .delete(devAssistantMessages)
    .where(eq(devAssistantMessages.conversationId, conversationId));
  await db
    .update(devAssistantConversations)
    .set({ title: 'Dev workspace', updatedAt: new Date() })
    .where(eq(devAssistantConversations.id, conversationId));
  return true;
}

export async function listDevAssistantMessages(conversationId: string) {
  return loadWorkspaceMessages(conversationId);
}

export async function listDevAssistantConversations(adminId: string) {
  const rows = await db
    .select({
      id: devAssistantConversations.id,
      title: devAssistantConversations.title,
      activeMode: devAssistantConversations.activeMode,
      createdAt: devAssistantConversations.createdAt,
      updatedAt: devAssistantConversations.updatedAt,
      messageCount: sql<number>`(
        SELECT count(*)::int FROM dev_assistant_messages m
        WHERE m.conversation_id = ${devAssistantConversations.id}
      )`,
    })
    .from(devAssistantConversations)
    .where(eq(devAssistantConversations.adminId, adminId))
    .orderBy(desc(devAssistantConversations.updatedAt))
    .limit(20);

  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    activeMode: r.activeMode as DevAssistantMode,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
    messageCount: r.messageCount,
    group: conversationGroup(r.updatedAt),
  }));
}

export { appendTaskEvent } from '@/src/services/devAssistantTasks';
