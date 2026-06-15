import type {
  DevAssistantCompletionInput,
  DevAssistantCompletionResult,
  DevAssistantProvider,
} from '@/src/lib/devAssistant/providers/types';
import { formatDebugContextForPrompt } from '@/src/lib/devAssistant/contextBuilder';
import { MODE_LABELS } from '@/src/lib/devAssistant/modes/prompts';

export class StubDevAssistantProvider implements DevAssistantProvider {
  id = 'stub' as const;

  isConfigured() {
    return true;
  }

  async complete(input: DevAssistantCompletionInput): Promise<DevAssistantCompletionResult> {
    const mode = input.mode ?? 'ask';
    const lastUser = [...input.messages].reverse().find((m) => m.role === 'user');
    const userText = lastUser?.content ?? '';
    const ctxBlock = input.enrichedContextBlock ?? formatDebugContextForPrompt(input.context);

    if (mode === 'plan') {
      return {
        content: [
          `## Goal\n${userText}\n`,
          `## Current behavior\nBased on \`${input.context.pathname}\`, review the modules listed in enriched context.`,
          `## Proposed changes\n- Define data model changes\n- Update admin UI\n- Add tests\n`,
          `## Files to touch\n${input.context.pathname.includes('deposit') ? '- src/services/deposits.ts\n- app/(admin)/admin/deposits/' : '- See codebase context below'}`,
          `## Steps\n1. Audit current flow\n2. Implement changes\n3. Run build\n4. Deploy\n`,
          `## Risks\n- Billing consistency\n- Migration required\n`,
          `\n*Set OPENAI_API_KEY for full PLAN responses.*`,
        ].join('\n'),
        provider: 'stub',
        model: 'plan-stub',
      };
    }

    if (mode === 'agent') {
      return {
        content: [
          `## Implementation notes (stub)\n`,
          `Task: ${userText.slice(0, 200)}\n`,
          `1. Read ${input.context.pageName} handlers\n2. Apply fix\n3. npm run build\n4. Deploy via Vercel hook\n`,
          `\nConnect OPENAI_API_KEY + DEV_ASSISTANT_AGENT_WEBHOOK_URL for full agent execution.`,
        ].join('\n'),
        provider: 'stub',
        model: 'agent-stub',
      };
    }

    const hints: string[] = [];
    if (input.context.recentErrors.length > 0) {
      hints.push(`${input.context.recentErrors.length} browser error(s) captured.`);
    }
    if (input.context.entity.bedCode || input.context.entity.bedId) {
      hints.push(`Bed context: ${input.context.entity.bedCode ?? input.context.entity.bedId}`);
    }

    return {
      content: [
        `**${MODE_LABELS.ask}** · ${input.context.pageName}`,
        '',
        userText ? `**Q:** ${userText}` : '',
        '',
        hints.length ? hints.map((h) => `- ${h}`).join('\n') : '- No errors captured yet.',
        '',
        input.context.recentErrors.length > 0
          ? `**Suggested fix**\nInspect the failing API route and matching service file for ${input.context.pathname}. Use **Fix automatically** to create an AGENT task.`
          : '',
        '',
        '---',
        '```',
        ctxBlock.slice(0, 1800),
        '```',
        '',
        '*Add OPENAI_API_KEY for code-aware answers with full codebase context.*',
      ]
        .filter(Boolean)
        .join('\n'),
      provider: 'stub',
      model: 'ask-stub',
    };
  }
}
