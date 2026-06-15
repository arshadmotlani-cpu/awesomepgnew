import { and, desc, eq, sql } from 'drizzle-orm';
import { db } from '@/src/db/client';
import {
  devAssistantConversations,
  devAssistantMessages,
} from '@/src/db/schema/devAssistant';
import type { DevAssistantDebugContext } from '@/src/lib/devAssistant/types';
import { getDevAssistantProvider } from '@/src/lib/devAssistant/providers';
import type { DevAssistantProviderMessage } from '@/src/lib/devAssistant/providers/types';

function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function conversationGroup(updatedAt: Date): 'today' | 'yesterday' | 'older' {
  const now = new Date();
  const today = startOfDay(now);
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  if (updatedAt >= today) return 'today';
  if (updatedAt >= yesterday) return 'yesterday';
  return 'older';
}

function titleFromMessage(content: string): string {
  const line = content.trim().split('\n')[0] ?? 'New conversation';
  return line.length > 72 ? `${line.slice(0, 69)}…` : line;
}

export async function listDevAssistantConversations(adminId: string) {
  const rows = await db
    .select({
      id: devAssistantConversations.id,
      title: devAssistantConversations.title,
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
    .limit(100);

  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
    messageCount: r.messageCount,
    group: conversationGroup(r.updatedAt),
  }));
}

export async function createDevAssistantConversation(adminId: string, title?: string) {
  const [row] = await db
    .insert(devAssistantConversations)
    .values({
      adminId,
      title: title?.trim() || 'New conversation',
    })
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
  await db
    .delete(devAssistantConversations)
    .where(eq(devAssistantConversations.id, conversationId));
  return true;
}

export async function listDevAssistantMessages(conversationId: string) {
  const rows = await db
    .select()
    .from(devAssistantMessages)
    .where(eq(devAssistantMessages.conversationId, conversationId))
    .orderBy(devAssistantMessages.createdAt);
  return rows.map((m) => ({
    id: m.id,
    role: m.role,
    content: m.content,
    createdAt: m.createdAt.toISOString(),
    screenshotDataUrl: m.screenshotDataUrl,
  }));
}

export async function sendDevAssistantMessage(args: {
  adminId: string;
  conversationId?: string;
  content: string;
  context: DevAssistantDebugContext;
  screenshotDataUrl?: string | null;
}) {
  let conversationId = args.conversationId;
  if (!conversationId) {
    const conv = await createDevAssistantConversation(args.adminId, titleFromMessage(args.content));
    conversationId = conv.id;
  } else {
    const existing = await getDevAssistantConversation(args.adminId, conversationId);
    if (!existing) throw new Error('Conversation not found.');
  }

  const snapshot = {
    ...args.context,
    screenshotAttached: Boolean(args.screenshotDataUrl),
  } as Record<string, unknown>;

  await db.insert(devAssistantMessages).values({
    conversationId,
    role: 'user',
    content: args.content,
    contextSnapshot: snapshot,
    screenshotDataUrl: null,
  });

  const prior = await listDevAssistantMessages(conversationId);
  const providerMessages: DevAssistantProviderMessage[] = prior
    .filter((m) => m.role === 'user' || m.role === 'assistant')
    .map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content }));

  const provider = getDevAssistantProvider();
  const result = await provider.complete({
    messages: providerMessages,
    context: args.context,
    screenshotDataUrl: args.screenshotDataUrl,
  });

  const [assistantRow] = await db
    .insert(devAssistantMessages)
    .values({
      conversationId,
      role: 'assistant',
      content: result.content,
      contextSnapshot: { provider: result.provider, model: result.model },
    })
    .returning();

  const conv = await getDevAssistantConversation(args.adminId, conversationId);
  if (conv && conv.title === 'New conversation' && prior.length === 0) {
    await db
      .update(devAssistantConversations)
      .set({ title: titleFromMessage(args.content), updatedAt: new Date() })
      .where(eq(devAssistantConversations.id, conversationId));
  } else {
    await db
      .update(devAssistantConversations)
      .set({ updatedAt: new Date() })
      .where(eq(devAssistantConversations.id, conversationId));
  }

  return {
    conversationId,
    assistantMessage: {
      id: assistantRow.id,
      role: 'assistant' as const,
      content: assistantRow.content,
      createdAt: assistantRow.createdAt.toISOString(),
    },
    provider: result.provider,
    model: result.model,
  };
}

export async function clearDevAssistantConversation(adminId: string, conversationId: string) {
  const conv = await getDevAssistantConversation(adminId, conversationId);
  if (!conv) return false;
  await db
    .delete(devAssistantMessages)
    .where(eq(devAssistantMessages.conversationId, conversationId));
  await db
    .update(devAssistantConversations)
    .set({ title: 'New conversation', updatedAt: new Date() })
    .where(eq(devAssistantConversations.id, conversationId));
  return true;
}
