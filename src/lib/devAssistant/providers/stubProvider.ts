import type {
  DevAssistantCompletionInput,
  DevAssistantCompletionResult,
  DevAssistantProvider,
} from '@/src/lib/devAssistant/providers/types';
import { formatDebugContextForPrompt } from '@/src/lib/devAssistant/contextBuilder';

const SYSTEM_PROMPT = `You are the Awesome PG internal AI Developer Assistant embedded in the admin panel.
You help the operator debug bugs, fix UI issues, improve workflows, and plan features while they test the site.
Be concise, actionable, and specific. Reference the auto-collected debug context.
Suggest exact files, routes, or admin pages when relevant.
If screenshot is attached, describe what you see and what might be wrong.`;

export class StubDevAssistantProvider implements DevAssistantProvider {
  id = 'stub' as const;

  isConfigured() {
    return true;
  }

  async complete(input: DevAssistantCompletionInput): Promise<DevAssistantCompletionResult> {
    const lastUser = [...input.messages].reverse().find((m) => m.role === 'user');
    const userText = lastUser?.content ?? '';
    const ctxBlock = formatDebugContextForPrompt(input.context);

    const hints: string[] = [];
    if (input.context.recentErrors.length > 0) {
      hints.push(
        `I see ${input.context.recentErrors.length} recent error(s) on **${input.context.pageName}**. Check the browser console and API responses first.`,
      );
    }
    if (input.context.recentFailedRequests.length > 0) {
      hints.push(
        `There ${input.context.recentFailedRequests.length === 1 ? 'is' : 'are'} ${input.context.recentFailedRequests.length} failed network request(s) — inspect the Network tab for those endpoints.`,
      );
    }
    if (input.screenshotDataUrl) {
      hints.push('Screenshot attached — use it to pinpoint the visual/UI issue.');
    }

    const body = [
      `**Page:** ${input.context.pageName} (\`${input.context.pathname}\`)`,
      '',
      userText ? `**Your message:** ${userText}` : '',
      '',
      hints.length > 0 ? hints.map((h) => `- ${h}`).join('\n') : '- No errors captured yet. Describe what you expected vs what happened.',
      '',
      '---',
      '*Connect `OPENAI_API_KEY` (or another provider) for full AI responses. Context was collected automatically:*',
      '',
      '```',
      ctxBlock.slice(0, 2000),
      ctxBlock.length > 2000 ? '…(truncated)' : '',
      '```',
    ]
      .filter(Boolean)
      .join('\n');

    return { content: body, provider: 'stub', model: 'context-only' };
  }
}
