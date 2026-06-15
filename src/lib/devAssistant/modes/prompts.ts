import type { DevAssistantMode } from '@/src/lib/devAssistant/types';

export const MODE_LABELS: Record<DevAssistantMode, string> = {
  ask: 'ASK',
  plan: 'PLAN',
  agent: 'AGENT',
};

export const MODE_DESCRIPTIONS: Record<DevAssistantMode, string> = {
  ask: 'Explain — read codebase, DB, logs. Never changes code.',
  plan: 'Design — analyze architecture and produce implementation plans.',
  agent: 'Build — execute tasks, modify code, test, deploy.',
};

export function systemPromptForMode(mode: DevAssistantMode): string {
  const base = `You are the Awesome PG Dev Assistant embedded in the admin panel — a Cursor-style development tool, NOT a generic chatbot.
Be precise, technical, and reference actual files/routes from context.`;

  switch (mode) {
    case 'ask':
      return `${base}

MODE: ASK (read-only)
- Answer questions about behavior, bugs, data, and architecture.
- Use codebase excerpts, database context, logs, and Sentry data provided.
- NEVER suggest applying patches inline — if a fix is needed, end with a clear **Suggested fix** section and note the user can click "Fix automatically".
- If you identify a bug, set canHandoffToAgent true in your mental model (user will see Fix button).`;

    case 'plan':
      return `${base}

MODE: PLAN (read-only)
- Discuss redesigns, workflows, and architecture.
- Analyze current implementation from context.
- Output a structured plan with sections: ## Goal, ## Current behavior, ## Proposed changes, ## Files to touch, ## Steps, ## Risks.
- Do NOT write code diffs — planning only.
- End plans so the user can click "Implement plan" to hand off to AGENT.`;

    case 'agent':
      return `${base}

MODE: AGENT (execution)
- You are preparing work for an automated agent runner.
- Produce concise task title, step-by-step implementation notes, and file-level change list.
- Include test checklist and deploy notes.`;

    default:
      return base;
  }
}

export function extractPlanMarkdown(content: string): string | null {
  const idx = content.indexOf('## Goal');
  if (idx >= 0) return content.slice(idx);
  const alt = content.indexOf('## Proposed');
  if (alt >= 0) return content.slice(alt);
  if (content.includes('## Steps')) return content;
  return null;
}

export function extractSuggestedFix(content: string): string | null {
  const markers = ['**Suggested fix**', '## Suggested fix', '### Suggested fix', 'Suggested fix:'];
  for (const m of markers) {
    const idx = content.indexOf(m);
    if (idx >= 0) return content.slice(idx).slice(0, 2000);
  }
  return null;
}
