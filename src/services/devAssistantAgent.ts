import { eq } from 'drizzle-orm';
import { db } from '@/src/db/client';
import { devAssistantTasks } from '@/src/db/schema/devAssistant';
import type { DevAssistantTaskStatus } from '@/src/lib/devAssistant/types';
import {
  enrichDevAssistantContext,
  formatEnrichedContextForPrompt,
} from '@/src/lib/devAssistant/serverContext';
import { systemPromptForMode } from '@/src/lib/devAssistant/modes/prompts';
import { getDevAssistantProvider } from '@/src/lib/devAssistant/providers';
import { appendTaskEvent } from '@/src/services/devAssistantTasks';
import type { DevAssistantDebugContext } from '@/src/lib/devAssistant/types';

async function setTaskStatus(
  taskId: string,
  status: DevAssistantTaskStatus,
  message: string,
  patch?: Partial<typeof devAssistantTasks.$inferInsert>,
) {
  await appendTaskEvent(taskId, status, message);
  await db
    .update(devAssistantTasks)
    .set({ ...patch, status, updatedAt: new Date() })
    .where(eq(devAssistantTasks.id, taskId));
}

async function triggerDeployHook(): Promise<{ deploymentId: string | null; version: string | null }> {
  const hook = process.env.VERCEL_DEPLOY_HOOK_URL?.trim();
  if (!hook) {
    return { deploymentId: null, version: null };
  }
  try {
    const res = await fetch(hook, { method: 'POST' });
    const text = await res.text();
    let job: { job?: { id?: string } } = {};
    try {
      job = JSON.parse(text) as { job?: { id?: string } };
    } catch {
      /* plain text response */
    }
    return {
      deploymentId: job.job?.id ?? `hook-${Date.now()}`,
      version: new Date().toISOString().slice(0, 16),
    };
  } catch {
    return { deploymentId: null, version: null };
  }
}

async function triggerAgentWebhook(payload: Record<string, unknown>) {
  const url = process.env.DEV_ASSISTANT_AGENT_WEBHOOK_URL?.trim();
  if (!url) return null;
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function executeAgentTask(taskId: string) {
  const [task] = await db.select().from(devAssistantTasks).where(eq(devAssistantTasks.id, taskId)).limit(1);
  if (!task) return;

  await setTaskStatus(taskId, 'analyzing', 'Collecting page context, logs, and deployment state…');

  const stubContext: DevAssistantDebugContext = {
    url: '',
    pathname: '/admin',
    pageName: 'Agent task',
    pageTitle: task.title,
    admin: { id: task.adminId, email: '', fullName: '', role: 'super_admin' },
    entity: {},
    filters: {},
    browser: { userAgent: '', language: '', platform: '' },
    viewport: { width: 0, height: 0, deviceType: 'desktop' },
    timestamp: new Date().toISOString(),
    recentErrors: [],
    recentFailedRequests: [],
  };

  const enriched = await enrichDevAssistantContext(stubContext);
  const contextBlock = formatEnrichedContextForPrompt(enriched);

  await setTaskStatus(taskId, 'planning', 'Generating implementation plan…');

  const provider = getDevAssistantProvider();
  const planContent = task.planMarkdown
    ? task.planMarkdown
    : (
        await provider.complete({
          messages: [{ role: 'user', content: task.instruction }],
          context: stubContext,
          mode: 'agent',
          systemPromptExtra: systemPromptForMode('agent'),
          enrichedContextBlock: contextBlock,
        })
      ).content;

  if (!task.planMarkdown) {
    await db
      .update(devAssistantTasks)
      .set({ planMarkdown: planContent, updatedAt: new Date() })
      .where(eq(devAssistantTasks.id, taskId));
  }

  await setTaskStatus(taskId, 'implementing', 'Running implementation…');

  const implResult = await provider.complete({
    messages: [
      { role: 'user', content: task.instruction },
      { role: 'assistant', content: planContent },
      {
        role: 'user',
        content:
          'Produce IMPLEMENTATION NOTES: exact files to change, function names, and step-by-step edits. If DEV_ASSISTANT_AGENT_WEBHOOK is configured, format as machine-readable task payload.',
      },
    ],
    context: stubContext,
    mode: 'agent',
    systemPromptExtra: systemPromptForMode('agent'),
    enrichedContextBlock: contextBlock,
  });

  const webhookOk = await triggerAgentWebhook({
    taskId,
    title: task.title,
    instruction: task.instruction,
    plan: planContent,
    implementationNotes: implResult.content,
    git: enriched.git,
  });

  await db
    .update(devAssistantTasks)
    .set({
      implementationNotes: implResult.content,
      updatedAt: new Date(),
    })
    .where(eq(devAssistantTasks.id, taskId));

  await setTaskStatus(
    taskId,
    'implementing',
    webhookOk
      ? 'Implementation dispatched to external agent runner'
      : 'Implementation plan ready — connect DEV_ASSISTANT_AGENT_WEBHOOK_URL for auto-apply',
    { implementationNotes: implResult.content },
  );

  await setTaskStatus(taskId, 'testing', 'Running validation checks…');

  let testNote = 'Validation: review implementation notes and run CI locally.';
  if (process.env.DEV_ASSISTANT_RUN_LINT === '1') {
    try {
      const { execSync } = await import('node:child_process');
      execSync('npm run lint', { encoding: 'utf8', timeout: 120_000, stdio: 'pipe' });
      testNote = 'Lint passed.';
    } catch (err) {
      testNote = `Lint reported issues: ${err instanceof Error ? err.message.slice(0, 200) : 'see logs'}`;
    }
  }

  await setTaskStatus(taskId, 'testing', testNote);

  await setTaskStatus(taskId, 'deploying', 'Triggering deployment…');

  const deploy = await triggerDeployHook();
  const deployMsg = deploy.deploymentId
    ? `Deploy triggered (${deploy.deploymentId})`
    : 'Deploy skipped — set VERCEL_DEPLOY_HOOK_URL to auto-deploy';

  await setTaskStatus(taskId, 'deploying', deployMsg);

  await db
    .update(devAssistantTasks)
    .set({
      status: 'completed',
      resultSummary: webhookOk
        ? 'Task completed — external agent notified, deploy triggered if configured.'
        : 'Task completed — implementation plan stored. Connect agent webhook for auto-code-apply.',
      deploymentId: deploy.deploymentId,
      deploymentVersion: deploy.version,
      completedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(devAssistantTasks.id, taskId));

  await appendTaskEvent(taskId, 'completed', 'Task completed successfully', {
    deploymentId: deploy.deploymentId,
  });
}
